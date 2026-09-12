from pathlib import Path


WORKFLOW = Path(".github/workflows/kidults-asi-launch-evidence-program-v1.yml")


def _workflow_text() -> str:
    return WORKFLOW.read_text(encoding="utf-8")


def test_launch_evidence_terminal_receipt_is_always_retained_before_failure_reapply():
    text = _workflow_text()

    create = text.index("- name: Create fail-closed terminal receipt")
    upload = text.index("- name: Upload terminal audit evidence")
    reapply = text.index("- name: Reapply fail-closed validation outcome")

    assert create < upload < reapply
    assert text[create:upload].count("if: always()") == 1
    assert text[upload:reapply].count("if: always()") == 1
    assert "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02" in text
    assert "if-no-files-found: error" in text
    assert "kidults-asi-launch-evidence-terminal-v1-${{ github.run_id }}-${{ github.run_attempt }}" in text


def test_launch_evidence_terminal_receipt_is_exact_generation_and_non_promotable():
    text = _workflow_text()

    required = (
        "github.event.pull_request.head.sha || github.sha",
        "github.run_id",
        "github.run_attempt",
        "result_class: 'CONTROL_ONLY'",
        "evidence_admission: 'NONE'",
        "empirical_authority: false",
        "promotion_eligible: false",
        "promotion_authority: false",
        "provider_activation_authority: false",
        "database_mutation_authority: false",
        "external_execution_authority: false",
        "production: 'HOLD'",
        "public: 'HOLD'",
        "g5: 'HOLD'",
    )
    for token in required:
        assert token in text

    assert text.count("tests/test_launch_evidence_terminal_artifact.py") == 2
