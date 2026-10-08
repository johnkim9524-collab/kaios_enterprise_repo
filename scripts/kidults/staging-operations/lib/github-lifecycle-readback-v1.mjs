import crypto from 'node:crypto';
import {canonicalJson, sha256} from '../../kpmo/lib/canonical-json-v1.mjs';
import {githubLifecycleBinding} from './github-lifecycle-resume-v1.mjs';
import {operationKey} from './resume-operation-v1.mjs';
import {selectLatestLifecycleReadyEvent} from '../../kpmo/lib/direct-owner-ready-event-v1.mjs';

const fail = code => {throw new Error(`GITHUB_LIFECYCLE_READBACK_DENIED:${code}`);};
const exactKeys = (value, keys) => value && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const nativeOwner = (value, owner) => value?.login === owner && value?.type === 'User';
const validId = value => Number.isSafeInteger(value) && value > 0;
const unknown = () => ({state:'UNKNOWN'});
const absent = () => ({state:'ABSENT'});

// request is an authenticated protected transport. All URLs, methods, bounds
// and timeouts are selected here; no caller endpoint or redirect is followed.
export function createGitHubLifecycleReadback({repository, repositoryId, repositoryOwner, request, getSigningKey}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !validId(repositoryId)
      || repositoryOwner !== repository.split('/')[0] || typeof request !== 'function'
      || typeof getSigningKey !== 'function') fail('CONFIG');
  const api = async path => {
    const response = await request(`https://api.github.com/repos/${repository}${path}`, {
      method:'GET', redirect:'error', signal:AbortSignal.timeout(10000),
      headers:{Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28'}});
    if (!response?.ok) fail('HTTP');
    return response.json();
  };
  const pages = async (path, field) => {
    const values=[];
    for (let page=1;page<=10;page++) {
      const response=await api(`${path}?per_page=100&page=${page}`);
      const rows=field ? response?.[field] : response;
      if (!Array.isArray(rows) || rows.length > 100) fail('PAGINATION_SHAPE');
      values.push(...rows);
      if (rows.length < 100) return values;
    }
    // Truncation cannot prove absence or uniqueness.
    fail('PAGINATION_BOUND');
  };
  return async context => {
    const {operation, target, payload, binding, key}=context;
    const expected=githubLifecycleBinding({repository, rootMissionId:binding?.root_mission_id,
      stageId:binding?.stage_id, operation, target, payload});
    if (canonicalJson(binding)!==canonicalJson(expected) || key!==operationKey(expected)) fail('BINDING');
    const number=target.pull_request;
    const [pr, main, head]=await Promise.all([api(`/pulls/${number}`), api('/branches/main'), api(`/commits/${target.head_sha}`)]);
    if (pr.number!==number || pr.base?.ref!=='main'
        || [pr.base?.repo,pr.head?.repo].some(repo=>repo?.full_name!==repository || repo?.id!==repositoryId)
        || pr.head?.sha!==target.head_sha || head?.sha!==target.head_sha
        || head.commit?.tree?.sha!==target.head_tree_sha) fail('LIVE_TARGET_DRIFT');
    if (operation!=='MERGE_PROTECTED_MAIN' && (pr.state!=='open' || pr.merged===true
        || pr.base?.sha!==target.base_sha || main.commit?.sha!==target.base_sha)) return unknown();
    let evidence;
    if (operation==='READY_FOR_REVIEW') {
      if (!exactKeys(payload,[])) fail('PAYLOAD');
      const timeline=await pages(`/issues/${number}/timeline`);
      const transitions=timeline.filter(v=>['ready_for_review','convert_to_draft','closed','reopened'].includes(v.event));
      if (!transitions.length && pr.draft===true) return absent();
      if (pr.draft!==false) return unknown();
      const ready=selectLatestLifecycleReadyEvent({timeline,repositoryOwner,pullRequest:pr});
      const native=timeline.find(v=>v.id===ready.id);
      if (ready.synthetic_lifecycle_boundary || !ready.direct_repository_owner
          || !nativeOwner(native?.actor,repositoryOwner) || native?.performed_via_github_app!==null
          || !Number.isFinite(Date.parse(head.commit?.committer?.date))
          || Date.parse(ready.created_at)<Date.parse(head.commit.committer.date)) return unknown();
      evidence={kind:'NATIVE_OWNER_READY_EVENT',event_id:ready.id,created_at:ready.created_at};
    } else if (operation==='OWNER_APPROVAL_COMMENT') {
      if (!exactKeys(payload,['body_sha256']) || !/^sha256:[a-f0-9]{64}$/.test(payload.body_sha256)) fail('PAYLOAD');
      const comments=await pages(`/issues/${number}/comments`);
      const matched=comments.filter(c=>sha256(String(c.body))===payload.body_sha256);
      if (!matched.length) return absent();
      if (matched.length!==1) return unknown();
      const c=matched[0];
      if (!validId(c.id) || !nativeOwner(c.user,repositoryOwner) || c.author_association!=='OWNER'
          || c.performed_via_github_app!==null || c.created_at!==c.updated_at) return unknown();
      // The governed handoff remains responsible for approval semantics and
      // expiry. This receipt proves the exact immutable comment was posted.
      evidence={kind:'NATIVE_OWNER_COMMENT_CREATED',comment_id:c.id,created_at:c.created_at,body_sha256:payload.body_sha256};
    } else if (operation==='WORKFLOW_DISPATCH') {
      if (!exactKeys(payload,['workflow_id','run_name','ref']) || !validId(payload.workflow_id)
          || payload.ref!=='main' || typeof payload.run_name!=='string' || !payload.run_name || payload.run_name.length>256) fail('PAYLOAD');
      const runs=await pages(`/actions/workflows/${payload.workflow_id}/runs`,'workflow_runs');
      const matched=runs.filter(r=>r.display_title===payload.run_name && r.event==='workflow_dispatch'
        && r.head_sha===target.base_sha && r.head_branch==='main');
      if (!matched.length) return absent();
      if (matched.length!==1) return unknown();
      const r=matched[0];
      if (!validId(r.id) || r.workflow_id!==payload.workflow_id || r.run_attempt!==1
          || r.repository?.id!==repositoryId || r.repository?.full_name!==repository
          || !nativeOwner(r.actor,repositoryOwner) || !nativeOwner(r.triggering_actor,repositoryOwner)) return unknown();
      evidence={kind:'WORKFLOW_DISPATCH_ACCEPTED_NOT_JOB_COMPLETION',run_id:r.id,run_attempt:r.run_attempt,workflow_id:r.workflow_id};
    } else if (operation==='MERGE_PROTECTED_MAIN') {
      if (!exactKeys(payload,[])) fail('PAYLOAD');
      if (pr.merged!==true) return pr.state==='open' && pr.base?.sha===target.base_sha && main.commit?.sha===target.base_sha ? absent() : unknown();
      if (!nativeOwner(pr.merged_by,repositoryOwner) || !/^[a-f0-9]{40}$/.test(pr.merge_commit_sha)
          || main.commit?.sha!==pr.merge_commit_sha) return unknown();
      const [commit,timeline]=await Promise.all([api(`/commits/${pr.merge_commit_sha}`),pages(`/issues/${number}/timeline`)]);
      const parents=commit?.parents?.map(p=>p.sha);
      const merged=timeline.filter(v=>v.event==='merged' && v.commit_id===pr.merge_commit_sha);
      if (commit.sha!==pr.merge_commit_sha || commit.commit?.tree?.sha!==target.head_tree_sha
          || canonicalJson(parents)!==canonicalJson([target.base_sha,target.head_sha]) || merged.length!==1
          || !validId(merged[0].id) || !Number.isFinite(Date.parse(pr.merged_at))
          || !nativeOwner(merged[0].actor,repositoryOwner) || merged[0].performed_via_github_app!==null) return unknown();
      evidence={kind:'NATIVE_OWNER_MERGE',merge_commit_sha:pr.merge_commit_sha,event_id:merged[0].id,merged_at:pr.merged_at};
    }
    const receipt={id:'kidults-github-lifecycle-operation-receipt-v1',state:'SUCCESS',operation_key:key,
      binding:expected,evidence,production:'HOLD',public:'HOLD',g5:'HOLD'};
    const privateKey=await getSigningKey();
    const signature=crypto.sign('RSA-SHA256',Buffer.from(canonicalJson(receipt)),privateKey).toString('base64');
    return {state:'SUCCESS',receipt:{...receipt,signature}};
  };
}

// The verification key is supplied by the protected launcher, never taken
// from the receipt. Key rotation needs separately trusted old-key handling.
export function createGitHubLifecycleReceiptAuthenticator(publicKey) {
  const key=crypto.createPublicKey(publicKey);
  return async (receipt, context) => {
    if (!exactKeys(receipt,['id','state','operation_key','binding','evidence','production','public','g5','signature'])
        || receipt.operation_key!==context.key || canonicalJson(receipt.binding)!==canonicalJson(context.binding)
        || typeof receipt.signature!=='string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(receipt.signature)) return false;
    const {signature,...signed}=receipt;
    return crypto.verify('RSA-SHA256',Buffer.from(canonicalJson(signed)),key,Buffer.from(signature,'base64'));
  };
}
