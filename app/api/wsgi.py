from __future__ import annotations

import json
import mimetypes
from http import HTTPStatus
from pathlib import Path
from time import monotonic
from uuid import uuid4
from typing import Any
from urllib.parse import parse_qs

from app.api.contracts import (
    GatewayRequest,
    SECURITY_HEADERS,
)
from app.api.gateway import KAIOSGateway
from app.observability import observability


ROOT = Path(__file__).resolve().parents[2]
PUBLIC_ROOT = ROOT / "public"
PORTAL_ROOT = PUBLIC_ROOT / "portal"


class KAIOSWSGIApplication:
    def __init__(
        self,
        gateway: KAIOSGateway | None = None,
    ) -> None:
        self.gateway = (
            gateway
            if gateway is not None
            else KAIOSGateway()
        )

    def _portal_file(
        self,
        path: str,
    ) -> Path | None:
        if path in {"/portal", "/portal/"}:
            candidate = PORTAL_ROOT / "index.html"
        elif path.startswith("/portal/"):
            candidate = (
                PORTAL_ROOT
                / path.removeprefix("/portal/")
            )
        else:
            return None

        try:
            resolved_candidate = candidate.resolve()
            resolved_root = PORTAL_ROOT.resolve()
            resolved_candidate.relative_to(resolved_root)
        except (ValueError, OSError):
            return None

        return (
            resolved_candidate
            if resolved_candidate.is_file()
            else None
        )

    @staticmethod
    def _security_headers() -> list[tuple[str, str]]:
        return list(SECURITY_HEADERS.items())

    def _serve_static(
        self,
        path: Path,
        start_response,
    ) -> list[bytes]:
        payload = path.read_bytes()
        content_type, _ = mimetypes.guess_type(
            path.name
        )

        start_response(
            "200 OK",
            [
                (
                    "Content-Type",
                    content_type
                    or "application/octet-stream",
                ),
                ("Content-Length", str(len(payload))),
                (
                    "Cache-Control",
                    (
                        "no-store"
                        if path.name == "index.html"
                        else "public, max-age=300"
                    ),
                ),
                *self._security_headers(),
            ],
        )

        return [payload]

    def _redirect_portal(
        self,
        start_response,
    ) -> list[bytes]:
        start_response(
            "302 Found",
            [
                ("Location", "/portal/"),
                ("Content-Length", "0"),
                ("Cache-Control", "no-store"),
                *self._security_headers(),
            ],
        )

        return [b""]

    @staticmethod
    def _request_headers(
        environ: dict[str, Any],
    ) -> dict[str, str]:
        headers: dict[str, str] = {}

        for key, value in environ.items():
            if key.startswith("HTTP_"):
                normalized = key.removeprefix(
                    "HTTP_"
                ).replace("_", "-").lower()
                headers[normalized] = str(value)

        return headers

    def __call__(
        self,
        environ: dict[str, Any],
        start_response,
    ) -> list[bytes]:
        method = environ.get(
            "REQUEST_METHOD",
            "GET",
        ).strip().upper()
        path = environ.get(
            "PATH_INFO",
            "/",
        )

        if path == "/":
            return self._redirect_portal(
                start_response
            )

        static_file = self._portal_file(path)

        if static_file is not None:
            if method != "GET":
                payload = b"Method Not Allowed"
                start_response(
                    "405 Method Not Allowed",
                    [
                        (
                            "Content-Type",
                            "text/plain; charset=utf-8",
                        ),
                        (
                            "Content-Length",
                            str(len(payload)),
                        ),
                        *self._security_headers(),
                    ],
                )
                return [payload]

            return self._serve_static(
                static_file,
                start_response,
            )

        raw_query = parse_qs(
            environ.get("QUERY_STRING", ""),
            keep_blank_values=True,
        )
        query = {
            key: values[0]
            for key, values in raw_query.items()
            if values
        }

        request_headers = self._request_headers(environ)
        request_id = request_headers.get(
            "x-request-id",
            str(uuid4()),
        )
        correlation_id = request_headers.get(
            "x-correlation-id",
            request_id,
        )
        request_started = monotonic()

        request = GatewayRequest(
            method=method,
            path=path,
            query=query,
            headers=request_headers,
            client_ip=str(
                environ.get(
                    "REMOTE_ADDR",
                    "unknown",
                )
            ),
        )
        response = self.gateway.handle(request)
        duration_ms = (monotonic() - request_started) * 1000
        observability.record(
            request_id=request_id,
            correlation_id=correlation_id,
            method=method,
            path=path,
            status_code=response.status_code,
            duration_ms=duration_ms,
            client_ip=request.client_ip,
        )
        status = HTTPStatus(response.status_code)
        payload = json.dumps(
            response.body,
            ensure_ascii=False,
            indent=2,
        ).encode("utf-8")

        start_response(
            f"{status.value} {status.phrase}",
            [
                *response.headers.items(),
                ("X-Request-ID", request_id),
                ("X-Correlation-ID", correlation_id),
                ("Content-Length", str(len(payload))),
            ],
        )

        return [payload]


application = KAIOSWSGIApplication()