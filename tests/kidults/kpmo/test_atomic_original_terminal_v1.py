"""Actual JS terminal bytes and Python atomic backend; no external writes."""
import base64
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
import concurrent.futures
import types
import sys
import os
from unittest import mock

path = Path(__file__).with_name('test_interrupted_reservation_recovery_ledger_v1.py')
spec = importlib.util.spec_from_file_location('atomic_backend_fixture', path)
f = importlib.util.module_from_spec(spec); spec.loader.exec_module(f)
m = f.m
ROOT = Path(__file__).resolve().parents[3]

class AtomicOriginalTests(unittest.TestCase):
    setUp = f.RecoveryTest.setUp
    context = f.RecoveryTest.context
    final = f.RecoveryTest.final
    def atomic_setup(self):
        packet = subprocess.run(['node', '--input-type=module', '-e', "import {atomicOriginalFixture} from './tests/kidults/kpmo/atomic-original-terminal-fixture-v1.mjs'; console.log(JSON.stringify(atomicOriginalFixture()))"], cwd=ROOT, capture_output=True, text=True, check=True)
        self.fixture = json.loads(packet.stdout); self.clock += 120
        b = self.fixture['envelope']; self.request['nonce_digest'] = b['nonce_digest']
        self.ddb.rows = {}
        key = self.ledger.key(self.request)
        self.ddb.rows[self.ddb.key(key)] = {**key, 'run_id': {'S': '100'}, 'head_sha': {'S': b['head_sha']}, 'state': {'S': 'RESERVED'}}
        for role, a in zip(m.ROLES, self.fixture['approvals']):
            key = {'pk': {'S': 'AUTH#' + b['authorization_generation']}, 'sk': {'S': 'ROLE#' + role}}
            self.ddb.rows[self.ddb.key(key)] = {**key, 'envelope': {'S': base64.b64encode(m.canonical(a).encode()).decode()}, 'envelope_digest': {'S': m.digest(a)}}
        self.event = dict(action='CONSUME_RESERVATION', authorization_generation=b['authorization_generation'], nonce_digest=b['nonce_digest'], run_id='100', head_sha=b['head_sha'], merge_sha=self.fixture['merge']['merge_sha'], terminal=self.fixture['terminal'], finalizer_workload_id='wf', finalizer_environment='STAGING-FINALIZER', signing_key_arn='kf')
    def normal_signed(self, event=None):
        e = copy.deepcopy(event or self.event)
        message = hashlib.sha256(m.canonical(e).encode()).digest()
        return {**e, 'signature_b64': base64.b64encode(hashlib.sha256(b'kf' + message).digest()).decode()}
    def atomic_consume(self):
        return self.ledger.consume_original_terminal(self.normal_signed())
    def test_atomic_js_body_and_consumption_persist_in_one_cas(self):
        self.atomic_setup(); result = self.atomic_consume()
        self.assertEqual(result['contract_version'], '3.0.0')
        self.assertEqual(self.ddb.writes, 1)
        row = self.ledger.get(self.ledger.key(self.request))
        self.assertEqual(json.loads(row['original_terminal_json']['S']), self.fixture['terminal'])
        self.assertEqual(row['original_terminal_digest']['S'], self.fixture['terminal']['receipt_digest'])
        self.assertEqual(row['state']['S'], 'CONSUMED')
    def test_actual_capsule_routes_atomic_original_and_signed_recovery_read(self):
        self.atomic_setup()
        template = json.loads((ROOT / 'infrastructure/aws/staging/autonomous-internal-landing-v1.json').read_text())
        self.assertLessEqual(len(json.dumps(template, separators=(',', ':')).encode()), 51200)
        code = template['Resources']['AutonomousLedgerWriterFunction']['Properties']['Code']['ZipFile']
        boto = types.ModuleType('boto3'); boto.client = lambda name: self.ddb if name == 'dynamodb' else f.KMS()
        errors = types.ModuleType('botocore.exceptions'); errors.ClientError = f.ConditionalFailure
        env = dict(LEDGER_TABLE='ledger', GITHUB_REPOSITORY=self.request['repository'], RECEIPT_BUCKET='immutable', RECEIPT_KEY_ARN=self.ledger.receipt_key)
        for prefix, role in zip(('TRACK', 'KPMO', 'VERIFIER'), m.ROLES):
            for field in ('workload_id', 'signing_key_arn', 'environment'): env[prefix+'_'+field.upper()] = self.roles[role][field]
        for field in ('workload_id', 'signing_key_arn', 'environment'): env['FINALIZER_'+field.upper()] = self.finalizer[field]
        ns = {}
        with mock.patch.dict(sys.modules, {'boto3': boto, 'botocore': types.ModuleType('botocore'), 'botocore.exceptions': errors}), mock.patch.dict(os.environ, env), mock.patch('time.time', return_value=self.clock):
            exec(compile(code, '<actual-atomic-writer-capsule>', 'exec'), ns)
            self.assertEqual(ns['handler'](self.normal_signed(), None)['terminal_digest'], self.fixture['terminal']['receipt_digest'])
            self.assertEqual(ns['handler'](self.context(), None)['state'], 'ORIGINAL_CONSUMED_TERMINAL_ARCHIVE_PENDING')
        self.assertEqual(self.ddb.writes, 1)
    def test_lost_reply_signed_read_returns_exact_original_body_without_new_write(self):
        self.atomic_setup(); self.atomic_consume(); before = self.ddb.writes
        read = {**self.event, 'action': 'READ_ORIGINAL_CONSUMED_TERMINAL'}
        self.assertFalse(self.ledger.consume_original_terminal(self.normal_signed(read))['write_performed'])
        self.assertEqual(self.ddb.writes, before)
        with self.assertRaisesRegex(ValueError, 'NO_RETRY'): self.atomic_consume()
    def test_original_archive_resume_after_expiry_and_advanced_main_has_no_new_authority(self):
        self.atomic_setup(); self.atomic_consume(); self.clock += 86400
        self.request['source_sha'] = '9' * 40
        result = self.ledger.read_context(self.context())
        self.assertEqual(result['state'], 'ORIGINAL_CONSUMED_TERMINAL_ARCHIVE_PENDING')
        self.assertEqual(result['terminal'], self.fixture['terminal'])
        self.assertIsNone(result['immutable_ack'])
        self.assertFalse(result['write_performed'])
    def test_original_stored_body_tamper_and_unknown_operation_reject(self):
        self.atomic_setup(); self.atomic_consume()
        row = self.ddb.rows[self.ddb.key(self.ledger.key(self.request))]
        row['original_terminal_digest']['S'] = 'sha256:' + 'f' * 64
        with self.assertRaises(ValueError): self.ledger.read_context(self.context())
        self.setUp(); self.atomic_setup()
        self.event['terminal']['binding']['pull_request'] = 1677
        t = self.event['terminal']; t['receipt_digest'] = m.digest({k:v for k,v in t.items() if k != 'receipt_digest'})
        with self.assertRaisesRegex(ValueError, 'QUARANTINE'): self.atomic_consume()
        self.assertEqual(self.ddb.writes, 0)
    def test_original_role_row_tamper_never_consumes(self):
        self.atomic_setup()
        key = {'pk': {'S': 'AUTH#' + self.request['original_generation']}, 'sk': {'S': 'ROLE#KPMO'}}
        self.ddb.rows[self.ddb.key(key)]['envelope_digest']['S'] = 'sha256:' + 'f' * 64
        with self.assertRaisesRegex(ValueError, 'PERSISTED_QUORUM'): self.atomic_consume()
        self.assertEqual(self.ddb.writes, 0)
    def test_signed_terminal_cannot_forge_persisted_workload_identity(self):
        for field, value in (('stable_id', 'forged'), ('run_id', '999')):
            with self.subTest(field=field):
                self.setUp(); self.atomic_setup()
                t = self.event['terminal']; t['workloads'][0][field] = value
                t['receipt_digest'] = m.digest({k:v for k,v in t.items() if k != 'receipt_digest'})
                with self.assertRaises(ValueError): self.atomic_consume()
                self.assertEqual(self.ddb.writes, 0)
    def test_atomic_concurrent_original_consumption_has_one_winner(self):
        self.atomic_setup()
        def attempt(_):
            try: self.atomic_consume(); return True
            except (ValueError, f.ConditionalFailure): return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            self.assertEqual(sum(pool.map(attempt, range(8))), 1)
        self.assertEqual(self.ddb.writes, 1)
    def test_original_immutable_ack_uses_exact_canonical_body_and_is_idempotent(self):
        self.atomic_setup(); self.atomic_consume(); t = self.fixture['terminal']
        envelope = dict(id='kidults-autonomous-internal-landing-immutable-envelope-v1', version='1.0.0', receipt=t, receipt_sha256=m.digest(t), production='HOLD', public='HOLD', g5='HOLD')
        obj = dict(bucket='immutable', key='receipts/' + self.request['original_generation'] + '/' + self.request['merge_sha'] + '/terminal.json', version_id='one-version', sha256='sha256:' + hashlib.sha256((m.canonical(envelope) + '\n').encode()).hexdigest(), retention_mode='COMPLIANCE', retain_until='2036-10-11T00:01:00.000Z', encryption_key_arn=self.ledger.receipt_key)
        self.assertTrue(self.ledger.acknowledge_original(self.final('ACK_ORIGINAL_TERMINAL_IMMUTABLE', object=obj))['write_performed'])
        self.assertFalse(self.ledger.acknowledge_original(self.final('ACK_ORIGINAL_TERMINAL_IMMUTABLE', object=obj))['write_performed'])
        self.assertEqual(self.ledger.read_context(self.context())['immutable_ack'], obj)
        obj['version_id'] = 'forged-version'
        with self.assertRaisesRegex(ValueError, 'CONFLICT'): self.ledger.acknowledge_original(self.final('ACK_ORIGINAL_TERMINAL_IMMUTABLE', object=obj))

if __name__ == '__main__': unittest.main()
