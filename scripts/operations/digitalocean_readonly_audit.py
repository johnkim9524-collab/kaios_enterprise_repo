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


CANONICAL_BASE_URL = "https://kaios.kidults.com"
CANONICAL_HOSTNAME = "kaios.kidults.com"


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001, D401
        return None


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def open_no_redirect(request: urllib.request.Request, timeout: int):
    opener = urllib.request.build_opener(NoRedirectHandler())
    return opener.open(request, timeout=timeout)


def http_get_json(url: str, headers: dict[str, str] | None = None, timeout: int = 10) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"Accept": "application/json", **(headers or {})}, method="GET")
    with open_no_redirect(request, timeout=timeout) as response:
        body = response.read()
        return {
            "status_code": response.status,
            "content_type": response.headers.get("Content-Type"),
            "body": json.loads(body.decode("utf-8")) if body else None,
        }


def http_get_status(url: str, timeout: int = 10) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"Accept": "text/html,application/json"}, method="GET")
    try:
        with open_no_redirect(request, timeout=timeout) as response:
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
            "reason": "DIGITALOCEAN_READ_TOKEN and DIGITALOCEAN_DROPLET_ID are required for API metadata.",
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


def validate_canonical_base_url(base_url: str) -> str:
    candidate = base_url.strip().rstrip("/")
    parsed = urllib.parse.urlparse(candidate)
    if parsed.scheme != "https":
        raise SystemExit("KIDULTS_MONITORED_BASE_URL must use HTTPS.")
    if parsed.hostname != CANONICAL_HOSTNAME:
        raise SystemExit("KIDULTS_MONITORED_BASE_URL must target the canonical kaios.kidults.com host.")
    if parsed.username is not None or parsed.password is not None:
        raise SystemExit("KIDULTS_MONITORED_BASE_URL must not contain userinfo.")
    if parsed.port is not None:
        raise SystemExit("KIDULTS_MONITORED_BASE_URL must not contain an explicit port.")
    if parsed.path not in ("", "/") or parsed.params or parsed.query or parsed.fragment:
        raise SystemExit("KIDULTS_MONITORED_BASE_URL must not contain path, params, query, or fragment.")
    if candidate != CANONICAL_BASE_URL:
        raise SystemExit("KIDULTS_MONITORED_BASE_URL must equal the canonical runtime URL.")
    return candidate


def classify_overall_state(public_observed: bool, do_observed: bool) -> str:
    if public_observed and do_observed:
        return "PUBLIC_RUNTIME_AND_DROPLET_METADATA_OBSERVED_INDEPENDENTLY"
    if public_observed:
        return "PUBLIC_ENDPOINT_OBSERVED"
    if do_observed:
        return "DROPLET_METADATA_OBSERVED_ONLY"
    return "NOT_VERIFIED"


def main() -> int:
    base_url = validate_canonical_base_url(
        os.getenv("KIDULTS_MONITORED_BASE_URL", CANONICAL_BASE_URL)
    )
    parsed = urllib.parse.urlparse(base_url)

    output_dir = Path(os.getenv("KIDULTS_AUDIT_OUTPUT", "artifacts/digitalocean-readonly-audit"))
    output_dir.mkdir(parents=True, exist_ok=True)

    report = {
        "audit_id": "digitalocean-readonly-audit",
        "version": "1.1.0",
        "generated_at": utc_now(),
        "mode": "READ_ONLY",
        "target": {"base_url": base_url, "hostname": parsed.hostname},
        "checks": {
            "dns": dns_check(parsed.hostname or CANONICAL_HOSTNAME),
            "tls": tls_check(parsed.hostname or CANONICAL_HOSTNAME),
            "root": http_get_status(f"{base_url}/"),
            "health": http_get_status(f"{base_url}/api/health"),
            "digitalocean_api": digitalocean_metadata(
                os.getenv("DIGITALOCEAN_READ_TOKEN"),
                os.getenv("DIGITALOCEAN_DROPLET_ID"),
            ),
        },
        "binding": {
            "runtime_droplet_binding_verified": False,
            "binding_method": "NONE",
            "reason": "Public runtime observation and DigitalOcean droplet metadata are independent evidence unless a separate binding proof is produced.",
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
    report["overall_state"] = classify_overall_state(public_observed, do_observed)

    output = output_dir / "digitalocean-readonly-audit.json"
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "overall_state": report["overall_state"],
        "runtime_droplet_binding_verified": False,
        "mutation_performed": False,
        "output": str(output),
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
