from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


CANONICAL_PRODUCTION_ORIGIN = "https://kaios.kidults.com"


class NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(
        self,
        req: Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> None:
        return None


def validate_base_url(value: str) -> str:
    candidate = value.strip()
    parsed = urlsplit(candidate)

    if parsed.scheme != "https":
        raise ValueError("Production smoke base URL must use HTTPS.")
    if parsed.hostname != "kaios.kidults.com":
        raise ValueError("Production smoke base URL host is not canonical.")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("Production smoke base URL must not contain userinfo.")
    if parsed.port is not None:
        raise ValueError("Production smoke base URL must not specify a port.")
    if parsed.path not in {"", "/"}:
        raise ValueError("Production smoke base URL must not contain a path.")
    if parsed.query or parsed.fragment:
        raise ValueError("Production smoke base URL must not contain query or fragment data.")

    return CANONICAL_PRODUCTION_ORIGIN


def request(
    url: str,
    *,
    token: str | None = None,
    accept: str = "application/json",
) -> tuple[int, bytes]:
    headers = {
        "Accept": accept,
        "User-Agent": "kaios-production-certification",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = Request(url, headers=headers, method="GET")
    opener = build_opener(NoRedirectHandler())

    try:
        with opener.open(req, timeout=15) as response:
            return response.status, response.read()
    except HTTPError as exc:
        return exc.code, exc.read()


def decode_json(body: bytes) -> dict[str, Any]:
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("Production endpoint did not return valid JSON.") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("Production endpoint returned an invalid JSON object.")
    return payload


def require_status(actual: int, expected: int, label: str) -> None:
    if actual != expected:
        raise RuntimeError(f"{label} returned HTTP {actual}; expected {expected}.")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--admin-token", default=os.getenv("KAIOS_PRODUCTION_ADMIN_TOKEN", ""))
    args = parser.parse_args()

    try:
        base = validate_base_url(args.base_url)
    except ValueError as exc:
        parser.error(str(exc))

    admin_token = args.admin_token.strip()
    if not admin_token:
        parser.error("An admin token is required through --admin-token or KAIOS_PRODUCTION_ADMIN_TOKEN.")

    try:
        health_status, health_body = request(f"{base}/api/health")
        require_status(health_status, 200, "Health endpoint")
        health = decode_json(health_body)
        health_data = health.get("data") or {}
        health_value = str(health_data.get("status", "")).strip().lower()
        if health.get("ok") is not True:
            raise RuntimeError("Health endpoint reported ok=false.")
        if health_value not in {"operational", "degraded"}:
            raise RuntimeError(f"Production health status is invalid: {health_value or 'missing'}.")

        portal_status, portal_body = request(f"{base}/portal/", accept="text/html")
        require_status(portal_status, 200, "Portal endpoint")
        if b"KAIOS" not in portal_body:
            raise RuntimeError("Portal response did not contain the KAIOS marker.")

        collector_url = f"{base}/api/collector?mode=fixture"
        unauth_status, _ = request(collector_url)
        require_status(unauth_status, 401, "Unauthenticated collector endpoint")

        auth_status, auth_body = request(collector_url, token=admin_token)
        require_status(auth_status, 200, "Authenticated collector endpoint")
        collector = decode_json(auth_body)
        collector_data = collector.get("data") or {}
        collector_status = str(collector_data.get("status", "")).strip().lower()
        if collector.get("ok") is not True:
            raise RuntimeError("Authenticated collector reported ok=false.")
        if collector_data.get("mode") != "fixture":
            raise RuntimeError("Authenticated collector did not run in fixture mode.")
        if collector_status not in {"operational", "degraded"}:
            raise RuntimeError(f"Authenticated collector status is invalid: {collector_status or 'missing'}.")
    except (OSError, URLError, RuntimeError) as exc:
        print(f"Production smoke test failed: {exc}", file=sys.stderr)
        return 1

    print(json.dumps({
        "ok": True,
        "base_url": base,
        "health": health_value,
        "portal_http": portal_status,
        "unauthenticated_collector_http": unauth_status,
        "authenticated_collector_http": auth_status,
        "collector": collector_status,
        "collector_mode": collector_data.get("mode"),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
