import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const template=JSON.parse(fs.readFileSync('infrastructure/aws/staging/natural-clock-dispatcher-v1.json','utf8'));

test('activation is disabled by default and all four governed slots exist',()=>{
  assert.equal(template.Parameters.ScheduleState.Default,'DISABLED');
  for(const name of ['P0BSchedule','ReserveSchedule','SentinelSchedule','AssuranceSchedule']) {
    assert.equal(template.Resources[name].Type,'AWS::Scheduler::Schedule');
    assert.deepEqual(template.Resources[name].Properties.State,{Ref:'ScheduleState'});
  }
});

test('ledger is encrypted, recoverable, expiring and conditionally consumed by code',()=>{
  const table=template.Resources.Ledger.Properties;
  assert.equal(table.SSESpecification.SSEEnabled,true);
  assert.equal(table.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled,true);
  assert.equal(table.TimeToLiveSpecification.Enabled,true);
  const source=fs.readFileSync('infrastructure/aws/staging/natural-clock-dispatcher-v1.cjs','utf8');
  assert.match(source,/ConditionExpression:'attribute_not_exists\(dispatch_id\)'/);
});

test('scheduler has only invoke authority and dispatcher has no production authority',()=>{
  const scheduler=JSON.stringify(template.Resources.SchedulerRole);
  assert.match(scheduler,/lambda:InvokeFunction/);
  assert.doesNotMatch(scheduler,/dynamodb:|secretsmanager:|iam:|cloudformation:/);
  const dispatcher=JSON.stringify(template.Resources.DispatcherRole);
  assert.doesNotMatch(dispatcher,/s3:Put|cloudformation:|iam:PassRole|execute-api:/);
});
