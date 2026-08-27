/**
 * A31 — Executive Control Tower Live Integration & Governed Action Gateway
 * Module: action-lock.ts
 *
 * No process-memory lock registry is allowed. A future live gateway must
 * inject a durable/atomic lock store. Legacy call shapes fail closed.
 */

export interface LockEntry { readonly decisionId:string; readonly requestId:string; readonly lockedAt:string; }
export interface ActionLockStore { get(key:string):LockEntry|undefined; set(key:string,entry:LockEntry):void; delete(key:string):void; }
function lockKey(decisionId:string):string { return `a31:lock:${decisionId}`; }
export type LockResult={acquired:true;entry:LockEntry}|{acquired:false;reason:string;existingRequestId:string};

export function acquireActionLock(store:ActionLockStore,decisionId:string,requestId:string):LockResult;
export function acquireActionLock(decisionId:string,requestId:string):LockResult;
export function acquireActionLock(storeOrDecisionId:ActionLockStore|string,decisionIdOrRequestId:string,maybeRequestId?:string):LockResult {
  if (typeof storeOrDecisionId==='string') throw new Error('DURABLE_ACTION_LOCK_STORE_REQUIRED');
  if (!maybeRequestId) throw new Error('REQUEST_ID_REQUIRED');
  const key=lockKey(decisionIdOrRequestId);
  const existing=storeOrDecisionId.get(key);
  if (existing) return {acquired:false,reason:'This decision is already being processed.',existingRequestId:existing.requestId};
  const entry:LockEntry={decisionId:decisionIdOrRequestId,requestId:maybeRequestId,lockedAt:new Date().toISOString()};
  storeOrDecisionId.set(key,entry);
  return {acquired:true,entry};
}

export function releaseActionLock(store:ActionLockStore,decisionId:string,requestId:string):void;
export function releaseActionLock(decisionId:string,requestId:string):void;
export function releaseActionLock(storeOrDecisionId:ActionLockStore|string,decisionIdOrRequestId:string,maybeRequestId?:string):void {
  if (typeof storeOrDecisionId==='string') throw new Error('DURABLE_ACTION_LOCK_STORE_REQUIRED');
  if (!maybeRequestId) throw new Error('REQUEST_ID_REQUIRED');
  const key=lockKey(decisionIdOrRequestId);
  const existing=storeOrDecisionId.get(key);
  if (existing?.requestId===maybeRequestId) storeOrDecisionId.delete(key);
}

export function isDecisionLocked(store:ActionLockStore,decisionId:string):boolean;
export function isDecisionLocked(decisionId:string):boolean;
export function isDecisionLocked(storeOrDecisionId:ActionLockStore|string,maybeDecisionId?:string):boolean {
  if (typeof storeOrDecisionId==='string') throw new Error('DURABLE_ACTION_LOCK_STORE_REQUIRED');
  if (!maybeDecisionId) throw new Error('DECISION_ID_REQUIRED');
  return Boolean(storeOrDecisionId.get(lockKey(maybeDecisionId)));
}
