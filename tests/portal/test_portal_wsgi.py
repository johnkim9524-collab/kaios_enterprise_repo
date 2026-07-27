from __future__ import annotations

from app.api.wsgi import (
    KAIOSWSGIApplication,
)


def invoke(
    path: str,
    method: str = "GET",
):
    captured: dict = {}

    def start_response(
        status,
        headers,
    ) -> None:
        captured["status"] = status
        captured["headers"] = dict(headers)

    application = KAIOSWSGIApplication()

    chunks = application(
        {
            "REQUEST_METHOD": method,
            "PATH_INFO": path,
            "QUERY_STRING": "",
        },
        start_response,
    )

    return (
        captured,
        b"".join(chunks),
    )


def test_root_redirects_to_portal() -> None:
    captured, payload = invoke("/")

    assert captured["status"] == "302 Found"
    assert captured["headers"]["Location"] == "/portal/"
    assert payload == b""


def test_portal_index_is_served() -> None:
    captured, payload = invoke("/portal/")

    assert captured["status"] == "200 OK"
    assert (
        captured["headers"]["Content-Type"]
        == "text/html"
    )
    assert b"KAIOS 2.0" in payload


def test_portal_css_is_served() -> None:
    captured, payload = invoke(
        "/portal/assets/portal.css"
    )

    assert captured["status"] == "200 OK"
    assert captured["headers"][
        "Content-Type"
    ].startswith("text/css")
    assert b"overflow-x: hidden" in payload


def test_portal_javascript_is_served() -> None:
    captured, payload = invoke(
        "/portal/assets/portal.js"
    )

    assert captured["status"] == "200 OK"
    assert "javascript" in captured[
        "headers"
    ]["Content-Type"]
    assert b"/api/runtime?mode=fixture" in payload


def test_portal_rejects_post() -> None:
    captured, payload = invoke(
        "/portal/",
        method="POST",
    )

    assert (
        captured["status"]
        == "405 Method Not Allowed"
    )
    assert payload == b"Method Not Allowed"


def test_path_traversal_is_not_served() -> None:
    captured, _ = invoke(
        "/portal/../README.md"
    )

    assert captured["status"] == "404 Not Found"