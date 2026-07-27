from __future__ import annotations

import json

from app.api.wsgi import (
    KAIOSWSGIApplication,
)


def test_wsgi_health_request() -> None:
    captured: dict = {}

    def start_response(
        status,
        headers,
    ) -> None:
        captured["status"] = status
        captured["headers"] = headers

    application = KAIOSWSGIApplication()

    chunks = application(
        {
            "REQUEST_METHOD": "GET",
            "PATH_INFO": "/api/health",
            "QUERY_STRING": "",
        },
        start_response,
    )

    payload = json.loads(
        b"".join(chunks).decode("utf-8")
    )

    assert captured["status"] == "200 OK"
    assert payload["ok"] is True
    assert payload["endpoint"] == "/api/health"


def test_wsgi_query_string_is_parsed() -> None:
    captured: dict = {}

    def start_response(
        status,
        headers,
    ) -> None:
        captured["status"] = status

    application = KAIOSWSGIApplication()

    chunks = application(
        {
            "REQUEST_METHOD": "GET",
            "PATH_INFO": "/api/collector",
            "QUERY_STRING": "mode=fixture",
        },
        start_response,
    )

    payload = json.loads(
        b"".join(chunks).decode("utf-8")
    )

    assert captured["status"] == "200 OK"
    assert payload["data"]["mode"] == "fixture"