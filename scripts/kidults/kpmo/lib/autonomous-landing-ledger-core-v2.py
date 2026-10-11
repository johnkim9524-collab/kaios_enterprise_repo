import base64
import hashlib
import json
import os
import re
from datetime import datetime, timezone
import boto3
from botocore.exceptions import ClientError

ddb = boto3.client('dynamodb')
kms = boto3.client('kms')
TABLE = os.environ['LEDGER_TABLE']
REPOSITORY = os.environ['GITHUB_REPOSITORY']
ROLE_KEYS = {
    'ACCOUNTABLE_TRACK_AGENT': os.environ['TRACK_SIGNING_KEY_ARN'],
    'KPMO': os.environ['KPMO_SIGNING_KEY_ARN'],
    'INDEPENDENT_VERIFIER': os.environ['VERIFIER_SIGNING_KEY_ARN'],
}
ROLE_ENVIRONMENTS = {
    'ACCOUNTABLE_TRACK_AGENT': os.environ['TRACK_ENVIRONMENT'],
    'KPMO': os.environ['KPMO_ENVIRONMENT'],
    'INDEPENDENT_VERIFIER': os.environ['VERIFIER_ENVIRONMENT'],
}
ROLE_WORKLOAD_IDS = {
    'ACCOUNTABLE_TRACK_AGENT': os.environ['TRACK_WORKLOAD_ID'],
    'KPMO': os.environ['KPMO_WORKLOAD_ID'],
    'INDEPENDENT_VERIFIER': os.environ['VERIFIER_WORKLOAD_ID'],
}
FINALIZER_SIGNING_KEY = os.environ['FINALIZER_SIGNING_KEY_ARN']
FINALIZER_ENVIRONMENT = os.environ['FINALIZER_ENVIRONMENT']
FINALIZER_WORKLOAD_ID = os.environ['FINALIZER_WORKLOAD_ID']
SHA = re.compile(r'^[0-9a-f]{40}$')
DIGEST = re.compile(r'^sha256:[0-9a-f]{64}$')
GENERATION = re.compile(r'^[A-Za-z0-9._:-]{1,160}$')
RUN_ID = re.compile(r'^[1-9][0-9]{0,19}$')

def required(event, name):
    value = event.get(name)
    if value is None or value == '':
        raise ValueError('FIELD_REQUIRED:' + name)
    return str(value)

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)

def digest(value):
    return 'sha256:' + hashlib.sha256(value.encode('utf-8')).hexdigest()

def validate_generation(value):
    if not GENERATION.fullmatch(value):
        raise ValueError('GENERATION_INVALID')
    return value

def validate_digest(value, code):
    if not DIGEST.fullmatch(value):
        raise ValueError(code)
    return value

def validate_sha(value, code):
    if not SHA.fullmatch(value):
        raise ValueError(code)
    return value

def validate_run_id(value):
    if not RUN_ID.fullmatch(value):
        raise ValueError('RUN_ID_INVALID')
    return value

def put_unique(item):
    ddb.put_item(
        TableName=TABLE,
        Item=item,
        ConditionExpression='attribute_not_exists(pk) AND attribute_not_exists(sk)'
    )

def reserve_once(item):
    try:
        ddb.put_item(
            TableName=TABLE,
            Item=item,
            ConditionExpression='attribute_not_exists(pk) AND attribute_not_exists(sk)',
            ReturnValuesOnConditionCheckFailure='ALL_OLD'
        )
        return {'state': 'RESERVED', 'owner_run_id': item['run_id']['S']}
    except ClientError as error:
        if error.response.get('Error', {}).get('Code') != 'ConditionalCheckFailedException':
            raise
        prior = error.response.get('Item') or {}
        owner_run_id = prior.get('run_id', {}).get('S', '')
        prior_head_sha = prior.get('head_sha', {}).get('S', '')
        prior_state = prior.get('state', {}).get('S', '')
        if prior_state != 'RESERVED' or prior_head_sha != item['head_sha']['S'] or not RUN_ID.fullmatch(owner_run_id):
            raise ValueError('RESERVATION_CONFLICT_INVALID')
        return {'state': 'ALREADY_RESERVED', 'owner_run_id': owner_run_id}

def verify_approval_signature(event, role, envelope):
    expected_key = ROLE_KEYS.get(role)
    expected_environment = ROLE_ENVIRONMENTS.get(role)
    expected_workload_id = ROLE_WORKLOAD_IDS.get(role)
    if not expected_key or not expected_environment or not expected_workload_id:
        raise ValueError('ROLE_FORBIDDEN')
    supplied_key = required(event, 'signing_key_arn')
    if supplied_key != expected_key:
        raise ValueError('SIGNING_KEY_ROLE_MISMATCH')
    workload = envelope.get('workload')
    if not isinstance(workload, dict):
        raise ValueError('WORKLOAD_INVALID')
    if str(workload.get('signing_key_arn', '')) != expected_key:
        raise ValueError('WORKLOAD_SIGNING_KEY_MISMATCH')
    if str(workload.get('environment', '')) != expected_environment:
        raise ValueError('WORKLOAD_ENVIRONMENT_MISMATCH')
    workload_id = required(event, 'workload_id')
    if workload_id != expected_workload_id or str(workload.get('workload_id', '')) != expected_workload_id:
        raise ValueError('WORKLOAD_ID_MISMATCH')
    try:
        signature = base64.b64decode(required(event, 'signature_b64'), validate=True)
    except Exception as error:
        raise ValueError('SIGNATURE_ENCODING_INVALID') from error
    verified = kms.verify(
        KeyId=expected_key,
        Message=hashlib.sha256(canonical(envelope).encode('utf-8')).digest(),
        MessageType='DIGEST',
        Signature=signature,
        SigningAlgorithm='ECDSA_SHA_256',
    )
    if verified.get('SignatureValid') is not True:
        raise ValueError('APPROVAL_SIGNATURE_INVALID')
    return workload_id, expected_key

def verify_finalizer_signature(event):
    if required(event, 'signing_key_arn') != FINALIZER_SIGNING_KEY:
        raise ValueError('FINALIZER_SIGNING_KEY_MISMATCH')
    if required(event, 'finalizer_environment') != FINALIZER_ENVIRONMENT:
        raise ValueError('FINALIZER_ENVIRONMENT_MISMATCH')
    if required(event, 'finalizer_workload_id') != FINALIZER_WORKLOAD_ID:
        raise ValueError('FINALIZER_WORKLOAD_ID_MISMATCH')
    core = {
        'action': required(event, 'action'),
        'authorization_generation': required(event, 'authorization_generation'),
        'nonce_digest': required(event, 'nonce_digest'),
        'run_id': required(event, 'run_id'),
        'head_sha': required(event, 'head_sha'),
        'finalizer_workload_id': FINALIZER_WORKLOAD_ID,
        'finalizer_environment': FINALIZER_ENVIRONMENT,
        'signing_key_arn': FINALIZER_SIGNING_KEY,
    }
    if core['action'] == 'CONSUME_RESERVATION':
        core['merge_sha'] = required(event, 'merge_sha')
    if core['action'] in ['CREATE_CANONICAL_CLAIM','TAKEOVER_CANONICAL_CLAIM','COMMIT_CANONICAL_CLAIM','CREATE_CANONICAL_ALIAS']:
        core['canonical_key'] = required(event, 'canonical_key')
    if core['action'] in ['CREATE_CANONICAL_CLAIM','TAKEOVER_CANONICAL_CLAIM']:
        core['lease_expires_at_epoch'] = required(event, 'lease_expires_at_epoch')
    if core['action'] == 'TAKEOVER_CANONICAL_CLAIM':
        core['prior_lease_epoch'] = required(event, 'prior_lease_epoch')
        core['now_epoch'] = required(event, 'now_epoch')
    if core['action'] == 'COMMIT_CANONICAL_CLAIM':
        core['canonical_receipt_digest'] = required(event, 'canonical_receipt_digest')
        core['lease_epoch'] = required(event, 'lease_epoch')
        core['now_epoch'] = required(event, 'now_epoch')
    if core['action'] == 'CREATE_CANONICAL_ALIAS':
        core['canonical_receipt_digest'] = required(event, 'canonical_receipt_digest')
        core['canonical_run_id'] = required(event, 'canonical_run_id')
        core['alias_run_id'] = required(event, 'alias_run_id')
    try:
        signature = base64.b64decode(required(event, 'signature_b64'), validate=True)
    except Exception as error:
        raise ValueError('FINALIZER_SIGNATURE_ENCODING_INVALID') from error
    verified = kms.verify(
        KeyId=FINALIZER_SIGNING_KEY,
        Message=hashlib.sha256(canonical(core).encode('utf-8')).digest(),
        MessageType='DIGEST',
        Signature=signature,
        SigningAlgorithm='ECDSA_SHA_256',
    )
    if verified.get('SignatureValid') is not True:
        raise ValueError('FINALIZER_SIGNATURE_INVALID')
    return core

def handler(event, context):
    if not isinstance(event, dict):
        raise ValueError('EVENT_INVALID')
    action = required(event, 'action')
    generation = validate_generation(required(event, 'authorization_generation'))
    if action == 'CREATE_APPROVAL':
        role = required(event, 'role')
        if role not in ROLE_KEYS:
            raise ValueError('ROLE_FORBIDDEN')
        raw = base64.b64decode(required(event, 'envelope_b64'), validate=True).decode('utf-8')
        envelope = json.loads(raw)
        if not isinstance(envelope, dict):
            raise ValueError('ENVELOPE_INVALID')
        if str(envelope.get('authorization_generation', '')) != generation:
            raise ValueError('ENVELOPE_GENERATION_MISMATCH')
        if str(envelope.get('repository', '')) != REPOSITORY:
            raise ValueError('ENVELOPE_REPOSITORY_MISMATCH')
        supplied_digest = validate_digest(required(event, 'envelope_digest'), 'ENVELOPE_DIGEST_INVALID')
        if digest(canonical(envelope)) != supplied_digest:
            raise ValueError('ENVELOPE_DIGEST_MISMATCH')
        workload_id, signing_key = verify_approval_signature(event, role, envelope)
        expires_at = str(envelope.get('expires_at', ''))
        try:
            expires_epoch = int(datetime.fromisoformat(expires_at.replace('Z','+00:00')).astimezone(timezone.utc).timestamp())
        except Exception as error:
            raise ValueError('ENVELOPE_EXPIRY_INVALID') from error
        if str(expires_epoch) != required(event, 'expires_at_epoch'):
            raise ValueError('ENVELOPE_EXPIRY_MISMATCH')
        pk = 'AUTH#' + generation
        sk = 'ROLE#' + role
        put_unique({
            'pk': {'S': pk}, 'sk': {'S': sk},
            'envelope': {'S': required(event, 'envelope_b64')},
            'envelope_digest': {'S': supplied_digest},
            'workload_id': {'S': workload_id},
            'signing_key_arn': {'S': signing_key},
            'expires_at_epoch': {'N': str(expires_epoch)}
        })
        return {'ok': True, 'action': action, 'pk': pk, 'sk': sk}
    if action == 'CREATE_RESERVATION':
        verify_finalizer_signature(event)
        nonce = validate_digest(required(event, 'nonce_digest'), 'NONCE_DIGEST_INVALID')
        run_id = validate_run_id(required(event, 'run_id'))
        head_sha = validate_sha(required(event, 'head_sha'), 'HEAD_SHA_INVALID')
        pk = 'RESERVE#' + generation
        sk = 'NONCE#' + nonce
        reservation = reserve_once({
            'pk': {'S': pk}, 'sk': {'S': sk}, 'state': {'S': 'RESERVED'},
            'run_id': {'S': run_id}, 'head_sha': {'S': head_sha}
        })
        return {'ok': True, 'action': action, 'pk': pk, 'sk': sk, **reservation}
    if action == 'CONSUME_RESERVATION':
        verify_finalizer_signature(event)
        nonce = validate_digest(required(event, 'nonce_digest'), 'NONCE_DIGEST_INVALID')
        run_id = validate_run_id(required(event, 'run_id'))
        head_sha = validate_sha(required(event, 'head_sha'), 'HEAD_SHA_INVALID')
        merge_sha = validate_sha(required(event, 'merge_sha'), 'MERGE_SHA_INVALID')
        pk = 'RESERVE#' + generation
        sk = 'NONCE#' + nonce
        result = ddb.update_item(
            TableName=TABLE,
            Key={'pk': {'S': pk}, 'sk': {'S': sk}},
            UpdateExpression='SET #s = :consumed, merge_sha = :merge',
            ConditionExpression='#s = :reserved AND run_id = :run AND head_sha = :head',
            ExpressionAttributeNames={'#s': 'state'},
            ExpressionAttributeValues={
                ':reserved': {'S': 'RESERVED'}, ':consumed': {'S': 'CONSUMED'},
                ':merge': {'S': merge_sha}, ':run': {'S': run_id}, ':head': {'S': head_sha}
            },
            ReturnValues='ALL_NEW'
        )
        attrs = result.get('Attributes', {})
        if any(attrs.get(key, {}).get('S') != value for key, value in
               [('pk', pk), ('sk', sk), ('run_id', run_id), ('head_sha', head_sha),
                ('state', 'CONSUMED'), ('merge_sha', merge_sha)]):
            raise ValueError('CONSUME_NOT_CONFIRMED')
        return {'ok': True, 'contract_version': '2.0.0', 'action': action, 'pk': attrs['pk']['S'], 'sk': attrs['sk']['S'],
                'authorization_generation': generation, 'nonce_digest': nonce, 'run_id': attrs['run_id']['S'],
                'head_sha': attrs['head_sha']['S'], 'merge_sha': attrs['merge_sha']['S'],
                'state': attrs['state']['S'], 'conditional_write': True}
    if action == 'CREATE_CANONICAL_CLAIM':
        verify_finalizer_signature(event)
        canonical_key = validate_digest(required(event, 'canonical_key'), 'CANONICAL_KEY_INVALID')
        run_id = validate_run_id(required(event, 'run_id'))
        head_sha = validate_sha(required(event, 'head_sha'), 'HEAD_SHA_INVALID')
        lease_expires_at = int(required(event, 'lease_expires_at_epoch'))
        service_now = int(datetime.now(timezone.utc).timestamp())
        if lease_expires_at < service_now + 60 or lease_expires_at > service_now + 900:
            raise ValueError('CANONICAL_LEASE_INVALID')
        pk = 'CANONICAL#' + generation + '#' + canonical_key
        sk = 'CLAIM'
        put_unique({'pk': {'S': pk}, 'sk': {'S': sk}, 'state': {'S': 'LEASED'},
            'run_id': {'S': run_id}, 'head_sha': {'S': head_sha},
            'lease_epoch': {'N': '1'}, 'lease_expires_at_epoch': {'N': str(lease_expires_at)}})
        return {'ok': True, 'action': action, 'pk': pk, 'sk': sk, 'state': 'LEASED', 'lease_epoch': 1}
    if action == 'TAKEOVER_CANONICAL_CLAIM':
        verify_finalizer_signature(event)
        canonical_key = validate_digest(required(event, 'canonical_key'), 'CANONICAL_KEY_INVALID')
        run_id = validate_run_id(required(event, 'run_id'))
        head_sha = validate_sha(required(event, 'head_sha'), 'HEAD_SHA_INVALID')
        prior_epoch = int(required(event, 'prior_lease_epoch'))
        now_epoch = int(required(event, 'now_epoch'))
        service_now = int(datetime.now(timezone.utc).timestamp())
        lease_expires_at = int(required(event, 'lease_expires_at_epoch'))
        if abs(now_epoch - service_now) > 30 or lease_expires_at < service_now + 60 or lease_expires_at > service_now + 900:
            raise ValueError('CANONICAL_LEASE_INVALID')
        pk = 'CANONICAL#' + generation + '#' + canonical_key
        result = ddb.update_item(TableName=TABLE, Key={'pk': {'S': pk}, 'sk': {'S': 'CLAIM'}},
            UpdateExpression='SET run_id=:run, head_sha=:head, lease_epoch=:next, lease_expires_at_epoch=:expires',
            ConditionExpression='#s=:leased AND lease_epoch=:prior AND lease_expires_at_epoch < :now',
            ExpressionAttributeNames={'#s':'state'},
            ExpressionAttributeValues={':leased':{'S':'LEASED'},':run':{'S':run_id},':head':{'S':head_sha},
              ':prior':{'N':str(prior_epoch)},':next':{'N':str(prior_epoch+1)},':now':{'N':str(service_now)},':expires':{'N':str(lease_expires_at)}},
            ReturnValues='ALL_NEW')
        return {'ok': True, 'action': action, 'pk': pk, 'state': 'LEASED', 'lease_epoch': prior_epoch+1}
    if action == 'COMMIT_CANONICAL_CLAIM':
        verify_finalizer_signature(event)
        canonical_key = validate_digest(required(event, 'canonical_key'), 'CANONICAL_KEY_INVALID')
        run_id = validate_run_id(required(event, 'run_id'))
        head_sha = validate_sha(required(event, 'head_sha'), 'HEAD_SHA_INVALID')
        receipt_digest = validate_digest(required(event, 'canonical_receipt_digest'), 'CANONICAL_RECEIPT_DIGEST_INVALID')
        lease_epoch = int(required(event, 'lease_epoch'))
        now_epoch = int(required(event, 'now_epoch'))
        service_now = int(datetime.now(timezone.utc).timestamp())
        if abs(now_epoch - service_now) > 30:
            raise ValueError('CANONICAL_CLOCK_INVALID')
        pk = 'CANONICAL#' + generation + '#' + canonical_key
        ddb.update_item(TableName=TABLE, Key={'pk':{'S':pk},'sk':{'S':'CLAIM'}},
          UpdateExpression='SET #s=:committed, canonical_receipt_digest=:digest, committed_at_epoch=:now',
          ConditionExpression='#s=:leased AND run_id=:run AND head_sha=:head AND lease_epoch=:epoch AND lease_expires_at_epoch >= :now',
          ExpressionAttributeNames={'#s':'state'},
          ExpressionAttributeValues={':leased':{'S':'LEASED'},':committed':{'S':'COMMITTED'},':run':{'S':run_id},
            ':head':{'S':head_sha},':epoch':{'N':str(lease_epoch)},':now':{'N':str(service_now)},':digest':{'S':receipt_digest}})
        return {'ok':True,'action':action,'pk':pk,'state':'COMMITTED','lease_epoch':lease_epoch}
    if action == 'CREATE_CANONICAL_ALIAS':
        verify_finalizer_signature(event)
        canonical_key = validate_digest(required(event, 'canonical_key'), 'CANONICAL_KEY_INVALID')
        alias_run_id = validate_run_id(required(event, 'alias_run_id'))
        canonical_run_id = validate_run_id(required(event, 'canonical_run_id'))
        head_sha = validate_sha(required(event, 'head_sha'), 'HEAD_SHA_INVALID')
        receipt_digest = validate_digest(required(event, 'canonical_receipt_digest'), 'CANONICAL_RECEIPT_DIGEST_INVALID')
        pk = 'CANONICAL#' + generation + '#' + canonical_key
        leader = ddb.get_item(TableName=TABLE, Key={'pk':{'S':pk},'sk':{'S':'CLAIM'}}, ConsistentRead=True).get('Item',{})
        if leader.get('state',{}).get('S') != 'COMMITTED' or leader.get('run_id',{}).get('S') != canonical_run_id or leader.get('head_sha',{}).get('S') != head_sha or leader.get('canonical_receipt_digest',{}).get('S') != receipt_digest:
            raise ValueError('CANONICAL_ALIAS_BINDING_INVALID')
        put_unique({'pk':{'S':pk},'sk':{'S':'ALIAS#'+alias_run_id},'state':{'S':'DEDUPED_ALIAS'},
          'alias_run_id':{'S':alias_run_id},'canonical_run_id':{'S':canonical_run_id},'head_sha':{'S':head_sha},
          'canonical_receipt_digest':{'S':receipt_digest}})
        return {'ok':True,'action':action,'pk':pk,'state':'DEDUPED_ALIAS'}
    raise ValueError('ACTION_FORBIDDEN')
