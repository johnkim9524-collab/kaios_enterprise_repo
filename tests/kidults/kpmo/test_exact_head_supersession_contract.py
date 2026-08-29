from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
WORKFLOW_PATH = ROOT / ".github/workflows/kpmo-exact-head-ci-supersession-v1.yml"


def validate_contract(text: str) -> None:
    assert 'if [[ "${head_sha}" == "${EXACT_HEAD_SHA}" ]]; then' in text
    assert '/actions/runs/${run_id}/cancel' in text
    assert '/force-cancel' not in text
    assert 'PASSIVE_TERMINAL_ATTEMPTS: "42"' in text
    assert 'PASSIVE_TERMINAL_SLEEP_SECONDS: "5"' in text
    assert 'seq 1 "${PASSIVE_TERMINAL_ATTEMPTS}"' in text
    assert 'if (( readback_attempt < PASSIVE_TERMINAL_ATTEMPTS )); then' in text
    assert 'sleep "${PASSIVE_TERMINAL_SLEEP_SECONDS}"' in text
    assert 'passive_terminal_attempt_limit:$passive_terminal_attempt_limit' in text
    assert 'passive_terminal_sleep_seconds:$passive_terminal_sleep_seconds' in text
    assert 'if [[ "${latest_conclusion}" == "cancelled" ]]' in text
    assert 'Cancellation not terminally confirmed for run' in text
    assert 'same_head_runs_cancelled:0' in text

    same_head_guard = text.index('if [[ "${head_sha}" == "${EXACT_HEAD_SHA}" ]]; then')
    cancel_request = text.index('/actions/runs/${run_id}/cancel')
    assert same_head_guard < cancel_request

    forbidden = 'if [[ "${code}" == "202" || "${code}" == "409" ]]; then\n                cancelled=$((cancelled + 1))'
    assert forbidden not in text


def test_exact_head_supersession_contract() -> None:
    validate_contract(WORKFLOW_PATH.read_text(encoding="utf-8"))


def test_passive_wait_cannot_be_shortened() -> None:
    text = WORKFLOW_PATH.read_text(encoding="utf-8")
    mutated = text.replace('PASSIVE_TERMINAL_ATTEMPTS: "42"', 'PASSIVE_TERMINAL_ATTEMPTS: "8"', 1)
    try:
        validate_contract(mutated)
    except AssertionError:
        return
    raise AssertionError("passive terminal wait reduction was not rejected")


def test_force_cancel_is_forbidden() -> None:
    text = WORKFLOW_PATH.read_text(encoding="utf-8")
    mutated = text.replace('/actions/runs/${run_id}/cancel', '/actions/runs/${run_id}/force-cancel', 1)
    try:
        validate_contract(mutated)
    except AssertionError:
        return
    raise AssertionError("force-cancel insertion was not rejected")


def test_same_head_cancellation_is_forbidden() -> None:
    text = WORKFLOW_PATH.read_text(encoding="utf-8")
    mutated = text.replace('if [[ "${head_sha}" == "${EXACT_HEAD_SHA}" ]]; then', 'if false; then', 1)
    try:
        validate_contract(mutated)
    except (AssertionError, ValueError):
        return
    raise AssertionError("same-head protection removal was not rejected")
