import {operationKey} from './resume-operation-v1.mjs';

const canonical = value => JSON.stringify(value, Object.keys(value).sort());
const fail = code => { throw new Error(code); };
const conditional = error => error?.name === 'ConditionalCheckFailedException';

// request is a protected DocumentClient/RPC transport, not an event input.
// A separate namespace prevents operation keys from touching landing reservations.
// This module grants no IAM rights and does not authenticate terminal receipts.
export class DynamoDBOperationLedger {
  constructor({request, table, repository}) {
    if (typeof request !== 'function' || !table || !repository) fail('OPERATION_LEDGER_CONFIG');
    Object.assign(this, {request, table, repository});
  }
  key(key) {
    if (!/^sha256:[a-f0-9]{64}$/.test(key)) fail('OPERATION_KEY_INVALID');
    return {pk:`RESUME_OPERATION_V1#${key}`,sk:'OPERATION'};
  }
  validate(key,binding) {
    if (binding?.repository !== this.repository || operationKey(binding) !== key) fail('OPERATION_KEY_MISMATCH');
  }
  async read(key) {
    const result = await this.request('Get', {TableName:this.table,Key:this.key(key),ConsistentRead:true});
    return result.Item;
  }
  async claim(key,binding,owner) {
    this.validate(key,binding);
    if (typeof owner !== 'string' || !owner) fail('OPERATION_OWNER_REQUIRED');
    try {
      await this.request('Put', {TableName:this.table,Item:{...this.key(key),binding,owner,state:'IN_FLIGHT'},
        ConditionExpression:'attribute_not_exists(pk) AND attribute_not_exists(sk)'});
      return {claimed:true,state:'IN_FLIGHT'};
    } catch(error) { if (!conditional(error)) throw error; }
    const row = await this.read(key);
    if (!row || canonical(row.binding) !== canonical(binding) || !['IN_FLIGHT','SUCCESS','UNKNOWN'].includes(row.state)) fail('OPERATION_LEDGER_BINDING_MISMATCH');
    return {claimed:false,state:row.state,receipt:row.receipt};
  }
  async assertOwner(key,owner) {
    const row = await this.read(key);
    if (!row || row.owner !== owner || row.state !== 'IN_FLIGHT') fail('OPERATION_WRITER_FENCED');
  }
  async finish(key,owner,state,receipt) {
    if (!['SUCCESS','UNKNOWN'].includes(state)) fail('OPERATION_TERMINAL_STATE');
    try {
      await this.request('Update', {TableName:this.table,Key:this.key(key),
        UpdateExpression:'SET #state = :next, receipt = :receipt',
        ConditionExpression:'#owner = :owner AND #state = :flight',
        ExpressionAttributeNames:{'#owner':'owner','#state':'state'},
        ExpressionAttributeValues:{':owner':owner,':flight':'IN_FLIGHT',':next':state,':receipt':receipt}});
    } catch(error) { if (conditional(error)) fail('OPERATION_WRITER_FENCED'); throw error; }
  }
  // Only resumeOperation may call this after protected receipt authentication.
  async reconcileSuccess(key,binding,receipt) {
    this.validate(key,binding);
    try {
      await this.request('Update', {TableName:this.table,Key:this.key(key),
        UpdateExpression:'SET #state = :success, receipt = :receipt',
        ConditionExpression:'binding = :binding AND (#state = :flight OR #state = :unknown)',
        ExpressionAttributeNames:{'#state':'state'},
        ExpressionAttributeValues:{':binding':binding,':flight':'IN_FLIGHT',':unknown':'UNKNOWN',':success':'SUCCESS',':receipt':receipt}});
      return;
    } catch(error) { if (!conditional(error)) throw error; }
    const row = await this.read(key);
    if (!row) return;
    if (row.state !== 'SUCCESS' || canonical(row.binding) !== canonical(binding)) fail('OPERATION_RECONCILIATION_CONFLICT');
  }
}
