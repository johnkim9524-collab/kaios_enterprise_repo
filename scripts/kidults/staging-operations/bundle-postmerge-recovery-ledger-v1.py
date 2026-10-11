"""Deterministically bundle the reviewed component; never deploy to AWS."""
import argparse
import base64
import json
import hashlib
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
TEMPLATE = ROOT / 'infrastructure/aws/staging/autonomous-internal-landing-v1.json'
COMPONENT = ROOT / 'scripts/kidults/kpmo/lib/autonomous_postmerge_recovery_ledger_v1.py'
MARKER = '\n# BEGIN BOUNDED POSTMERGE RECOVERY LEDGER V1\n'
CORE = ROOT / 'scripts/kidults/kpmo/lib/autonomous-landing-ledger-core-v2.py'
INTERRUPTED = ROOT / 'scripts/kidults/kpmo/lib/interrupted-reservation-recovery-ledger-v1.py'
PACKED_MARKER = '# KIDULTS_FIXED_LEDGER_SOURCE_CAPSULE_V1'


def bundled(source):
    # Fixed source inventory; namespaces preserve the original digest contract.
    core = CORE.read_text() if source.startswith(PACKED_MARKER) else source.split(MARKER)[0]
    inventory = {'core': core, 'historical': COMPONENT.read_text(), 'interrupted': INTERRUPTED.read_text()}
    hashes = {key: hashlib.sha256(value.encode()).hexdigest() for key, value in inventory.items()}
    packed = base64.b64encode(zlib.compress(json.dumps(inventory, sort_keys=True, separators=(',', ':')).encode(), 9)).decode('ascii')
    loader = PACKED_MARKER + "\nimport base64, zlib, hashlib, json\n"
    loader += "_ledger_source_hashes = " + repr(hashes) + "\n"
    loader += "_ledger_sources = json.loads(zlib.decompress(base64.b64decode(" + repr(packed) + ")).decode('utf-8'))\n"
    loader += "if set(_ledger_sources) != set(_ledger_source_hashes) or any(hashlib.sha256(v.encode()).hexdigest() != _ledger_source_hashes[k] for k,v in _ledger_sources.items()): raise ValueError('LEDGER_CAPSULE_DIGEST')\n"
    loader += "exec(compile(_ledger_sources['core'], '<ledger-core>', 'exec'), globals())\n"
    loader += "_recovery_namespace = {'__name__': 'bounded_postmerge_recovery'}\nexec(compile(_ledger_sources['historical'], '<historical-recovery>', 'exec'), _recovery_namespace)\n"
    loader += "_interrupted_namespace = {'__name__': 'interrupted_reservation_recovery'}\nexec(compile(_ledger_sources['interrupted'], '<interrupted-recovery>', 'exec'), _interrupted_namespace)\n"
    return loader + '''
_original_landing_handler = handler

def handler(event, context):
    if not isinstance(event, dict):
        raise ValueError('EVENT_INVALID')
    envelope = event.get('envelope')
    if envelope is None:
        if event.get('action') == 'READ_ORIGINAL_CONSUMED_TERMINAL' or (event.get('action') == 'CONSUME_RESERVATION' and 'terminal' in event):
            ledger = _interrupted_namespace['InterruptedReservationRecoveryLedger'](
                ddb=ddb, kms=kms, table=TABLE,
                role_config={role: {'workload_id': ROLE_WORKLOAD_IDS[role], 'signing_key_arn': ROLE_KEYS[role], 'environment': ROLE_ENVIRONMENTS[role]} for role in ROLE_KEYS},
                finalizer_config={'workload_id': FINALIZER_WORKLOAD_ID, 'signing_key_arn': FINALIZER_SIGNING_KEY, 'environment': FINALIZER_ENVIRONMENT},
                receipt_bucket=os.environ['RECEIPT_BUCKET'], receipt_key_arn=os.environ['RECEIPT_KEY_ARN'])
            return ledger.consume_original_terminal(event)
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
    interrupted_methods = {
        'APPROVE_MERGED_RESERVATION_RECOVERY': 'create_approval',
        'APPROVE_FAILED_ASSURANCE_TERMINAL_RECOVERY': 'create_failure_approval',
        'READ_MERGED_RECOVERY': 'read',
        'READ_MERGED_RECOVERY_CONTEXT': 'read_context',
        'READ_FAILED_ASSURANCE_TERMINAL_CONTEXT': 'failure_context',
        'CLAIM_MERGED_RECOVERY': 'claim',
        'CONSUME_MERGED_RECOVERY': 'consume',
        'ACK_MERGED_RECOVERY_IMMUTABLE': 'acknowledge',
        'FINALIZE_FAILED_ASSURANCE_TERMINAL_RECOVERY': 'finalize_failure_terminal',
        'ACK_FAILED_ASSURANCE_TERMINAL_IMMUTABLE': 'acknowledge_failure_terminal',
        'ACK_ORIGINAL_TERMINAL_IMMUTABLE': 'acknowledge_original',
        'SUPERSEDE_EXPIRED_MERGED_RECOVERY': 'supersede',
    }
    interrupted_method = interrupted_methods.get(envelope.get('action'))
    if interrupted_method is not None:
        ledger = _interrupted_namespace['InterruptedReservationRecoveryLedger'](
            ddb=ddb, kms=kms, table=TABLE,
            role_config={role: {'workload_id': ROLE_WORKLOAD_IDS[role],
                              'signing_key_arn': ROLE_KEYS[role],
                              'environment': ROLE_ENVIRONMENTS[role]} for role in ROLE_KEYS},
            finalizer_config={'workload_id': FINALIZER_WORKLOAD_ID,
                              'signing_key_arn': FINALIZER_SIGNING_KEY,
                              'environment': FINALIZER_ENVIRONMENT},
            receipt_bucket=os.environ['RECEIPT_BUCKET'],
            receipt_key_arn=os.environ['RECEIPT_KEY_ARN'],
        )
        return {'ok': True, **getattr(ledger, interrupted_method)(event)}
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
    parser.add_argument('--emit-code-from-stdin', action='store_true')
    args = parser.parse_args()
    if args.emit_code_from_stdin:
        if args.write:
            raise SystemExit('RECOVERY_BUNDLE_MODE_CONFLICT')
        print(json.dumps(bundled(json.load(sys.stdin))))
        return
    template = json.loads(TEMPLATE.read_text())
    properties = template['Resources']['AutonomousLedgerWriterFunction']['Properties']
    code = bundled(properties['Code']['ZipFile'])
    compile(code, '<bundled-ledger>', 'exec')
    receipt_key = {'Fn::GetAtt': ['AutonomousReceiptKey', 'Arn']}
    checked = json.loads(json.dumps(template))
    checked['Resources']['AutonomousLedgerWriterFunction']['Properties']['Code']['ZipFile'] = code
    checked['Resources']['AutonomousLedgerWriterFunction']['Properties']['Environment']['Variables']['RECEIPT_KEY_ARN'] = receipt_key
    checked['Resources']['AutonomousLedgerWriterFunction']['Properties']['Environment']['Variables']['RECEIPT_BUCKET'] = {'Ref': 'AutonomousReceiptBucket'}
    if len(json.dumps(checked, separators=(',', ':')).encode('utf-8')) > 51200:
        raise SystemExit('RECOVERY_CLOUDFORMATION_INLINE_TEMPLATE_BOUND')
    if args.write:
        properties['Code']['ZipFile'] = code
        properties['Environment']['Variables']['RECEIPT_KEY_ARN'] = receipt_key
        properties['Environment']['Variables']['RECEIPT_BUCKET'] = {'Ref': 'AutonomousReceiptBucket'}
        TEMPLATE.write_text(json.dumps(template, indent=2) + '\n')
    else:
        if code != properties['Code']['ZipFile'] or properties['Environment']['Variables'].get('RECEIPT_KEY_ARN') != receipt_key or properties['Environment']['Variables'].get('RECEIPT_BUCKET') != {'Ref': 'AutonomousReceiptBucket'}:
            raise SystemExit('RECOVERY_BUNDLE_OUT_OF_SYNC')
    print(json.dumps({'state': 'LOCAL_RECOVERY_BUNDLE_VALIDATED', 'deployment_performed': False}))


if __name__ == '__main__':
    main()
