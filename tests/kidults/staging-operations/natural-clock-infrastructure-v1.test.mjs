import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const template=JSON.parse(fs.readFileSync('infrastructure/aws/staging/natural-clock-dispatcher-v1.json','utf8'));

test('activation is disabled by default and all five ordered governed slots exist',()=>{
  assert.equal(template.Parameters.ScheduleState.Default,'DISABLED');
  for(const name of ['PoolingSchedule','P0BSchedule','ReserveSchedule','SentinelSchedule','AssuranceSchedule']) {
    assert.equal(template.Resources[name].Type,'AWS::Scheduler::Schedule');
    assert.deepEqual(template.Resources[name].Properties.State,{Ref:'ScheduleState'});
  }
  assert.equal(template.Resources.PoolingSchedule.Properties.ScheduleExpression,'cron(2,32 * * * ? *)');
  assert.equal(template.Resources.P0BSchedule.Properties.ScheduleExpression,'cron(7,37 * * * ? *)');
  assert.equal(template.Resources.ReserveSchedule.Properties.ScheduleExpression,'cron(14,44 * * * ? *)');
  assert.equal(template.Resources.SentinelSchedule.Properties.ScheduleExpression,'cron(23,53 * * * ? *)');
  assert.equal(template.Resources.AssuranceSchedule.Properties.ScheduleExpression,'cron(27,57 * * * ? *)');
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

test('first deployment does not couple Lambda creation to reserved concurrency mutation',()=>{
  assert.equal(Object.hasOwn(template.Resources.Dispatcher.Properties,'ReservedConcurrentExecutions'),false);
  assert.equal(template.Resources.Dispatcher.Properties.Timeout,30);
  assert.equal(template.Resources.Dispatcher.Properties.MemorySize,128);
});

test('Pooling is an authenticated external-clock producer and Reserve cannot report green while waiting',()=>{
  const pooling=fs.readFileSync('.github/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml','utf8');
  assert.match(pooling,/repository_dispatch:\s*\n\s+types: \[kidults\.natural\.clock\.v1\]/);
  assert.match(pooling,/github\.event\.client_payload\.slot == 'POOLING'/);
  assert.match(pooling,/KIDULTS_NATURAL_CLOCK_SLOT: POOLING/);
  assert.match(pooling,/run-natural-clock-intake-v1\.mjs/);
  assert.match(pooling,/kidults-natural-clock-pooling-/);

  const reserve=fs.readFileSync('.github/workflows/kidults-asi-sharded-source-reserve-v1.yml','utf8');
  assert.match(reserve,/name: Enforce producer-ready reserve semantics/);
  assert.match(reserve,/if: env\.KIDULTS_RESERVE_PRODUCER_STATE == 'WAITING_FOR_EXACT_DISCOVERY_PRODUCER'[\s\S]{0,240}exit 1/);
});
