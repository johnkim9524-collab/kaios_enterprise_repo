from __future__ import annotations

import json
import sys

from scripts import production_smoke


def test_authenticated_production_smoke(
    monkeypatch,
    capsys,
) -> None:
    calls: list[tuple[str, str | None, str]] = []

    def fake_request(
        url: str,
        *,
        token: str | None = None,
        accept: str = "application/json",
    ) -> tuple[int, bytes]:
        calls.append((url, token, accept))

        if url.endswith("/api/health"):
            return 200, json.dumps(
                {
                    "ok": True,
                    "data": {
                        "status": "operational",
                    },
                }
            ).encode()

        if url.endswith("/portal/"):
            return 200, b"<html>KAIOS Portal</html>"

        if url.endswith("/api/collector?mode=fixture"):
            if token is None:
                return 401, b"{}"
            return 200, json.dumps(
                {
                    "ok": True,
                    "data": {
                        "mode": "fixture",
                        "status": "operational",
                    },
                }
            ).encode()

        raise AssertionError(url)

    monkeypatch.setattr(
        production_smoke,
        "request",
        fake_request,
    )
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "production_smoke",
            "--base-url",
            "https://kaios.kidults.com",
            "--admin-token",
            "test-admin-token",
        ],
    )

    assert production_smoke.main() == 0

    output = json.loads(
        capsys.readouterr().out
    )
    assert output["ok"] is True
    assert output["health"] == "operational"
    assert output["portal_http"] == 200
    assert output["unauthenticated_collector_http"] == 401
    assert output["authenticated_collector_http"] == 200
    assert output["collector"] == "operational"
    assert output["collector_mode"] == "fixture"

    assert calls == [
        (
            "https://kaios.kidults.com/api/health",
            None,
            "application/json",
        ),
        (
            "https://kaios.kidults.com/portal/",
            None,
            "text/html",
        ),
        (
            "https://kaios.kidults.com/api/collector?mode=fixture",
            None,
            "application/json",
        ),
        (
            "https://kaios.kidults.com/api/collector?mode=fixture",
            "test-admin-token",
            "application/json",
        ),
    ]
