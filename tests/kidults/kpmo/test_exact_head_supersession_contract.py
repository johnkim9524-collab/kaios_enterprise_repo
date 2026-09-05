from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
WORKFLOW_PATH = ROOT / ".github/workflows/kpmo-exact-head-ci-supersession-v1.yml"

HANDOFF_FINALIZER_GUARD = 'if [[ "${run_event}" == "workflow_dispatch" && "${workflow_path}" == ".github/workflows/kidults-direct-owner-landing-handoff-v1.yml" ]]; then'
RUN_FIELDS = ".workflow_runs[] | [.id, .head_sha, .status, .name, .event, .path] | @tsv"


def validate_contract(text: str) -> None:
    assert 'if [[ "${head_sha}" == "${EXACT_HEAD_SHA}" ]]; then' in text
    assert HANDOFF_FINALIZER_GUARD in text
    assert RUN_FIELDS in text
    assert 'terminal_finalizer_retained=0' in text
    assert 'terminal_finalizer_retained=$((terminal_finalizer_retained + 1))' in text
    assert 'direct_owner_handoff_finalizers_retained:$terminal_finalizer_retained' in text
    assert '/actions/runs/${target_run_id}/force-cancel' in text
    assert 'force_cancel_attempts=0' in text
    assert 'force_cancelled=0' in text
    assert 'force_cancel_attempts:$force_cancel_attempts' in text
    assert 'force_cancelled:$force_cancelled' in text
    assert text.count('readback_result="$(read_run_terminal "${run_id}")"') >= 2
    assert 'if [[ "${latest_conclusion}" == "cancelled" ]]' in text
    assert 'Cancellation not terminally confirmed for run' in text
    assert 'same_head_runs_cancelled:0' in text

    same_head_guard = text.index('if [[ "${head_sha}" == "${EXACT_HEAD_SHA}" ]]; then')
    finalizer_guard = text.index(HANDOFF_FINALIZER_GUARD)
    normal_cancel_call = text.index('"${api}/actions/runs/${run_id}/cancel")"')
    force_cancel_call = text.index('force_result="$(force_cancel_run "${run_id}")"')
    assert same_head_guard < finalizer_guard < normal_cancel_call < force_cancel_call

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


def test_direct_owner_handoff_finalizer_retention_is_exactly_bound() -> None:
    text = WORKFLOW_PATH.read_text(encoding="utf-8")
    mutated = text.replace(
        '.github/workflows/kidults-direct-owner-landing-handoff-v1.yml',
        '.github/workflows/not-the-handoff-finalizer.yml',
        1,
    )
    try:
        validate_contract(mutated)
    except (AssertionError, ValueError):
        return
    raise AssertionError("handoff finalizer path drift was not rejected")


def test_direct_owner_handoff_finalizer_requires_workflow_dispatch_event() -> None:
    text = WORKFLOW_PATH.read_text(encoding="utf-8")
    mutated = text.replace(
        '"${run_event}" == "workflow_dispatch"',
        '"${run_event}" == "push"',
        1,
    )
    try:
        validate_contract(mutated)
    except (AssertionError, ValueError):
        return
    raise AssertionError("handoff finalizer event drift was not rejected")


def test_ordinary_stale_run_still_reaches_cancellation_path() -> None:
    text = WORKFLOW_PATH.read_text(encoding="utf-8")
    finalizer_guard = text.index(HANDOFF_FINALIZER_GUARD)
    normal_cancel_call = text.index('"${api}/actions/runs/${run_id}/cancel")"')
    assert normal_cancel_call > finalizer_guard
    guarded_block = text[finalizer_guard:normal_cancel_call]
    assert 'continue' in guarded_block
    assert 'workflow_dispatch' in guarded_block
    assert '.github/workflows/kidults-direct-owner-landing-handoff-v1.yml' in guarded_block
    assert 'workflow_name' not in HANDOFF_FINALIZER_GUARD
