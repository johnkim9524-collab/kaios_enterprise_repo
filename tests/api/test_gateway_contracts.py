from __future__ import annotations

from app.api.contracts import (
    error_response,
    success_response,
)


def test_success_response_contract() -> None:
    response = success_response(
        endpoint="/api/test",
        data={"value": 1},
    )

    assert response.status_code == 200
    assert response.body == {
        "ok": True,
        "endpoint": "/api/test",
        "data": {"value": 1},
        "error": None,
    }


def test_error_response_contract() -> None:
    response = error_response(
        endpoint="/api/test",
        error_type="test_error",
        message="Test failure",
        status_code=400,
    )

    assert response.status_code == 400
    assert response.body["ok"] is False
    assert response.body["data"] is None
    assert response.body["error"] == {
        "type": "test_error",
        "message": "Test failure",
    }