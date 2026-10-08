import {DynamoDBOperationLedger} from './dynamodb-operation-ledger-v1.mjs';
import {resumeGitHubLifecycle} from './github-lifecycle-resume-v1.mjs';
import {createGitHubLifecycleReadback,createGitHubLifecycleReceiptAuthenticator} from './github-lifecycle-readback-v1.mjs';

// Construct only inside the authenticated protected launcher. Configuration,
// ledger transport, signing keys, authority and native UI executor cannot be
// selected by an RPC event. No default authority or write transport is supplied.
export function createProtectedGitHubLifecycleExecutor({config,request,ledgerRequest,getSigningKey,
  signingPublicKey,authorize,executeNative,writer,readDispatchReceipt,authenticateDispatchReceipt}) {
  if (!config || !config.operationTable || !config.rootMissionId || !config.stageId
      || !Array.isArray(config.enabledOperations) || !config.enabledOperations.length
      || [request,ledgerRequest,getSigningKey,authorize,executeNative].some(v=>typeof v!=='function')
      || typeof writer!=='string' || !writer) throw new Error('GITHUB_LIFECYCLE_EXECUTOR_CONFIG_REQUIRED');
  const repository=config.repository,rootMissionId=config.rootMissionId,stageId=config.stageId;
  const enabledOperations=new Set(config.enabledOperations);
  const ledger=new DynamoDBOperationLedger({request:ledgerRequest,table:config.operationTable,repository});
  const readExternal=createGitHubLifecycleReadback({repository,repositoryId:config.repositoryId,
    repositoryOwner:config.repositoryOwner,request,getSigningKey,readDispatchReceipt,authenticateDispatchReceipt});
  const authenticateReceipt=createGitHubLifecycleReceiptAuthenticator(signingPublicKey);
  return async event => {
    if (!event || Object.keys(event).sort().join(',')!=='operation,payload,target'
        || !enabledOperations.has(event.operation)) throw new Error('GITHUB_LIFECYCLE_EXECUTOR_INPUT_DENIED');
    return resumeGitHubLifecycle({repository,rootMissionId,stageId,operation:event.operation,
      target:event.target,payload:event.payload,owner:writer,ledger,readExternal,authenticateReceipt,authorize,
      execute:async context=>{
        // A lost UI response remains UNKNOWN. This executor never clicks again
        // merely because a timeout occurred; a later readback may reconcile it.
        await executeNative(context);
        const result=await readExternal(context);
        if(result.state!=='SUCCESS') throw new Error('GITHUB_LIFECYCLE_NATIVE_RESULT_UNCONFIRMED');
        return result.receipt;
      }});
  };
}
