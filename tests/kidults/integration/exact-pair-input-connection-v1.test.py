"""Byte-continuity controls only; no live acquisition or runtime evidence."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("input_chain", ROOT / "scripts/kidults/integration/run-exact-pair-product-chain-v1.py")
chain = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chain)


class InputContinuity(unittest.TestCase):
    def fixture(self, directory):
        paths = {name: directory / name for name in ["snapshot-candidate.json", "evidence-package.json", "remote-staging-attestation.json"]}
        for name, file in paths.items():
            file.write_bytes(json.dumps({"test_fixture_only": name}).encode())
        manifest = {"synthetic": False, "promotable": True,
                    "candidate_path": str(paths["snapshot-candidate.json"]),
                    "evidence_path": str(paths["evidence-package.json"]),
                    "remote_staging_attestation_path": str(paths["remote-staging-attestation.json"])}
        for key, name in [("candidate_sha256", "snapshot-candidate.json"), ("evidence_sha256", "evidence-package.json")]:
            manifest[key] = "sha256:" + hashlib.sha256(paths[name].read_bytes()).hexdigest()
        pair = {"snapshot": json.loads(paths["snapshot-candidate.json"].read_bytes()),
                "evidence": json.loads(paths["evidence-package.json"].read_bytes())}
        manifest["exact_pair_digest"] = "sha256:" + hashlib.sha256(json.dumps(pair, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
        return paths, manifest

    def test_downstream_consumes_captured_bytes_and_private_snapshot_is_removed(self):
        with tempfile.TemporaryDirectory(prefix="pair-continuity-test-", dir=ROOT) as temporary:
            directory = Path(temporary)
            originals, manifest = self.fixture(directory)
            before = {name: file.read_bytes() for name, file in originals.items()}
            manifest_path = directory / "manifest.json"
            manifest_path.write_text(json.dumps(manifest))
            captured = []
            def consume(_, candidate, evidence, attestation, output, runtime_manifest):
                for file in originals.values():
                    file.write_text('{"concurrent_drift":true}')
                for name, file in zip(before, [candidate, evidence, attestation]):
                    self.assertEqual(file.read_bytes(), before[name])
                    self.assertNotEqual(file, originals[name])
                    self.assertNotIn(output, file.parents)
                    self.assertEqual(file.stat().st_mode & 0o777, 0o400)
                    captured.append(file)
                return 0
            with patch.object(chain.subprocess, "run", return_value=SimpleNamespace(returncode=0)), patch.object(chain, "advance_captured_pair", side_effect=consume):
                self.assertEqual(chain.main([str(manifest_path), str(directory / "output")]), 0)
            self.assertTrue(captured)
            self.assertTrue(all(not file.exists() for file in captured))

    def test_rejects_each_pair_digest_before_downstream_execution(self):
        for field in ["candidate_sha256", "evidence_sha256", "exact_pair_digest"]:
            with self.subTest(field=field), tempfile.TemporaryDirectory(prefix="pair-drift-test-", dir=ROOT) as temporary:
                directory = Path(temporary)
                _, manifest = self.fixture(directory)
                manifest[field] = "sha256:" + "0" * 64
                manifest_path = directory / "manifest.json"
                manifest_path.write_text(json.dumps(manifest))
                with patch.object(chain.subprocess, "run", return_value=SimpleNamespace(returncode=0)), patch.object(chain, "advance_captured_pair") as downstream:
                    with self.assertRaisesRegex(RuntimeError, "DIGEST_MISMATCH"):
                        chain.main([str(manifest_path), str(directory / "output")])
                    downstream.assert_not_called()


if __name__ == "__main__":
    unittest.main()
