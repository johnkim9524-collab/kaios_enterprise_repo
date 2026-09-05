from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
WORKFLOW_PATH = ROOT / ".github/workflows/kpmo-exact-head-ci-supersession-v1.yml"


def validate_contract(text: str) -> None:
    assert 'if [[ "${head_sha}" == "${EXACT_HEAD_SHA}" ]]; then' in text
    assert '/actions/runs/${run_id}/cancel' in text
    assert '/force-cancel' not in text
    assert 'force_cancel_run' not in text
    assert 'cancellation_authority "NORMAL_CANCEL_ONLY"' in text
    assert 'terminal_readback_bound:{attempts:42,sleep_seconds:5}' in text
    assert 'for readback_attempt in $(seq 1 42); do' in text
    assert 'sleep 5' in text
    assert text.count('readback_result="$(read_run_terminal "${run_id}")"') == 1
    assert 'if [[ "${latest_conclusion}" == "cancelled" ]]' in text
    assert 'Normal cancellation not terminally confirmed within bounded passive read-back' in text
    assert 'same_head_runs_cancelled:0' in text
    assert 'force_cancel_endpoint_present:false' in text

    same_head_guard = text.index('if [[ "${head_sha}" == "${EXACT_HEAD_SHA}" ]]; then')
    normal_cancel_call = text.index('"${api}/actions/runs/${run_id}/cancel")')
    assert same_head_guard < normal_cancel_call

    forbidden = 'if [[ "${code}" == "202" || "${code}" == "409" ]]; then\n                cancelled=$((cancelled + 1))'
    assert forbidden not in text


def expect_rejected(mutated: str, message: str) -> None:
    try:
        validate_contract(mutated)
    except (AssertionError, ValueError):
        return
    raise AssertionError(message)


def test_exact_head_supersession_contract() -> None:
    validate_contract(WORKFLOW_PATH.read_text(encoding="utf-8"))


def test_force_cancel_reintroduction_is_rejected() -> None:
    text = WORKFLOW_PATH.read_text(encoding="utf-8")
    mutated = text.replace(
        '"${api}/actions/runs/${run_id}/cancel")',
        '"${api}/actions/runs/${run_id}/force-cancel")',
        1,
    )
    expect_rejected(mutated, "force-cancel reintroduction was not rejected")


def test_terminal_readback_removal_is_rejected() -> None:
    text = WORKFLOW_PATH.read_text(encoding="utf-8")
    mutated = text.replace(
        'readback_result="$(read_run_terminal "${run_id}")"',
        'readback_result="{\\"status\\":\\"in_progress\\",\\"conclusion\\":\\"\\",\\"attempts\\":0}"',
        1,
    )
    expect_rejected(mutated, "terminal readback removal was not rejected")


def test_same_head_protection_removal_is_rejected() -> None:
    text = WORKFLOW_PATH.read_text(encoding="utf-8")
    mutated = text.replace('if [[ "${head_sha}" == "${EXACT_HEAD_SHA}" ]]; then', 'if false; then', 1)
    expect_rejected(mutated, "same-head protection removal was not rejected")


def test_passive_wait_shrinkage_is_rejected() -> None:
    text = WORKFLOW_PATH.read_text(encoding="utf-8")
    mutated = text.replace('for readback_attempt in $(seq 1 42); do', 'for readback_attempt in $(seq 1 4); do', 1)
    expect_rejected(mutated, "passive terminal readback shrinkage was not rejected")
