from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]


def test_trust_rebuild_node_regressions_are_ci_enforced() -> None:
    completed = subprocess.run(
        ["node", "--test", "tests/trust/rebuild/decision-engine.test.mjs"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr
