"""Execute real adapter against conditional-write/KMS test doubles; no AWS calls."""
import base64
import copy
import hashlib
import importlib.util
import pathlib
import re
import unittest
import concurrent.futures
import subprocess
import tempfile
import threading
import json
import os
import sys
import types
from unittest import mock

PATH = pathlib.Path(__file__).resolve().parents[3] / 'scripts/kidults/kpmo/lib/interrupted-reservation-recovery-ledger-v1.py'
spec = importlib.util.spec_from_file_location('generic_recovery', PATH)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class ConditionalFailure(Exception):
    pass


class DDB:
    def __init__(self):
        self.rows = {}; self.writes = 0; self.corrupt = False; self.lock = threading.RLock()
    def key(self, key):
        return tuple((x, tuple(v.items())) for x, v in sorted(key.items()))
    def get_item(self, **p):
        assert p['ConsistentRead'] is True
        return {'Item': copy.deepcopy(self.rows.get(self.key(p['Key']), {}))}
    def condition(self, p, row):
        names = p.get('ExpressionAttributeNames', {}); values = p.get('ExpressionAttributeValues', {})
        text = p.get('UpdateExpression', '') + ' ' + p['ConditionExpression']
        assert set(re.findall(r':\w+', text)) == set(values), 'DynamoDB unused/missing expression values'
        assert set(re.findall(r'#\w+', text)) == set(names), 'DynamoDB unused/missing expression names'
        def value(v):
            if v is None: return None
            return float(v['N']) if 'N' in v else v['S']
        for part in p['ConditionExpression'].split(' AND '):
            absent = re.fullmatch(r'attribute_not_exists\((\w+)\)', part)
            if absent:
                if absent[1] in row: raise ConditionalFailure(part)
                continue
            found = re.fullmatch(r'([#\w]+)(<=|>|=)(:\w+)', part)
            assert found, part
            lhs = value(row.get(names.get(found[1], found[1]))); rhs = value(values[found[3]])
            if lhs is None or not {'=': lambda: lhs == rhs, '>': lambda: lhs > rhs, '<=': lambda: lhs <= rhs}[found[2]]():
                raise ConditionalFailure(part)
    def put_item(self, **p):
        key = self.key({k: p['Item'][k] for k in ('pk', 'sk')}); row = self.rows.get(key, {})
        self.condition(p, row); self.rows[key] = copy.deepcopy(p['Item']); self.writes += 1
    def update_item(self, **p):
        with self.lock:
            key = self.key(p['Key']); row = self.rows.get(key, {})
            self.condition(p, row)
            for assignment in p['UpdateExpression'][4:].split(', '):
                name, value = assignment.split('='); name = p.get('ExpressionAttributeNames', {}).get(name, name)
                row[name] = copy.deepcopy(p['ExpressionAttributeValues'][value])
            self.rows[key] = row; self.writes += 1
            result = copy.deepcopy(row)
            if self.corrupt: result['run_id'] = {'S': '999'}
            return {'Attributes': result}


class KMS:
    def verify(self, **p):
        assert p['MessageType'] == 'DIGEST' and p['SigningAlgorithm'] == 'ECDSA_SHA_256'
        return {'SignatureValid': p['Signature'] == hashlib.sha256(p['KeyId'].encode() + p['Message']).digest()}


def signed(e):
    d = hashlib.sha256(m.canonical(e).encode()).digest()
    return {'envelope': e, 'signature_b64': base64.b64encode(hashlib.sha256(e['workload']['signing_key_arn'].encode() + d).digest()).decode()}


class RecoveryTest(unittest.TestCase):
    def setUp(self):
        self.clock = 1791676800
        self.roles = {role: dict(workload_id='w'+str(i), signing_key_arn='k'+str(i), environment='STAGING-'+str(i)) for i, role in enumerate(m.ROLES)}
        self.finalizer = dict(workload_id='wf', signing_key_arn='kf', environment='STAGING-FINALIZER')
        self.ddb = DDB()
        self.ledger = m.InterruptedReservationRecoveryLedger(ddb=self.ddb, kms=KMS(), table='ledger', role_config=self.roles, finalizer_config=self.finalizer, receipt_bucket='immutable', receipt_key_arn='arn:aws:kms:ap-northeast-2:123456789012:key/receipt-key', now=lambda: self.clock)
        self.request = dict(id='kidults-interrupted-reservation-postmerge-request-v1', version='1.0.0', repository='johnkim9524-collab/kaios_enterprise_repo', repository_id='1281328888', pull_request=42, base_sha='a'*40, head_sha='b'*40, head_tree_sha='c'*40, merge_sha='d'*40, source_sha='e'*40, original_run_id='100', original_run_attempt=1, original_generation='pr-42-original-generation', nonce_digest='sha256:'+'f'*64, issued_at='2026-10-11T00:00:00Z', expires_at='2026-10-11T00:20:00Z', **m.HOLD)
        self.evidence = {k: self.request[k] for k in ('repository', 'source_sha', 'pull_request', 'merge_sha', 'head_sha', 'head_tree_sha')}
        self.evidence.update(merge_parents=['a'*40, 'b'*40], merged_at='2026-10-10T23:59:00Z', original_run=dict(run_id='100', run_attempt=1, source_sha='a'*40, status='completed', conclusion='cancelled'), checks=[dict(kind=kind, run_id=str(300+i), run_attempt=1, source_sha='e'*40, conclusion='success', artifact_id=500+i, archive_digest='sha256:'+'1'*64, receipt_digest='sha256:'+'2'*64) for i, kind in enumerate(('REQUIRED_PUSH_SUITE', 'CANONICAL_TRUTH', 'SENTINEL', 'SUCCESS_AUTHORITY_GATE'))], **m.HOLD)
        key = self.ledger.key(self.request)
        self.ddb.rows[self.ddb.key(key)] = {**key, 'run_id': {'S': '100'}, 'head_sha': {'S': 'b'*40}, 'state': {'S': 'RESERVED'}}
    def approval(self, role, run=None):
        return signed(dict(action='APPROVE_MERGED_RESERVATION_RECOVERY', request=copy.deepcopy(self.request), request_digest=m.digest(self.request), evidence=copy.deepcopy(self.evidence), evidence_digest=m.digest(self.evidence), role=role, approval_run_id=run or str(200+m.ROLES.index(role)), approval_run_attempt=1, workload=self.roles[role]))
    def approve(self):
        for role in m.ROLES: self.ledger.create_approval(self.approval(role))
    def final(self, action, run='400', **extra):
        return signed(dict(action=action, request=copy.deepcopy(self.request), request_digest=m.digest(self.request), run_id=run, run_attempt=1, workload=self.finalizer, **extra))
    def claim(self, run='400', revision=0):
        return self.ledger.claim(self.final('CLAIM_MERGED_RECOVERY', run=run, expected_revision=revision, lease_seconds=60))
    def terminal(self, run='400', revision=1):
        return dict(id='kidults-interrupted-reservation-terminal-v1', state='VERIFIED_PASS', request_digest=m.digest(self.request), evidence_digest=m.digest(self.evidence), recovery_run_id=run, revision=revision, merge_sha='d'*40, head_sha='b'*40, **m.HOLD)
    def consume(self, run='400', revision=1):
        return self.ledger.consume(self.final('CONSUME_MERGED_RECOVERY', run=run, revision=revision, terminal=self.terminal(run, revision)))
    def test_actual_capsule_routes_generic_and_preserves_original_owner(self):
        root = PATH.parents[4]
        template = json.loads((root / 'infrastructure/aws/staging/autonomous-internal-landing-v1.json').read_text())
        code = template['Resources']['AutonomousLedgerWriterFunction']['Properties']['Code']['ZipFile']
        self.assertLessEqual(len(json.dumps(template, separators=(',', ':')).encode()), 51200)
        boto = types.ModuleType('boto3'); boto.client = lambda name: self.ddb if name == 'dynamodb' else KMS()
        errors = types.ModuleType('botocore.exceptions'); errors.ClientError = ConditionalFailure
        env = {'LEDGER_TABLE': 'ledger', 'GITHUB_REPOSITORY': self.request['repository'], 'RECEIPT_BUCKET': 'immutable', 'RECEIPT_KEY_ARN': self.ledger.receipt_key}
        for prefix, role in zip(('TRACK', 'KPMO', 'VERIFIER'), m.ROLES):
            for field in ('workload_id', 'signing_key_arn', 'environment'): env[prefix+'_'+field.upper()] = self.roles[role][field]
        for field in ('workload_id', 'signing_key_arn', 'environment'): env['FINALIZER_'+field.upper()] = self.finalizer[field]
        ns = {}
        with mock.patch.dict(sys.modules, {'boto3': boto, 'botocore': types.ModuleType('botocore'), 'botocore.exceptions': errors}), mock.patch.dict(os.environ, env), mock.patch('time.time', return_value=self.clock):
            exec(compile(code, '<actual-writer-capsule>', 'exec'), ns)
            for role in m.ROLES: self.assertTrue(ns['handler'](self.approval(role), None)['ok'])
            self.assertEqual(ns['handler'](self.final('CLAIM_MERGED_RECOVERY', expected_revision=0, lease_seconds=60), None)['revision'], 1)
            self.assertEqual(ns['handler'](self.final('CONSUME_MERGED_RECOVERY', revision=1, terminal=self.terminal()), None)['state'], 'CONSUMED')
            self.assertEqual(ns['handler'](self.final('READ_MERGED_RECOVERY'), None)['original_run_id'], '100')
        self.assertEqual(ns['digest']('abc'), 'sha256:'+hashlib.sha256(b'abc').hexdigest())
    def test_complete_preserves_original_tuple_and_reuses_consumption(self):
        self.approve(); self.claim(); self.assertTrue(self.consume()['write_performed'])
        self.clock += 2000; self.assertFalse(self.consume()['write_performed'])
        row = self.ledger.reservation(self.request)
        self.assertEqual(row['run_id']['S'], '100'); self.assertEqual(row['head_sha']['S'], 'b'*40)
        self.assertEqual(self.ledger.read(self.final('READ_MERGED_RECOVERY'))['terminal'], self.terminal())
    def test_missing_quorum_and_role_run_collision(self):
        with self.assertRaises(ValueError): self.claim()
        for role in m.ROLES: self.ledger.create_approval(self.approval(role, '200'))
        with self.assertRaisesRegex(ValueError, 'QUORUM_RUN_COLLISION'): self.claim()
    def test_service_clock_lease_fences_old_execution(self):
        self.approve(); self.claim()
        with self.assertRaisesRegex(ValueError, 'LEASE_ACTIVE'): self.claim('401', 1)
        self.clock += 61; self.claim('401', 1)
        with self.assertRaises(ConditionalFailure): self.consume()
        self.assertTrue(self.consume('401', 2)['write_performed'])
    def test_expected_revision_cas_stops_duplicate_claim(self):
        self.approve(); self.claim(); self.clock += 61
        with self.assertRaisesRegex(ValueError, 'LEASE_REQUEST'): self.claim('401', 0)
    def test_expired_lease_and_request_do_not_consume(self):
        self.approve(); self.claim(); self.clock += 61
        with self.assertRaises(ConditionalFailure): self.consume()
        self.clock += 2000
        with self.assertRaisesRegex(ValueError, 'REQUEST_EXPIRED'): self.claim('401', 1)
    def test_unknown_and_quarantine_never_pin(self):
        self.ddb.rows[self.ddb.key(self.ledger.key(self.request))]['state'] = {'S': 'UNKNOWN'}
        with self.assertRaisesRegex(ValueError, 'RESERVATION'): self.ledger.create_approval(self.approval(m.ROLES[0]))
        self.request['pull_request'] = 1677
        with self.assertRaisesRegex(ValueError, 'QUARANTINE'): self.ledger.create_approval(self.approval(m.ROLES[0]))
        self.assertEqual(self.ddb.writes, 0)
    def test_schema_bool_and_merge_graph_reject(self):
        for mutation in ('bool', 'extra', 'graph', 'unmerged', 'sha'):
            self.setUp()
            if mutation == 'bool': self.request['original_run_attempt'] = True
            if mutation == 'extra': self.evidence['authorized'] = True
            if mutation == 'graph': self.evidence['merge_parents'].reverse()
            if mutation == 'unmerged': self.evidence['merged_at'] = '2026-10-11T00:21:00Z'
            if mutation == 'sha': self.request['merge_sha'] = ''
            with self.assertRaises(ValueError): self.ledger.create_approval(self.approval(m.ROLES[0]))
            self.assertEqual(self.ddb.writes, 0)
    def test_forged_signature_or_wrong_workload_reject(self):
        e = self.approval(m.ROLES[0]); e['signature_b64'] = base64.b64encode(b'forged').decode()
        with self.assertRaisesRegex(ValueError, 'SIGNATURE'): self.ledger.create_approval(e)
        e = self.approval(m.ROLES[0]); e['envelope']['workload'] = self.finalizer
        with self.assertRaisesRegex(ValueError, 'WORKLOAD'): self.ledger.create_approval(signed(e['envelope']))
    def test_evidence_and_request_are_pinned(self):
        self.ledger.create_approval(self.approval(m.ROLES[0])); self.evidence['checks'][0]['receipt_digest'] = 'sha256:'+'3'*64
        with self.assertRaisesRegex(ValueError, 'EVIDENCE_CONFLICT'): self.ledger.create_approval(self.approval(m.ROLES[1]))
        self.request['source_sha'] = 'f'*40; self.evidence['source_sha'] = 'f'*40
        for c in self.evidence['checks']: c['source_sha'] = 'f'*40
        with self.assertRaisesRegex(ValueError, 'SUPERSESSION_NOT_QUIESCENT'): self.ledger.create_approval(self.approval(m.ROLES[1]))
    def test_all_new_corruption_fails_closed_then_read_reconciles(self):
        self.approve(); self.claim(); self.ddb.corrupt = True
        with self.assertRaisesRegex(ValueError, 'CONSUME_READBACK'): self.consume()
        self.ddb.corrupt = False; self.assertFalse(self.consume()['write_performed'])
    def test_ack_exact_object_and_idempotence(self):
        self.approve(); self.claim(); self.consume()
        o = dict(bucket='immutable', key='receipts/'+self.request['original_generation']+'/interrupted-postmerge-v1/'+'d'*40+'.json', version_id='native-version', sha256=m.digest(self.terminal()), retention_mode='COMPLIANCE', retain_until='2036-10-11T00:00:00Z', encryption_key_arn='arn:aws:kms:ap-northeast-2:123456789012:key/receipt-key')
        e = self.final('ACK_MERGED_RECOVERY_IMMUTABLE', object=o)
        self.assertTrue(self.ledger.acknowledge(e)['write_performed']); self.assertFalse(self.ledger.acknowledge(e)['write_performed'])
        for k, v in [('bucket', 'wrong'), ('sha256', 'sha256:'+'0'*64), ('retention_mode', 'GOVERNANCE')]:
            bad = copy.deepcopy(o); bad[k] = v
            with self.assertRaises(ValueError): self.ledger.acknowledge(self.final('ACK_MERGED_RECOVERY_IMMUTABLE', object=bad))
    def test_consumed_without_our_atomic_terminal_is_not_recovery_success(self):
        row = self.ddb.rows[self.ddb.key(self.ledger.key(self.request))]; row['state'] = {'S': 'CONSUMED'}
        with self.assertRaisesRegex(ValueError, 'UNBOUND_CONSUMED'): self.ledger.read(self.final('READ_MERGED_RECOVERY'))
    def test_stored_terminal_tamper_is_not_reused(self):
        self.approve(); self.claim(); self.consume()
        row = self.ddb.rows[self.ddb.key(self.ledger.key(self.request))]; row['ir_terminal_digest'] = {'S': 'sha256:'+'0'*64}
        with self.assertRaisesRegex(ValueError, 'STORED_TERMINAL_DIGEST'): self.consume()
    def test_boolean_terminal_revision_is_not_integer_authority(self):
        self.approve(); self.claim(); t = self.terminal(); t['revision'] = True
        with self.assertRaisesRegex(ValueError, 'TERMINAL'): self.ledger.consume(self.final('CONSUME_MERGED_RECOVERY', revision=1, terminal=t))
    def test_recorded_immutable_ack_reused_after_retention_window(self):
        self.approve(); self.claim(); self.consume()
        o = dict(bucket='immutable', key='receipts/'+self.request['original_generation']+'/interrupted-postmerge-v1/'+'d'*40+'.json', version_id='v1', sha256=m.digest(self.terminal()), retention_mode='COMPLIANCE', retain_until='2036-10-11T00:00:00Z', encryption_key_arn='arn:aws:kms:ap-northeast-2:123456789012:key/receipt-key')
        self.ledger.acknowledge(self.final('ACK_MERGED_RECOVERY_IMMUTABLE', object=o)); self.clock += 400000000
        self.assertFalse(self.ledger.acknowledge(self.final('ACK_MERGED_RECOVERY_IMMUTABLE', object=o))['write_performed'])
    def test_ack_rejects_wrong_encryption_or_short_calendar_retention(self):
        self.approve(); self.claim(); self.consume()
        o = dict(bucket='immutable', key='receipts/'+self.request['original_generation']+'/interrupted-postmerge-v1/'+'d'*40+'.json', version_id='v1', sha256=m.digest(self.terminal()), retention_mode='COMPLIANCE', retain_until='2036-10-11T00:00:00Z', encryption_key_arn='arn:aws:kms:ap-northeast-2:123456789012:key/receipt-key')
        for field, value in [('encryption_key_arn', 'arn:aws:kms:ap-northeast-2:123456789012:key/wrong-key'), ('retain_until', '2036-10-10T23:59:59Z'), ('retain_until', '2026-10-13T00:00:00Z')]:
            bad = copy.deepcopy(o); bad[field] = value
            with self.assertRaisesRegex(ValueError, 'IMMUTABLE_BINDING'): self.ledger.acknowledge(self.final('ACK_MERGED_RECOVERY_IMMUTABLE', object=bad))
    def test_false_or_string_kms_validity_does_not_authorize(self):
        for value in [False, 'true', 1, None]:
            class BadKMS:
                def verify(self, **kwargs): return {'SignatureValid': value}
            self.ledger.kms = BadKMS()
            with self.assertRaisesRegex(ValueError, 'SIGNATURE'): self.ledger.create_approval(self.approval(m.ROLES[0]))
        self.assertEqual(self.ddb.writes, 0)
    def test_calendar_leap_horizon_is_fixed(self):
        self.assertEqual(m.retention_horizon('2024-02-29T12:00:00Z'), m.epoch('2034-02-28T12:00:00Z'))
    def test_twelve_concurrent_claims_have_one_cas_winner(self):
        self.approve()
        barrier = threading.Barrier(12)
        def contender(i):
            barrier.wait()
            try: return self.claim(str(400+i))['state']
            except (ValueError, ConditionalFailure): return 'FENCED'
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            states = list(pool.map(contender, range(12)))
        self.assertEqual(states.count('TERMINAL_RECOVERY_LEASE_ONLY'), 1)
        self.assertEqual(states.count('FENCED'), 11)
        row = self.ledger.reservation(self.request)
        self.assertEqual(row['ir_revision']['N'], '1'); self.assertEqual(row['run_id']['S'], '100')
    def test_real_p256_der_ecdsa_kms_digest_signature(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory); key = root/'key.pem'; pub = root/'public.pem'; message = root/'digest'; sig = root/'sig.der'
            subprocess.run(['openssl', 'genpkey', '-algorithm', 'EC', '-pkeyopt', 'ec_paramgen_curve:P-256', '-out', str(key)], check=True, capture_output=True)
            subprocess.run(['openssl', 'pkey', '-in', str(key), '-pubout', '-out', str(pub)], check=True, capture_output=True)
            envelope = self.approval(m.ROLES[0])['envelope']
            message.write_bytes(hashlib.sha256(m.canonical(envelope).encode()).digest())
            subprocess.run(['openssl', 'pkeyutl', '-sign', '-inkey', str(key), '-in', str(message), '-pkeyopt', 'digest:sha256', '-out', str(sig)], check=True, capture_output=True)
            expected_key = self.roles[m.ROLES[0]]['signing_key_arn']
            class RealECDSAKMS:
                def verify(self, **p):
                    assert p['KeyId'] == expected_key and p['MessageType'] == 'DIGEST' and p['SigningAlgorithm'] == 'ECDSA_SHA_256'
                    message.write_bytes(p['Message']); sig.write_bytes(p['Signature'])
                    result = subprocess.run(['openssl', 'pkeyutl', '-verify', '-pubin', '-inkey', str(pub), '-in', str(message), '-pkeyopt', 'digest:sha256', '-sigfile', str(sig)], capture_output=True)
                    return {'SignatureValid': result.returncode == 0}
            event = {'envelope': envelope, 'signature_b64': base64.b64encode(sig.read_bytes()).decode()}
            self.ledger.kms = RealECDSAKMS()
            self.assertEqual(self.ledger.create_approval(event)['state'], 'APPROVAL_STORED')
            forged = copy.deepcopy(event); forged['envelope']['approval_run_id'] = '999'
            with self.assertRaisesRegex(ValueError, 'SIGNATURE'): self.ledger.create_approval(forged)
    def test_js_engine_canonical_request_evidence_terminal_match_python(self):
        # Produce actual terminal through the JS engine, not a duplicated digest.
        repo = PATH.parents[4]
        script = r"""
import {canonicalJson,sha256} from './scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {resumeInterruptedPostmerge,validateInterruptedRecoveryRequest} from './scripts/kidults/kpmo/lib/interrupted-reservation-recovery-v1.mjs';
let text='';for await(const part of process.stdin)text+=part;const {r,e}=JSON.parse(text);let terminal;
const get=async route=>route==='branches/main'?{name:'main',protected:true,commit:{sha:r.source_sha}}:route.startsWith('pulls/')?{number:r.pull_request,state:'closed',merged:true,merge_commit_sha:r.merge_sha,merged_at:e.merged_at,head:{sha:r.head_sha,repo:{full_name:r.repository}},base:{ref:'main',repo:{full_name:r.repository}}}:route.startsWith('actions/')?{id:Number(r.original_run_id),run_attempt:1,head_sha:r.base_sha,head_branch:'main',repository:{full_name:r.repository,id:Number(r.repository_id)},path:'.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml',event:'repository_dispatch',status:'completed',conclusion:'cancelled'}:route.startsWith('git/')?{sha:r.merge_sha,tree:{sha:r.head_tree_sha},parents:[{sha:r.base_sha},{sha:r.head_sha}]}:{base_commit:{sha:r.merge_sha},merge_base_commit:{sha:r.merge_sha},behind_by:0,status:'ahead'};
const ledger={read:async()=>({state:'RESERVED',request_digest:sha256(canonicalJson(r)),original_run_id:r.original_run_id,revision:0}),claim:async()=>({state:'TERMINAL_RECOVERY_LEASE_ONLY',original_run_id:r.original_run_id,revision:1}),consume:async p=>{terminal=p.terminal;return{state:'CONSUMED',terminal_digest:sha256(canonicalJson(terminal))};},acknowledge:async()=>({state:'IMMUTABLE_ACKNOWLEDGED'})};
await resumeInterruptedPostmerge({request:r,recoveryRunId:'400',ledger,get,verifyEvidence:async()=>e,immutable:{seal:async p=>({key:p.key,sha256:sha256(canonicalJson(p.terminal))})},now:()=>Date.parse(r.issued_at)});
console.log(JSON.stringify({requestDigest:validateInterruptedRecoveryRequest(r,{now:Date.parse(r.issued_at)}),evidenceDigest:sha256(canonicalJson(e)),terminal,terminalDigest:sha256(canonicalJson(terminal)),canonicalTerminal:canonicalJson(terminal)}));
"""
        result = subprocess.run(['node', '--input-type=module', '-e', script], input=m.canonical({'r': self.request, 'e': self.evidence}), text=True, capture_output=True, cwd=repo, check=True)
        import json
        produced = json.loads(result.stdout)
        self.assertEqual(produced['requestDigest'], m.validate_request(self.request, self.clock))
        self.assertEqual(produced['evidenceDigest'], m.validate_evidence(self.evidence, self.request))
        self.assertEqual(produced['terminal'], self.terminal()); self.assertEqual(produced['terminalDigest'], m.digest(self.terminal()))
        self.assertEqual(produced['canonicalTerminal'], m.canonical(self.terminal()))
    def advance_request(self, offset=0):
        from datetime import datetime, timezone
        self.clock += 1201
        self.request['issued_at'] = datetime.fromtimestamp(self.clock + offset, timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        self.request['expires_at'] = datetime.fromtimestamp(self.clock + 1200 + offset, timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    def stage_new(self, first_run=600):
        for i, role in enumerate(m.ROLES): self.ledger.create_approval(self.approval(role, str(first_run+i)))
    def supersede(self, old_digest, run='700'):
        return self.ledger.supersede(self.final('SUPERSEDE_EXPIRED_MERGED_RECOVERY', run=run, expected_old_request_digest=old_digest, evidence_digest=m.digest(self.evidence)))
    def test_supersession_preserves_original_and_old_signed_records(self):
        self.approve(); old = copy.deepcopy(self.request); old_digest = m.digest(old); self.advance_request(); self.stage_new()
        self.assertEqual(self.supersede(old_digest)['supersessions'], 1)
        with self.assertRaisesRegex(ValueError, 'PINNED_REQUEST'):
            old_event = self.final('READ_MERGED_RECOVERY'); old_event['envelope']['request'] = old; old_event['envelope']['request_digest'] = old_digest
            self.ledger.read(signed(old_event['envelope']))
        self.claim(); self.consume()
        self.assertEqual(self.ledger.reservation(self.request)['run_id']['S'], '100')
        for role in m.ROLES:
            self.assertTrue(self.ledger.get({'pk': {'S': 'AUTH#POSTMERGE#'+old_digest}, 'sk': {'S': 'ROLE#'+role}}))
    def test_supersession_requires_expired_request_and_lease(self):
        self.approve(); old_digest = m.digest(self.request); self.request['expires_at'] = '2026-10-11T00:21:00Z'
        with self.assertRaisesRegex(ValueError, 'NOT_QUIESCENT'): self.stage_new()
        self.setUp(); self.approve(); old_digest = m.digest(self.request); self.advance_request()
        row = self.ddb.rows[self.ddb.key(self.ledger.key(self.request))]; row['ir_lease_until'] = {'N': str(self.clock+60)}
        with self.assertRaisesRegex(ValueError, 'NOT_QUIESCENT'): self.stage_new()
    def test_supersession_two_budget_and_no_consumed_or_unknown(self):
        self.approve()
        for generation in range(2):
            old_digest = m.digest(self.request); self.advance_request(); self.stage_new(600+generation*10)
            self.assertEqual(self.supersede(old_digest)['supersessions'], generation+1)
        self.advance_request()
        with self.assertRaisesRegex(ValueError, 'BUDGET'): self.stage_new(800)
        for state in ['UNKNOWN', 'CONSUMED']:
            self.setUp(); self.approve(); self.advance_request()
            self.ddb.rows[self.ddb.key(self.ledger.key(self.request))]['state'] = {'S': state}
            with self.assertRaisesRegex(ValueError, 'SUPERSESSION_RESERVATION'): self.stage_new()
    def test_old_quorum_cannot_mix_with_fresh_or_forged_old(self):
        self.approve(); old_digest = m.digest(self.request); self.advance_request()
        with self.assertRaises(ValueError): self.supersede(old_digest)
        self.stage_new(200)
        with self.assertRaisesRegex(ValueError, 'FRESH_ROLE_RUN'): self.supersede(old_digest)
        key = {'pk': {'S': 'AUTH#POSTMERGE#'+old_digest}, 'sk': {'S': 'ROLE#'+m.ROLES[0]}}
        self.ddb.rows[self.ddb.key(key)]['signed_event'] = {'S': '{}'}
        with self.assertRaises(ValueError): self.supersede(old_digest)
    def test_twelve_supersession_proposals_have_one_pin(self):
        self.approve(); old_digest = m.digest(self.request); self.advance_request(); proposals=[]
        for i in range(12):
            self.request['expires_at'] = '2026-10-11T00:40:01.%03dZ' % i
            self.stage_new(600+i*3)
            proposals.append(self.final('SUPERSEDE_EXPIRED_MERGED_RECOVERY', run=str(800+i), expected_old_request_digest=old_digest, evidence_digest=m.digest(self.evidence)))
        barrier = threading.Barrier(12)
        def contender(event):
            barrier.wait()
            try: return self.ledger.supersede(event)['state']
            except (ValueError, ConditionalFailure): return 'FENCED'
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            states=list(pool.map(contender, proposals))
        self.assertEqual(states.count('POSTMERGE_RECOVERY_REQUEST_SUPERSEDED_NOT_LANDING_AUTHORITY'), 1)
        self.assertEqual(states.count('FENCED'), 11)
        row=self.ledger.get(self.ledger.key(self.request)); self.assertEqual(row['ir_supersessions']['N'], '1'); self.assertEqual(row['run_id']['S'], '100')
    def test_supersession_cannot_change_original_identity_or_preserve_terminal(self):
        self.approve(); self.advance_request(); self.request['pull_request'] = 43; self.evidence['pull_request'] = 43
        with self.assertRaisesRegex(ValueError, 'ORIGINAL_IDENTITY'): self.stage_new()
        self.setUp(); self.approve(); self.advance_request()
        row = self.ddb.rows[self.ddb.key(self.ledger.key(self.request))]; row['ir_terminal_digest'] = {'S': 'sha256:'+'0'*64}
        with self.assertRaisesRegex(ValueError, 'SUPERSESSION_RESERVATION'): self.stage_new()
    def test_config_requires_independent_signers(self):
        roles = copy.deepcopy(self.roles); roles[m.ROLES[1]]['signing_key_arn'] = roles[m.ROLES[0]]['signing_key_arn']
        with self.assertRaisesRegex(ValueError, 'SIGNER_COLLISION'): m.InterruptedReservationRecoveryLedger(ddb=self.ddb, kms=KMS(), table='ledger', role_config=roles, finalizer_config=self.finalizer, receipt_bucket='immutable', receipt_key_arn='arn:aws:kms:ap-northeast-2:123456789012:key/receipt-key')


if __name__ == '__main__': unittest.main()
