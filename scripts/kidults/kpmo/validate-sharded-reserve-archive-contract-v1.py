#!/usr/bin/env python3
import argparse, hashlib, json, pathlib, stat, sys, zipfile
from datetime import datetime, timezone

SCHEMA = 'KIDULTS_SHARDED_RESERVE_ARCHIVE_CONTRACT_V1'
ROOT = 'asi-sharded-source-reserve-v1/'
MANIFEST_NAME = ROOT + 'asi-sharded-source-reserve-manifest-v1.json'
ACTIVATION_NAME = 'asi-sharded-source-reserve-activation-receipt-v1.json'
MAX_COMPRESSED = 4 * 1024 * 1024
MAX_ENTRIES = 258
MAX_ENTRY = 2 * 1024 * 1024
MAX_TOTAL = 8 * 1024 * 1024
MAX_RATIO = 100.0

class ContractError(RuntimeError):
    pass

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def stable_digest(value) -> str:
    raw = json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
    return 'sha256:' + sha256_bytes(raw)

def fail(code, detail=None):
    raise ContractError(code if detail is None else f'{code}:{detail}')

def safe_name(name: str):
    if not name or name.startswith('/') or '\\' in name or '\x00' in name:
        fail('ARCHIVE_ENTRY_NAME_UNSAFE', repr(name))
    parts = pathlib.PurePosixPath(name).parts
    if any(p in ('', '.', '..') for p in parts):
        fail('ARCHIVE_ENTRY_PATH_UNSAFE', repr(name))
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in name):
        fail('ARCHIVE_ENTRY_CONTROL_CHARACTER', repr(name))

def is_regular_zip_member(info: zipfile.ZipInfo) -> bool:
    mode = (info.external_attr >> 16) & 0xFFFF
    if not mode:
        return not info.is_dir()
    kind = stat.S_IFMT(mode)
    return kind in (0, stat.S_IFREG)

def validate(args):
    archive = pathlib.Path(args.archive)
    if not archive.is_file():
        fail('ARCHIVE_MISSING')
    size = archive.stat().st_size
    if size <= 0 or size > MAX_COMPRESSED:
        fail('ARCHIVE_COMPRESSED_SIZE_LIMIT', size)
    archive_bytes = archive.read_bytes()
    archive_digest = 'sha256:' + sha256_bytes(archive_bytes)
    if archive_digest.lower() != args.expected_digest.lower():
        fail('ARCHIVE_DIGEST_MISMATCH')

    expected_shards = [f'{ROOT}shards/{i:02x}.ndjson' for i in range(256)]
    expected_names = set([MANIFEST_NAME, ACTIVATION_NAME, *expected_shards])
    with zipfile.ZipFile(archive, 'r') as zf:
        infos = zf.infolist()
        names = [i.filename for i in infos]
        if len(infos) != MAX_ENTRIES:
            fail('ARCHIVE_ENTRY_COUNT_EXACT', len(infos))
        if len(set(names)) != len(names):
            fail('ARCHIVE_DUPLICATE_ENTRY')
        if set(names) != expected_names:
            missing = sorted(expected_names - set(names))
            extra = sorted(set(names) - expected_names)
            fail('ARCHIVE_ENTRY_SET_MISMATCH', json.dumps({'missing': missing[:4], 'extra': extra[:4]}, separators=(',', ':')))
        total = 0
        for info in infos:
            safe_name(info.filename)
            if info.is_dir() or not is_regular_zip_member(info):
                fail('ARCHIVE_NON_REGULAR_ENTRY', info.filename)
            if info.file_size < 0 or info.file_size > MAX_ENTRY:
                fail('ARCHIVE_ENTRY_UNCOMPRESSED_SIZE_LIMIT', info.filename)
            total += info.file_size
            if total > MAX_TOTAL:
                fail('ARCHIVE_TOTAL_UNCOMPRESSED_SIZE_LIMIT', total)
            ratio = info.file_size / max(info.compress_size, 1)
            if ratio > MAX_RATIO:
                fail('ARCHIVE_COMPRESSION_RATIO_LIMIT', info.filename)

        manifest_raw = zf.read(MANIFEST_NAME)
        manifest = json.loads(manifest_raw.decode('utf-8'))
        if manifest.get('id') != 'kidults-asi-sharded-source-reserve-manifest-v1': fail('MANIFEST_ID')
        if manifest.get('status') != 'SHADOW_SHARDED_DISCOVERY_SOURCE_RESERVE_READY': fail('MANIFEST_STATE')
        if int(manifest.get('shard_count', -1)) != 256: fail('MANIFEST_SHARD_COUNT')
        shards = manifest.get('shards')
        if not isinstance(shards, list) or len(shards) != 256: fail('MANIFEST_SHARDS_CARDINALITY')
        if manifest.get('production') != 'HOLD' or manifest.get('public_release') != 'HOLD': fail('MANIFEST_RELEASE_BOUNDARY')
        if manifest.get('acquisition_authorized') is not False or manifest.get('content_acquired') is not False: fail('MANIFEST_ACQUISITION_BOUNDARY')

        digest_rows = []
        total_candidates = 0
        nonempty = 0
        for idx, row in enumerate(shards):
            sid = f'{idx:02x}'
            rel = f'shards/{sid}.ndjson'
            full = ROOT + rel
            if row.get('shard_id') != sid or row.get('path') != rel: fail('MANIFEST_SHARD_ORDER', sid)
            content = zf.read(full)
            if sha256_bytes(content) != row.get('sha256'): fail('SHARD_DIGEST', sid)
            lines = [x for x in content.decode('utf-8').splitlines() if x]
            expected_count = int(row.get('candidate_count', -1))
            if len(lines) != expected_count: fail('SHARD_CANDIDATE_COUNT', sid)
            total_candidates += len(lines)
            if lines: nonempty += 1
            digest_rows.append(f"{sid}:{row.get('sha256')}:{expected_count}")
        global_digest = 'sha256:' + sha256_bytes('|'.join(digest_rows).encode())
        if global_digest != manifest.get('global_digest'): fail('GLOBAL_DIGEST')
        if total_candidates < 1: fail('EMPTY_RESERVE')
        if total_candidates != int(manifest.get('unique_candidate_count', -1)): fail('GLOBAL_CANDIDATE_COUNT')
        if nonempty != int(manifest.get('nonempty_shard_count', -1)): fail('GLOBAL_NONEMPTY_SHARD_COUNT')

        activation_raw = zf.read(ACTIVATION_NAME)
        activation = json.loads(activation_raw.decode('utf-8'))
        if activation.get('id') != 'kidults-asi-sharded-source-reserve-activation-receipt-v1': fail('ACTIVATION_ID')
        if activation.get('state') != 'VERIFIED_PASS': fail('ACTIVATION_STATE')
        if activation.get('exact_generation_bound') is not True: fail('ACTIVATION_EXACT_BINDING')
        if activation.get('promotion_authority') is not False: fail('ACTIVATION_PROMOTION_AUTHORITY')
        if activation.get('content_acquisition_authorized') is not False or activation.get('collection_right_created') is not False: fail('ACTIVATION_EXTERNAL_AUTHORITY')
        if activation.get('public_release') != 'HOLD' or activation.get('production') != 'HOLD': fail('ACTIVATION_RELEASE_BOUNDARY')
        if int(activation.get('reserve_cycle', -1)) != int(manifest.get('cycle_number', -2)): fail('ACTIVATION_CYCLE_BINDING')
        if int(activation.get('reserve_unique_candidates', -1)) != total_candidates: fail('ACTIVATION_CANDIDATE_BINDING')
        if int(activation.get('reserve_nonempty_shards', -1)) != nonempty: fail('ACTIVATION_SHARD_BINDING')
        if args.expected_source_sha and activation.get('discovery_producer_head_sha') != args.expected_source_sha: fail('ACTIVATION_SOURCE_SHA')

        shard_set_digest = stable_digest([
            {'shard_id': f'{i:02x}', 'path': f'shards/{i:02x}.ndjson', 'sha256': shards[i]['sha256'], 'candidate_count': int(shards[i]['candidate_count'])}
            for i in range(256)
        ])
        return {
            'schema': SCHEMA,
            'state': 'VERIFIED_PASS',
            'archive_digest': archive_digest,
            'archive_compressed_bytes': size,
            'entry_count': len(infos),
            'total_uncompressed_bytes': total,
            'manifest_digest': 'sha256:' + sha256_bytes(manifest_raw),
            'activation_receipt_digest': 'sha256:' + sha256_bytes(activation_raw),
            'shard_set_digest': shard_set_digest,
            'shard_count': 256,
            'candidate_count': total_candidates,
            'nonempty_shard_count': nonempty,
            'source_sha': activation.get('discovery_producer_head_sha'),
            'promotion_eligible': False,
            'public': 'HOLD',
            'production': 'HOLD',
        }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--archive', required=True)
    ap.add_argument('--expected-digest', required=True)
    ap.add_argument('--expected-source-sha')
    ap.add_argument('--receipt', required=True)
    args = ap.parse_args()
    observed = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    try:
        result = validate(args)
        result['observed_at'] = observed
        code = 0
    except Exception as exc:
        result = {
            'schema': SCHEMA,
            'state': 'VERIFIED_FAIL',
            'failure_class': str(exc),
            'promotion_eligible': False,
            'public': 'HOLD',
            'production': 'HOLD',
            'observed_at': observed,
        }
        code = 1
    pathlib.Path(args.receipt).parent.mkdir(parents=True, exist_ok=True)
    pathlib.Path(args.receipt).write_text(json.dumps(result, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps(result, sort_keys=True))
    return code

if __name__ == '__main__':
    sys.exit(main())
