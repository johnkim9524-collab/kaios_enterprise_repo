import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import unittest
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('archive', ROOT / 'scripts/kidults/kpmo/read-sentinel-artifact-v1.py')
M = importlib.util.module_from_spec(spec); spec.loader.exec_module(M)
def digest(b): return 'sha256:' + hashlib.sha256(b).hexdigest()
def archive(entries):
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, body in entries: z.writestr(name, body)
    return out.getvalue()

class AuthorityGateArchiveTests(unittest.TestCase):
    def setUp(self):
        self.name = 'kpmo-continuous-assurance-sentinel-health-v1.json'
        self.text = json.dumps({'state': 'VERIFIED_PASS', 'source_sha': 'a' * 40}) + '\n'
        self.inner = archive([(self.name, self.text)])
        self.packet = M.read_packet(self.inner, digest(self.inner))
        self.entries = [('upstream-health.zip', self.inner), ('upstream-health-packet.json', json.dumps(self.packet)),
                        (self.name, self.text + '\n'), ('kpmo-continuous-assurance-success-authority-gate-v1.json', '{}')]
    def read(self, entries=None, expected=None):
        raw = archive(entries or self.entries)
        return M.read_packet(raw, digest(raw), authority_health_digest=expected or digest(self.inner))
    def test_exact_native_gate_packet_accepts_jq_final_newline(self):
        p = self.read(); self.assertFalse(p['extraction_performed']); self.assertEqual(len(p['members']), 4)
    def test_actual_cli_four_argument_mode(self):
        raw = archive(self.entries)
        result = subprocess.run([sys.executable, '-I', str(ROOT / 'scripts/kidults/kpmo/read-sentinel-artifact-v1.py'),
                                 digest(raw), 'AUTHORITY_GATE', digest(self.inner)], input=raw, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertFalse(json.loads(result.stdout)['extraction_performed'])
    def test_normal_archive_mode_still_rejects_nested_health_zip(self):
        raw = archive(self.entries)
        with self.assertRaisesRegex(ValueError, 'NESTED_MEMBER_NOT_ALLOWED'): M.read_packet(raw, digest(raw))
    def test_wrong_bound_health_archive_digest_rejected(self):
        with self.assertRaisesRegex(ValueError, 'HEALTH_ARCHIVE_BINDING'): self.read(expected='sha256:' + '0' * 64)
    def test_missing_nested_archive_rejected(self):
        with self.assertRaisesRegex(ValueError, 'HEALTH_ARCHIVE_MISSING'): self.read(self.entries[1:])
    def test_unrelated_nested_archive_rejected(self):
        with self.assertRaisesRegex(ValueError, 'NESTED_MEMBER_NOT_ALLOWED'): self.read(self.entries + [('other.zip', self.inner)])
    def test_native_packet_sidecar_drift_rejected(self):
        entries=copy.deepcopy(self.entries); packet=copy.deepcopy(self.packet); packet['archive_digest']='sha256:'+'0'*64
        entries[1]=('upstream-health-packet.json',json.dumps(packet))
        with self.assertRaisesRegex(ValueError, 'PACKET_SIDECAR_MISMATCH'): self.read(entries)
    def test_health_content_sidecar_drift_rejected(self):
        entries=copy.deepcopy(self.entries); entries[2]=(self.name,'{"state":"VERIFIED_FAIL"}')
        with self.assertRaisesRegex(ValueError, 'RECEIPT_SIDECAR_MISMATCH'): self.read(entries)
    def test_duplicate_sidecar_json_key_rejected(self):
        entries=copy.deepcopy(self.entries); entries[2]=(self.name,'{"state":"VERIFIED_PASS","state":"VERIFIED_FAIL"}')
        with self.assertRaisesRegex(ValueError, 'JSON_DUPLICATE_KEY'): self.read(entries)

if __name__ == '__main__': unittest.main()
