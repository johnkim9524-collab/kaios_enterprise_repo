import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const template=JSON.parse(fs.readFileSync('infrastructure/aws/staging/autonomous-internal-landing-v1.json','utf8'));
const capsuleSource=template.Resources.AutonomousLedgerWriterFunction.Properties.Code.ZipFile;
const decoded=spawnSync('python3',['-c',[
  'import ast,base64,bz2,hashlib,json,re,sys',
  'source=json.load(sys.stdin)',
  "payload=re.search(r\"b64decode\\('([^']+)'\\)\",source).group(1)",
  'parts=json.loads(bz2.decompress(base64.b64decode(payload)))',
  "expected=ast.literal_eval(next(line.split('=',1)[1].strip() for line in source.splitlines() if line.startswith('_h = ')))",
  "assert set(parts)==set(expected) and all(hashlib.sha256(value.encode()).hexdigest()==expected[key] for key,value in parts.items())",
  'print(json.dumps(parts))'
].join('\n')],{input:JSON.stringify(capsuleSource),encoding:'utf8'});
assert.equal(decoded.status,0,decoded.stderr);
const sources=JSON.parse(decoded.stdout);
const source=Object.values(sources).join('\n');

test('AWS ledger writer implements all durable canonical state transitions',()=>{
  for(const action of ['CREATE_CANONICAL_CLAIM','TAKEOVER_CANONICAL_CLAIM','COMMIT_CANONICAL_CLAIM','CREATE_CANONICAL_ALIAS'])
    assert.match(source,new RegExp(`action == '${action}'`));
  assert.match(source,/ConditionExpression='#s=:leased AND lease_epoch=:prior AND lease_expires_at_epoch < :now'/);
  assert.match(source,/ConditionExpression='#s=:leased AND run_id=:run AND head_sha=:head AND lease_epoch=:epoch AND lease_expires_at_epoch >= :now'/);
  assert.match(source,/ConsistentRead=True/);
  assert.match(source,/CANONICAL_ALIAS_BINDING_INVALID/);
  assert.match(source,/service_now = int\(datetime\.now\(timezone\.utc\)\.timestamp\(\)\)/);
  assert.match(source,/abs\(now_epoch - service_now\) > 30/);
  assert.match(source,/lease_expires_at < service_now \+ 60 or lease_expires_at > service_now \+ 900/);
});

test('canonical mutation fields are covered by the signed finalizer core',()=>{
  for(const field of ['canonical_key','lease_expires_at_epoch','prior_lease_epoch','now_epoch','canonical_receipt_digest','lease_epoch','canonical_run_id','alias_run_id'])
    assert.match(source,new RegExp(`core\\['${field}'\\] = required\\(event, '${field}'\\)`));
});

test('canonical aliases and claims remain conditionally unique',()=>{
  assert.match(source,/ConditionExpression='attribute_not_exists\(pk\) AND attribute_not_exists\(sk\)'/);
  assert.match(source,/'sk':\s*\{\s*'S':\s*'ALIAS#'\s*\+\s*alias_run_id\s*\}/);
});
