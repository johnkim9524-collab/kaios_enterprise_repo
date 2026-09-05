from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
WORKFLOW_PATH = ROOT / ".github/workflows/kpmo-exact-head-ci-supersession-v1.yml"


def validate_contract(text: str) -> None:
    assert 'if [[ "${head_sha}" == "${EXACT_HEAD_SHA}" ]]; then' in text
    assert '/actions/runs/${target_run_id}/force-cancel' in text
    assert 'force_cancel_attempts=0' in text
    assert 'force_cancelled=0' in text
    assert 'force_cancel_attempts:$force_cancel_attempts' in text
    assert 'force_cancelled:$force_cancelled' in text
    assert text.count('readback_result="$(read_run_terminal "${run_id}")"') >= 2
    assert 'if [[ "${latest_conclusion}" == "cancelled" ]]' in text
    assert 'Cancellation not terminally confirmed for run' in text
    assert 'same_head_runs_cancelled:0' in text
    assert 'generation_bridge_runs_retained:$generation_bridge_retained' in text
    assert ".github/workflows/kidults-direct-owner-landing-handoff-v1.yml" in text
    assert ".github/workflows/kidults-atomic-governed-landing-v1.yml" in text
    assert ".workflow_runs[] | [.id, .head_sha, .status, .path] | @tsv" in text

    bridge_guard = text.index('if retain_generation_bridge "${workflow_path}"; then')
    normal_cancel_call = text.index('/actions/runs/${run_id}/cancel', bridge_guard)
    assert bridge_guard < normal_cancel_call

    same_head_guard = text.index('if [[ "${head_sha}" == "${EXACT_HEAD_SHA}" ]]; then')
    force_cancel_call = text.index('force_result="$(force_cancel_run "${run_id}")"')
    assert same_head_guard < force_cancel_call

    forbidden = 'if [[ "${code}" == "202" || "${code}" == "409" ]]; then\n                cancelled=$((cancelled + 1))'
    assert forbidden not in text


def test_exact_head_supersession_contract() -> None:
    validate_contract(WORKFLOW_PATH.read_text(encoding="utf-8"))


def test_force_cancel_fallback_is_required() -> None:
    text = WORKFLOW_PATH.read_text(encoding="utf-8")
    mutated = text.replace('/actions/runs/${target_run_id}/force-cancel', '/actions/runs/${target_run_id}/cancel', 1)
    try:
        validate_contract(mutated)
    except AssertionError:
        return
    raise AssertionError("force-cancel removal was not rejected")


def test_force_cancel_requires_terminal_readback() -> None:
    text = WORKFLOW_PATH.read_text(encoding="utf-8")
    needle = 'readback_result="$(read_run_terminal "${run_id}")"'
    mutated = text.replace(needle, 'readback_result="{\\"status\\":\\"in_progress\\",\\"conclusion\\":\\"\\",\\"attempts\\":0}"', 1)
    try:
        validate_contract(mutated)
    except AssertionError:
        return
    raise AssertionError("terminal readback removal was not rejected")


def test_same_head_force_cancel_is_forbidden() -> None:
    text = WORKFLOW_PATH.read_text(encoding="utf-8")
    mutated = text.replace('if [[ "${head_sha}" == "${EXACT_HEAD_SHA}" ]]; then', 'if false; then', 1)
    try:
        validate_contract(mutated)
    except (AssertionError, ValueError):
        return
    raise AssertionError("same-head protection removal was not rejected")


def test_direct_owner_generation_bridge_retention_is_required() -> None:
    text = WORKFLOW_PATH.read_text(encoding="utf-8")
    mutated = text.replace(".github/workflows/kidults-direct-owner-landing-handoff-v1.yml", ".github/workflows/removed-direct-owner.yml", 1)
    try:
        validate_contract(mutated)
    except AssertionError:
        return
    raise AssertionError("Direct Owner generation-bridge retention removal was not rejected")


def test_atomic_landing_generation_bridge_retention_is_required() -> None:
    text = WORKFLOW_PATH.read_text(encoding="utf-8")
    mutated = text.replace(".github/workflows/kidults-atomic-governed-landing-v1.yml", ".github/workflows/removed-atomic-landing.yml", 1)
    try:
        validate_contract(mutated)
    except AssertionError:
        return
    raise AssertionError("Atomic Landing generation-bridge retention removal was not rejected")
