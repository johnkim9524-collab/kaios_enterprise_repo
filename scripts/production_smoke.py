from __future__ import annotations

import argparse
import json
import urllib.request


def fetch_json(url: str) -> dict[str, object]:
    with urllib.request.urlopen(
        url,
        timeout=10,
    ) as response:
        if response.status != 200:
            raise RuntimeError(
                f"Smoke request failed: {response.status}"
            )
        return json.loads(
            response.read().decode("utf-8")
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--base-url",
        required=True,
    )
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    health = fetch_json(
        f"{base}/api/health"
    )

    if health.get("status") not in {
        "ok",
        "healthy",
    }:
        raise RuntimeError(
            "Production health status is not healthy."
        )

    print("Production smoke test passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())