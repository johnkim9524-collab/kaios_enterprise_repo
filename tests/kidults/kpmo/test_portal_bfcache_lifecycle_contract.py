from pathlib import Path


PORTAL = Path("apps/kidults-enterprise-staging/public/portal-r001/portal-release-001.js")
STORE = Path("apps/kidults-enterprise-staging/public/portal-r001/projection-store.js")


def test_bfcache_restore_fail_closes_and_revalidates_without_stale_response() -> None:
    portal = PORTAL.read_text(encoding="utf-8")
    store = STORE.read_text(encoding="utf-8")

    assert "let portalLifecycleEpoch=0;" in portal
    assert "const refreshEpoch=portalLifecycleEpoch;" in portal
    assert "refreshEpoch!==portalLifecycleEpoch" in portal
    assert "const controller=new AbortController();" in portal
    assert "readPortalProjection({signal:controller.signal})" in portal
    assert "projectionRefreshController?.abort();" in portal
    assert "globalThis.addEventListener('pagehide',disposePortalRuntime);" in portal
    assert "{once:true}" not in portal
    assert "globalThis.addEventListener('pageshow',event=>" in portal
    assert "if(event.persisted)restorePortalRuntime();" in portal
    assert "function restorePortalRuntime()" in portal
    restore = portal.split("function restorePortalRuntime()", 1)[1].split("\n}", 1)[0]
    assert "renderFailure();" in restore
    assert "if(document.visibilityState==='visible')refreshProjection();" in restore

    assert "controlUrl='./data/projection-control-fixture.json',signal" in store
    assert "headers:{Accept:'application/json'},signal" in store
    assert "readPortalProjection({url:controlUrl,controlUrl,signal})" in store


if __name__ == "__main__":
    test_bfcache_restore_fail_closes_and_revalidates_without_stale_response()
    print("PORTAL_BFCACHE_LIFECYCLE_CONTRACT_PASS")
