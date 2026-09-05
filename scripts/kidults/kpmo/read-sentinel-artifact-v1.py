#!/usr/bin/env python3
"""Read one bounded immutable ZIP from stdin. Never extract or execute members."""
import hashlib
import io
import json
import math
from pathlib import PurePosixPath
import re
import stat
import sys
import zipfile

MAX_ARCHIVE = 8 * 1024 * 1024
MAX_MEMBER = 8 * 1024 * 1024
MAX_TOTAL = 32 * 1024 * 1024

def fail(code):
    raise ValueError(code)

def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            fail('JSON_DUPLICATE_KEY')
        result[key] = value
    return result

def finite_number(token, integer=False):
    # parse_constant handles NaN/Infinity literals, but not valid JSON numbers
    # such as 1e999 or very long integers that overflow a JS Number consumer.
    if not math.isfinite(float(token)):
        fail('JSON_NONFINITE_VALUE')
    return int(token) if integer else float(token)

def strict_json(text):
    return json.loads(text, object_pairs_hook=unique_object,
                      parse_constant=lambda _: fail('JSON_NONFINITE_VALUE'),
                      parse_float=finite_number,
                      parse_int=lambda token: finite_number(token, integer=True))

def read_packet(raw, expected):
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', expected):
        fail('ARCHIVE_EXPECTED_DIGEST_INVALID')
    if not raw or len(raw) > MAX_ARCHIVE:
        fail('ARCHIVE_SIZE_LIMIT')
    if 'sha256:' + hashlib.sha256(raw).hexdigest() != expected:
        fail('ARCHIVE_DIGEST_MISMATCH')
    members, seen, total = [], set(), 0
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries = archive.infolist()
        if not 0 < len(entries) <= 512:
            fail('ARCHIVE_ENTRY_COUNT_LIMIT')
        for item in entries:
            name = item.filename
            if name != item.orig_filename:
                fail('ARCHIVE_UNSAFE_ORIGINAL_NAME')
            parts = name.rstrip('/').split('/')
            if (not name or name.startswith('/') or '\\' in name or ':' in name
                    or any(p in ('', '.', '..') for p in parts)
                    or any(ord(c) < 32 or ord(c) == 127 for c in name)):
                fail('ARCHIVE_UNSAFE_NAME')
            normalized = '/'.join(parts)
            if normalized in seen:
                fail('ARCHIVE_DUPLICATE_MEMBER')
            seen.add(normalized)
            mode = item.external_attr >> 16
            allowed = (0, stat.S_IFDIR) if item.is_dir() else (0, stat.S_IFREG)
            if stat.S_IFMT(mode) not in allowed or item.flag_bits & 1:
                fail('ARCHIVE_UNSAFE_MEMBER_TYPE')
            if item.file_size > MAX_MEMBER:
                fail('ARCHIVE_MEMBER_SIZE_LIMIT')
            total += item.file_size
            if total > MAX_TOTAL or item.file_size > max(item.compress_size, 1) * 100:
                fail('ARCHIVE_EXPANSION_LIMIT')
        # Validate every member including CRC, not just the selected receipt.
        for item in entries:
            if item.is_dir():
                continue
            data = archive.read(item)
            if len(data) != item.file_size:
                fail('ARCHIVE_MEMBER_LENGTH')
            text = data.decode('utf-8', errors='strict')
            if item.filename.endswith('.json'):
                strict_json(text)
            if item.filename.endswith('.ndjson'):
                for line in text.splitlines():
                    if line.strip():
                        strict_json(line)
            members.append({'name': item.filename, 'text': text})
    return {'archive_digest': expected, 'members': members, 'extraction_performed': False}

if __name__ == '__main__':
    try:
        if len(sys.argv) != 2:
            fail('ARGUMENTS_INVALID')
        value = read_packet(sys.stdin.buffer.read(MAX_ARCHIVE + 1), sys.argv[1])
        print(json.dumps(value, ensure_ascii=False, separators=(',', ':')))
    except (ValueError, OSError, UnicodeError, RuntimeError, RecursionError, zipfile.BadZipFile):
        # Never echo untrusted archive text, filenames, or signed URLs.
        print('SENTINEL_ARCHIVE_CONTENT_REJECTED', file=sys.stderr)
        raise SystemExit(1)
