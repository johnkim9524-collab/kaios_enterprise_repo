from pathlib import Path


SOURCE = Path("apps/kidults-enterprise-staging/public/portal-r001/portal-release-001.js")


def test_hidden_initial_state_allows_one_fail_closed_projection_read() -> None:
    source = SOURCE.read_text(encoding="utf-8")

    assert "async function refreshProjection(allowHiddenInitialRead=false)" in source
    assert (
        "(!allowHiddenInitialRead&&document.visibilityState==='hidden')" in source
    )
    assert "refreshProjection(true);" in source
    assert (
        "if(portalDisposed||document.visibilityState==='hidden')return;" in source
    )
    assert (
        "async function refreshProjection(){\n"
        "  if(portalDisposed||projectionRefreshInFlight||"
        "document.visibilityState==='hidden')return;"
    ) not in source


if __name__ == "__main__":
    test_hidden_initial_state_allows_one_fail_closed_projection_read()
    print("PORTAL_INITIAL_HIDDEN_READ_CONTRACT_PASS")
