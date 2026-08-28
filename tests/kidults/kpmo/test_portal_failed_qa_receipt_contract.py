from pathlib import Path

WORKFLOW = Path('.github/workflows/kidults-portal-r001-release-qa.yml')
BUILDER = Path('scripts/kidults/kpmo/build-portal-r001-browser-qa-toolchain-receipt-v1.mjs')


def test_failed_browser_qa_always_emits_non_promotable_receipt_contract():
    workflow = WORKFLOW.read_text()
    builder = BUILDER.read_text()

    assert '- name: Build exact toolchain receipt\n        if: always()' in workflow
    assert "const REPORT_FAILURE = 'BROWSER_QA_REPORT_NOT_PASS';" in builder
    assert "state: failure ? 'VERIFIED_FAIL' : 'VERIFIED_PASS'" in builder
    assert 'failure_class: failure' in builder
    assert "browser_qa_result: report?.result || 'UNKNOWN'" in builder
    assert "'A VERIFIED_FAIL receipt is diagnostic control evidence only and is never promotable release or empirical evidence.'" in builder
    assert 'if (OUTPUT_PATH) fs.writeFileSync(OUTPUT_PATH, output);' in builder
    assert 'if (failure) process.exitCode = 1;' in builder
    assert "if (report.result !== 'PASS') fail('BROWSER_QA_REPORT_NOT_PASS')" not in builder


if __name__ == '__main__':
    test_failed_browser_qa_always_emits_non_promotable_receipt_contract()
    print('PORTAL_FAILED_QA_RECEIPT_CONTRACT_PASS')
