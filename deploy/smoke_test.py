from __future__ import annotations

import json
import os
import sys
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


BASE_URL = os.getenv(
    "KAIOS_SMOKE_BASE_URL",
    "http://127.0.0.1:8787",
).rstrip("/")

ATTEMPTS = int(
    os.getenv(
        "KAIOS_SMOKE_ATTEMPTS",
        "20",
    )
)

INTERVAL_SECONDS = float(
    os.getenv(
        "KAIOS_SMOKE_INTERVAL_SECONDS",
        "1",
    )
)


def request_json(path: str) -> dict[str, Any]:
    request = Request(
        f"{BASE_URL}{path}",
        headers={
            "Accept": "application/json",
            "User-Agent": "kaios-deployment-smoke-test",
        },
        method="GET",
    )

    with urlopen(
        request,
        timeout=10,
    ) as response:
        if response.status != 200:
            raise RuntimeError(
                f"{path} returned HTTP {response.status}"
            )

        return json.loads(
            response.read().decode("utf-8")
        )


def wait_for_health() -> dict[str, Any]:
    last_error: Exception | None = None

    for attempt in range(
        1,
        ATTEMPTS + 1,
    ):
        try:
            payload = request_json(
                "/api/health"
            )

            if payload.get("ok") is True:
                return payload

            last_error = RuntimeError(
                "Health response was not successful."
            )
        except (
            OSError,
            HTTPError,
            URLError,
            TimeoutError,
            json.JSONDecodeError,
            RuntimeError,
        ) as exc:
            last_error = exc

        print(
            f"Waiting for KAIOS Gateway "
            f"({attempt}/{ATTEMPTS}): {last_error}"
        )

        time.sleep(
            INTERVAL_SECONDS
        )

    raise RuntimeError(
        f"KAIOS Gateway did not become healthy: {last_error}"
    )


def verify_portal() -> None:
    request = Request(
        f"{BASE_URL}/portal/",
        headers={
            "Accept": "text/html",
            "User-Agent": "kaios-deployment-smoke-test",
        },
        method="GET",
    )

    with urlopen(
        request,
        timeout=10,
    ) as response:
        body = response.read()

        if response.status != 200:
            raise RuntimeError(
                f"Portal returned HTTP {response.status}"
            )

        if b"KAIOS 2.0" not in body:
            raise RuntimeError(
                "Portal response did not contain KAIOS 2.0."
            )


def verify_fixture_collector() -> dict[str, Any]:
    payload = request_json(
        "/api/collector?mode=fixture"
    )

    data = payload.get("data") or {}

    if payload.get("ok") is not True:
        raise RuntimeError(
            "Collector endpoint was not successful."
        )

    if data.get("mode") != "fixture":
        raise RuntimeError(
            "Collector endpoint did not use fixture mode."
        )

    if data.get("status") not in {
        "operational",
        "degraded",
    }:
        raise RuntimeError(
            "Collector endpoint returned an invalid status."
        )

    return payload


def main() -> int:
    try:
        health = wait_for_health()
        verify_portal()
        collector = verify_fixture_collector()
    except Exception as exc:
        print(
            f"Deployment smoke test failed: {exc}",
            file=sys.stderr,
        )
        return 1

    print(
        json.dumps(
            {
                "ok": True,
                "base_url": BASE_URL,
                "health": (
                    health.get("data") or {}
                ).get("status"),
                "collector": (
                    collector.get("data") or {}
                ).get("status"),
                "portal": "available",
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())