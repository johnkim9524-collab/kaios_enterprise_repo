from __future__ import annotations

import json
import os
import socket
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def http_get_json(url: str, headers: dict[str, str] | None = None, timeout: int = 10) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"Accept": "application/json", **(headers or {})}, method="GET")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read()
        return {
            "status_code": response.status,
            "content_type": response.headers.get("Content-Type"),
            "body": json.loads(body.decode("utf-8")) if body else None,
        }


def http_get_status(url: str, timeout: int = 10) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"Accept": "text/html,application/json"}, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            response.read(1024)
            return {"state": "OBSERVED", "status_code": response.status}
    except urllib.error.HTTPError as error:
        return {"state": "OBSERVED_HTTP_ERROR", "status_code": error.code}
    except Exception as error:  # noqa: BLE001
        return {"state": "UNAVAILABLE", "error": type(error).__name__}


def dns_check(hostname: str) -> dict[str, Any]:
    try:
        addresses = sorted({item[4][0] for item in socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)})
        return {"state": "OBSERVED", "addresses": addresses}
    except Exception as error:  # noqa: BLE001
        return {"state": "UNAVAILABLE", "error": type(error).__name__}


def tls_check(hostname: str, timeout: int = 10) -> dict[str, Any]:
    try:
        context = ssl.create_default_context()
        with socket.create_connection((hostname, 443), timeout=timeout) as connection:
            with context.wrap_socket(connection, server_hostname=hostname) as secure:
                certificate = secure.getpeercert()
        return {
            "state": "OBSERVED",
            "subject": certificate.get("subject"),
            "issuer": certificate.get("issuer"),
            "not_after": certificate.get("notAfter"),
        }
    except Exception as error:  # noqa: BLE001
        return {"state": "UNAVAILABLE", "error": type(error).__name__}


def digitalocean_metadata(token: str | None, droplet_id: str | None, timeout: int = 10) -> dict[str, Any]:
    if not token or not droplet_id:
        return {
            "state": "NOT_CONFIGURED",
            "reason": "DIGITALOCEAN_READ_TOKEN and DIGITALOCEAN_DROPLET_ID are required for API metadata."
        }

    url = f"https://api.digitalocean.com/v2/droplets/{urllib.parse.quote(droplet_id, safe='')}"
    try:
        response = http_get_json(url, headers={"Authorization": f"Bearer {token}"}, timeout=timeout)
        droplet = response.get("body", {}).get("droplet", {})
        return {
            "state": "OBSERVED_READ_ONLY",
            "status_code": response["status_code"],
            "droplet": {
                "id": droplet.get("id"),
                "name": droplet.get("name"),
                "status": droplet.get("status"),
                "region": droplet.get("region", {}).get("slug"),
                "size": droplet.get("size_slug"),
                "locked": droplet.get("locked"),
                "tags": droplet.get("tags", []),
            },
        }
    except urllib.error.HTTPError as error:
        return {"state": "API_ERROR", "status_code": error.code}
    except Exception as error:  # noqa: BLE001
        return {"state": "API_ERROR", "error": type(error).__name__}


def main() -> int:
    base_url = os.getenv("KIDULTS_MONITORED_BASE_URL", "https://kaios.kidults.com").rstrip("/")
    parsed = urllib.parse.urlparse(base_url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise SystemExit("KIDULTS_MONITORED_BASE_URL must be an HTTPS URL.")

    output_dir = Path(os.getenv("KIDULTS_AUDIT_OUTPUT", "artifacts/digitalocean-readonly-audit"))
    output_dir.mkdir(parents=True, exist_ok=True)

    report = {
        "audit_id": "digitalocean-readonly-audit",
        "version": "1.0.0",
        "generated_at": utc_now(),
        "mode": "READ_ONLY",
        "target": {"base_url": base_url, "hostname": parsed.hostname},
        "checks": {
            "dns": dns_check(parsed.hostname),
            "tls": tls_check(parsed.hostname),
            "root": http_get_status(f"{base_url}/"),
            "health": http_get_status(f"{base_url}/api/health"),
            "digitalocean_api": digitalocean_metadata(
                os.getenv("DIGITALOCEAN_READ_TOKEN"),
                os.getenv("DIGITALOCEAN_DROPLET_ID"),
            ),
        },
        "mutation_performed": False,
        "production_decision": "HOLD",
        "production_connection_authorized": False,
    }

    public_observed = all(
        report["checks"][name]["state"].startswith("OBSERVED")
        for name in ("dns", "tls", "root", "health")
    )
    do_observed = report["checks"]["digitalocean_api"]["state"] == "OBSERVED_READ_ONLY"
    report["overall_state"] = (
        "READ_ONLY_CONNECTION_VERIFIED"
        if public_observed and do_observed
        else "PUBLIC_ENDPOINT_OBSERVED"
        if public_observed
        else "NOT_VERIFIED"
    )

    output = output_dir / "digitalocean-readonly-audit.json"
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "overall_state": report["overall_state"],
        "mutation_performed": False,
        "output": str(output),
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
