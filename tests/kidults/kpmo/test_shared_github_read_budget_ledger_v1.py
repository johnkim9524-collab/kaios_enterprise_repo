import base64
import copy
import unittest

from scripts.kidults.kpmo.lib.shared_github_read_budget_ledger_v1 import (
    CONTRACT,
    REPOSITORY,
    REPOSITORY_ID,
    Ledger,
    canonical,
    digest,
)


SCOPE = {'repository': REPOSITORY, 'resource': 'core', 'quota_owner_id': 'gha-repo-1281328888'}
CONFIG = {'scope': SCOPE, 'capacity': 480, 'windowMs': 3600000, 'maxConcurrent': 2, 'leaseMs': 30000}
ROLES = {
    'ACCOUNTABLE_TRACK_AGENT': {'workload_id': 'track-workload', 'signing_key_arn': 'arn:aws:kms:ap-northeast-2:528314240275:key/track', 'environment': 'KIDULTS-AUTONOMOUS-TRACK'},
    'KPMO': {'workload_id': 'kpmo-workload', 'signing_key_arn': 'arn:aws:kms:ap-northeast-2:528314240275:key/kpmo', 'environment': 'KIDULTS-AUTONOMOUS-KPMO'},
    'INDEPENDENT_VERIFIER': {'workload_id': 'verifier-workload', 'signing_key_arn': 'arn:aws:kms:ap-northeast-2:528314240275:key/verifier', 'environment': 'KIDULTS-AUTONOMOUS-VERIFIER'},
    'READ_RESUME': {'workload_id': 'read-resume-workload', 'signing_key_arn': 'arn:aws:kms:ap-northeast-2:528314240275:key/read-resume', 'environment': 'KIDULTS-AUTONOMOUS-READ-RESUME'},
}


class ConditionalCheckFailedException(Exception):
    def __init__(self):
        self.response = {'Error': {'Code': 'ConditionalCheckFailedException'}}


class FakeDdb:
    def __init__(self):
        self.rows = {}
        self.calls = []

    @staticmethod
    def row_key(key):
        return key['pk']['S'], key['sk']['S']

    def get_item(self, **kwargs):
        self.calls.append(('get', kwargs))
        return {'Item': copy.deepcopy(self.rows.get(self.row_key(kwargs['Key'])))}

    def put_item(self, **kwargs):
        self.calls.append(('put', kwargs))
        key = self.row_key(kwargs['Item'])
        if key in self.rows:
            raise ConditionalCheckFailedException()
        self.rows[key] = copy.deepcopy(kwargs['Item'])

    def update_item(self, **kwargs):
        self.calls.append(('update', kwargs))
        key = self.row_key(kwargs['Key'])
        current = self.rows.get(key)
        expected = kwargs['ExpressionAttributeValues'][':expected']['N']
        if not current or current['budget_version']['N'] != expected:
            raise ConditionalCheckFailedException()
        values = kwargs['ExpressionAttributeValues']
        current['budget_version'] = copy.deepcopy(values[':next'])
        current['budget_json'] = copy.deepcopy(values[':body'])


class FakeKms:
    def __init__(self, valid=True):
        self.valid = valid
        self.calls = []

    def verify(self, **kwargs):
        self.calls.append(kwargs)
        return {'SignatureValid': self.valid}


def event(role, action, **extra):
    workload = ROLES[role]
    envelope = {
        'action': action,
        'contract': CONTRACT,
        'repository': REPOSITORY,
        'repository_id': REPOSITORY_ID,
        'scope': SCOPE,
        'configuration': CONFIG,
        'key': 'GITHUB_READ_BUDGET#' + digest(SCOPE),
        'role': role,
        'workload': workload,
        'run_id': '123456',
        'run_attempt': 1,
        'source_sha': 'a' * 40,
        'workflow_ref': REPOSITORY + '/' + {
            'ACCOUNTABLE_TRACK_AGENT': '.github/workflows/kidults-autonomous-track-authorization-v1.yml',
            'KPMO': '.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml',
            'INDEPENDENT_VERIFIER': '.github/workflows/kidults-autonomous-independent-verification-authorization-v1.yml',
            'READ_RESUME': '.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml',
        }[role] + '@refs/heads/main',
        **extra,
    }
    return {'envelope': envelope, 'signature_b64': base64.b64encode(b'valid').decode()}


def budget_row(version=1, spent=1):
    return {'version': version, 'scope_digest': digest(SCOPE), 'config_digest': digest(CONFIG),
            'window_start': 100000, 'spent': spent, 'blocked_until': 0,
            'operations': {}, 'observed_at': 100000}


class SharedBudgetLedgerTests(unittest.TestCase):
    def setUp(self):
        self.ddb, self.kms = FakeDdb(), FakeKms()
        self.ledger = Ledger(ddb=self.ddb, kms=self.kms,
                                                   table='kidults-autonomous-landing-staging-ledger',
                                                   role_config=ROLES)

    def test_signed_consistent_read_and_atomic_initial_cas(self):
        key = {'pk': {'S': 'AUTH#' + 'GITHUB_READ_BUDGET#' + digest(SCOPE)}, 'sk': {'S': 'V1'}}
        response = self.ledger.handle(event('ACCOUNTABLE_TRACK_AGENT', 'READ'))
        self.assertIsNone(response['row'])
        self.assertTrue(self.ddb.calls[0][1]['ConsistentRead'])
        result = self.ledger.handle(event('ACCOUNTABLE_TRACK_AGENT', 'COMPARE_AND_SWAP',
                                          expected_version=0, next=budget_row()))
        self.assertEqual(result['state'], 'COMMITTED')
        self.assertEqual(self.ddb.calls[1][1]['ConditionExpression'],
                         'attribute_not_exists(pk) AND attribute_not_exists(sk)')
        stored = self.ledger.handle(event('KPMO', 'READ'))
        self.assertEqual(stored['row']['spent'], 1)
        self.assertEqual(self.ddb.calls[2][1]['Key'], key)

    def test_distinct_runner_signers_share_one_compare_and_swap_row(self):
        first = self.ledger.handle(event('ACCOUNTABLE_TRACK_AGENT', 'COMPARE_AND_SWAP',
                                         expected_version=0, next=budget_row()))
        stale = self.ledger.handle(event('KPMO', 'COMPARE_AND_SWAP',
                                         expected_version=0, next=budget_row()))
        updated = self.ledger.handle(event('INDEPENDENT_VERIFIER', 'COMPARE_AND_SWAP',
                                           expected_version=1, next=budget_row(version=2, spent=2)))
        self.assertEqual([first['state'], stale['state'], updated['state']],
                         ['COMMITTED', 'CONFLICT', 'COMMITTED'])
        self.assertEqual(len(self.ddb.rows), 1)
        self.assertEqual(len(self.kms.calls), 3)

    def test_read_resume_has_a_dedicated_signer_and_shares_protected_budget(self):
        result = self.ledger.handle(event('READ_RESUME', 'COMPARE_AND_SWAP',
                                          expected_version=0, next=budget_row()))
        self.assertEqual(result['state'], 'COMMITTED')
        self.assertEqual(self.kms.calls[-1]['KeyId'], ROLES['READ_RESUME']['signing_key_arn'])
        self.assertEqual(len(self.ddb.rows), 1)

    def test_signature_scope_and_row_corruption_fail_closed(self):
        bad_kms = FakeKms(valid=False)
        bad_ledger = Ledger(ddb=self.ddb, kms=bad_kms,
                                                  table='ledger', role_config=ROLES)
        with self.assertRaisesRegex(ValueError, 'SIGNATURE'):
            bad_ledger.handle(event('KPMO', 'READ'))
        wrong_scope = event('KPMO', 'READ')
        wrong_scope['envelope']['scope'] = {**SCOPE, 'quota_owner_id': '*'}
        with self.assertRaisesRegex(ValueError, 'SCOPE'):
            self.ledger.handle(wrong_scope)
        self.ledger.handle(event('KPMO', 'COMPARE_AND_SWAP', expected_version=0, next=budget_row()))
        physical = ('AUTH#GITHUB_READ_BUDGET#' + digest(SCOPE), 'V1')
        self.ddb.rows[physical]['budget_version']['N'] = '2'
        with self.assertRaisesRegex(ValueError, 'STORED_VERSION'):
            self.ledger.handle(event('KPMO', 'READ'))

    def test_unknown_fields_and_unregistered_roles_are_rejected(self):
        malformed = event('KPMO', 'READ')
        malformed['envelope']['untrusted_write'] = True
        with self.assertRaisesRegex(ValueError, 'ACTION_FIELDS'):
            self.ledger.handle(malformed)
        malformed = event('KPMO', 'READ')
        malformed['envelope']['role'] = 'FINALIZER'
        with self.assertRaisesRegex(ValueError, 'ROLE'):
            self.ledger.handle(malformed)


if __name__ == '__main__':
    unittest.main()
