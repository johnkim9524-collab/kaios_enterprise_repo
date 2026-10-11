"""Execute the actual template writer with local service doubles; no AWS proof."""
import ast
import copy
import json
from pathlib import Path
import re
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
SOURCE = json.loads((ROOT / 'infrastructure/aws/staging/autonomous-internal-landing-v1.json').read_text())['Resources']['AutonomousLedgerWriterFunction']['Properties']['Code']['ZipFile']


class ConditionalError(Exception):
    def __init__(self, row):
        self.response = {'Error': {'Code': 'ConditionalCheckFailedException'}, 'Item': copy.deepcopy(row)}


class Ledger:
    def __init__(self, row):
        self.row, self.updates, self.return_corruption = copy.deepcopy(row), 0, None

    def put_item(self, **args):
        if self.row:
            raise ConditionalError(self.row)
        self.row = copy.deepcopy(args['Item'])

    def update_item(self, **args):
        assert args['ReturnValues'] == 'ALL_NEW'
        assert args['ConditionExpression'] == '#s = :reserved AND run_id = :run AND head_sha = :head'
        values = args['ExpressionAttributeValues']
        if any(self.row.get(key) != values[value] for key, value in [('state', ':reserved'), ('run_id', ':run'), ('head_sha', ':head')]):
            raise ConditionalError(self.row)
        self.row.update(state=copy.deepcopy(values[':consumed']), merge_sha=copy.deepcopy(values[':merge']))
        self.updates += 1
        result = copy.deepcopy(self.row)
        if self.return_corruption:
            result[self.return_corruption] = {'S': 'contradictory'}
        return {'Attributes': result}


class Kms:
    valid = True
    def verify(self, **args):
        assert args['MessageType'] == 'DIGEST'
        assert args['SigningAlgorithm'] == 'ECDSA_SHA_256'
        return {'SignatureValid': self.valid}


def load(ledger):
    tree = ast.parse(SOURCE)
    tree.body = [node for node in tree.body if not (
        isinstance(node, ast.Import) and any(alias.name == 'boto3' for alias in node.names)
        or isinstance(node, ast.ImportFrom) and node.module == 'botocore.exceptions'
        or isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id in ('ddb', 'kms') for target in node.targets)
    )]
    keys = re.findall(r"os.environ\['([^']+)'\]", SOURCE)
    namespace = {'ddb': ledger, 'kms': Kms(), 'ClientError': ConditionalError}
    with patch.dict('os.environ', {key: key for key in keys}):
        exec(compile(tree, '<actual-template-ledger-writer>', 'exec'), namespace)
    return namespace


def fixture():
    event = dict(action='CONSUME_RESERVATION', authorization_generation='pr-42-original', nonce_digest='sha256:' + 'a' * 64,
                 run_id='123', head_sha='b' * 40, merge_sha='c' * 40,
                 finalizer_workload_id='FINALIZER_WORKLOAD_ID', finalizer_environment='FINALIZER_ENVIRONMENT',
                 signing_key_arn='FINALIZER_SIGNING_KEY_ARN', signature_b64='AA==')
    row = {key: {'S': value} for key, value in dict(pk='RESERVE#pr-42-original', sk='NONCE#' + event['nonce_digest'],
                                                 run_id='123', head_sha=event['head_sha'], state='RESERVED').items()}
    return event, row


class ConsumptionTests(unittest.TestCase):
    def test_actual_backend_returns_confirmed_tuple(self):
        event, row = fixture()
        ledger = Ledger(row)
        response = load(ledger)['handler'](event, None)
        self.assertEqual(response['contract_version'], '2.0.0')
        for key in ['run_id', 'head_sha', 'merge_sha', 'pk', 'sk', 'state']:
            self.assertEqual(response[key], ledger.row[key]['S'])
        self.assertEqual(ledger.updates, 1)

    def test_corrupted_all_new_never_becomes_success(self):
        for field in ['pk', 'sk', 'run_id', 'head_sha', 'state', 'merge_sha']:
            with self.subTest(field=field):
                event, row = fixture()
                ledger = Ledger(row)
                ledger.return_corruption = field
                with self.assertRaisesRegex(ValueError, 'CONSUME_NOT_CONFIRMED'):
                    load(ledger)['handler'](event, None)

    def test_invalid_signature_denies_before_write(self):
        event, row = fixture()
        ledger = Ledger(row)
        module = load(ledger)
        module['kms'].valid = False
        with self.assertRaisesRegex(ValueError, 'FINALIZER_SIGNATURE_INVALID'):
            module['handler'](event, None)
        self.assertEqual(ledger.updates, 0)

    def test_wrong_original_owner_or_head_denies(self):
        for key in ['run_id', 'head_sha']:
            event, row = fixture()
            row[key] = {'S': '999' if key == 'run_id' else 'd' * 40}
            ledger = Ledger(row)
            with self.assertRaises(ConditionalError):
                load(ledger)['handler'](event, None)
            self.assertEqual(ledger.updates, 0)

    def test_reservation_cas_has_one_owner_and_original_generation(self):
        _, row = fixture()
        ledger = Ledger({})
        module = load(ledger)
        first = module['reserve_once'](row)
        second_row = copy.deepcopy(row)
        second_row['run_id'] = {'S': '456'}
        second = module['reserve_once'](second_row)
        self.assertEqual(first['state'], 'RESERVED')
        self.assertEqual(second, {'state': 'ALREADY_RESERVED', 'owner_run_id': '123'})
        self.assertEqual(ledger.row['pk'], row['pk'])


if __name__ == '__main__':
    unittest.main()
