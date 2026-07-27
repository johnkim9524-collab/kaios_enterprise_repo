from __future__ import annotations

import json
import os
import sys
from urllib.error import URLError
from urllib.request import Request, urlopen


def health_url() -> str:
    host = os.getenv(
        "KAIOS_HEALTHCHECK_HOST",
        "127.0.0.1",
    )
    port = os.getenv(
        "KAIOS_GATEWAY_PORT",
        "8787",
    )

    return f"http://{host}:{port}/api/health"


def main() -> int:
    request = Request(
        health_url(),
        headers={
            "Accept": "application/json",
            "User-Agent": "kaios-container-healthcheck",
        },
        method="GET",
    )

    try:
        with urlopen(
            request,
            timeout=4,
        ) as response:
            if response.status != 200:
                print(
                    f"Unhealthy HTTP status: {response.status}",
                    file=sys.stderr,
                )
                return 1

            payload = json.loads(
                response.read().decode("utf-8")
            )
    except (
        OSError,
        URLError,
        TimeoutError,
        json.JSONDecodeError,
    ) as exc:
        print(
            f"Healthcheck failed: {exc}",
            file=sys.stderr,
        )
        return 1

    if payload.get("ok") is not True:
        print(
            "Healthcheck response was not successful.",
            file=sys.stderr,
        )
        return 1

    data = payload.get("data") or {}
    status = str(
        data.get("status", "")
    ).strip().lower()

    if status not in {
        "operational",
        "degraded",
    }:
        print(
            f"Unhealthy KAIOS status: {status or 'missing'}",
            file=sys.stderr,
        )
        return 1

    print(
        json.dumps(
            {
                "ok": True,
                "status": status,
                "endpoint": payload.get("endpoint"),
            },
            ensure_ascii=False,
        )
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())