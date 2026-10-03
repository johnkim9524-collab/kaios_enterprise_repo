"""Deterministically bundle the reviewed component; never deploy to AWS."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
TEMPLATE = ROOT / 'infrastructure/aws/staging/autonomous-internal-landing-v1.json'
COMPONENT = ROOT / 'scripts/kidults/kpmo/lib/autonomous_postmerge_recovery_ledger_v1.py'
MARKER = '\n# BEGIN BOUNDED POSTMERGE RECOVERY LEDGER V1\n'


def bundled(source):
    # Isolate component globals: its digest accepts JSON values whereas the
    # original writer digest accepts strings. Never override the old helpers.
    prefix = source.split(MARKER)[0]
    component = COMPONENT.read_text()
    return prefix + MARKER + "_recovery_namespace = {'__name__': 'bounded_postmerge_recovery'}\nexec(" + repr(component) + ", _recovery_namespace)\n" + '''
_original_landing_handler = handler

def handler(event, context):
    if not isinstance(event, dict):
        raise ValueError('EVENT_INVALID')
    envelope = event.get('envelope')
    if envelope is None:
        return _original_landing_handler(event, context)
    if not isinstance(envelope, dict):
        raise ValueError('RECOVERY_ENVELOPE_INVALID')
    methods = {
        'READ_POSTMERGE_RECOVERY_CONTEXT': 'read_context',
        'CREATE_RECOVERY_APPROVAL': 'create_approval',
        'READ_RECOVERY_AUTHORITY': 'read_authority',
        'CONSUME_RECOVERY_RESERVATION': 'consume',
        'ACK_RECOVERY_IMMUTABLE_RECEIPT': 'acknowledge',
    }
    method = methods.get(envelope.get('action'))
    if method is None:
        raise ValueError('RECOVERY_ACTION_FORBIDDEN')
    ledger = _recovery_namespace['RecoveryLedger'](
        ddb=ddb, kms=kms, table=TABLE,
        role_config={role: {'workload_id': ROLE_WORKLOAD_IDS[role],
                          'signing_key_arn': ROLE_KEYS[role],
                          'environment': ROLE_ENVIRONMENTS[role]} for role in ROLE_KEYS},
        finalizer_config={'workload_id': FINALIZER_WORKLOAD_ID,
                          'signing_key_arn': FINALIZER_SIGNING_KEY,
                          'environment': FINALIZER_ENVIRONMENT},
        receipt_key_arn=os.environ['RECEIPT_KEY_ARN'],
    )
    return {'ok': True, **getattr(ledger, method)(event)}
'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    template = json.loads(TEMPLATE.read_text())
    properties = template['Resources']['AutonomousLedgerWriterFunction']['Properties']
    code = bundled(properties['Code']['ZipFile'])
    compile(code, '<bundled-ledger>', 'exec')
    receipt_key = {'Fn::GetAtt': ['AutonomousReceiptKey', 'Arn']}
    if args.write:
        properties['Code']['ZipFile'] = code
        properties['Environment']['Variables']['RECEIPT_KEY_ARN'] = receipt_key
        TEMPLATE.write_text(json.dumps(template, indent=2) + '\n')
    else:
        if code != properties['Code']['ZipFile'] or properties['Environment']['Variables'].get('RECEIPT_KEY_ARN') != receipt_key:
            raise SystemExit('RECOVERY_BUNDLE_OUT_OF_SYNC')
    print(json.dumps({'state': 'LOCAL_RECOVERY_BUNDLE_VALIDATED', 'deployment_performed': False}))


if __name__ == '__main__':
    main()
