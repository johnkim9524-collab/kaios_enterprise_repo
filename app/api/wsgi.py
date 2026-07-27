from __future__ import annotations

import json
from http import HTTPStatus
from typing import Any
from urllib.parse import parse_qs

from app.api.contracts import GatewayRequest
from app.api.gateway import KAIOSGateway


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

    def __call__(
        self,
        environ: dict[str, Any],
        start_response,
    ) -> list[bytes]:
        raw_query = parse_qs(
            environ.get("QUERY_STRING", ""),
            keep_blank_values=True,
        )

        query = {
            key: values[0]
            for key, values in raw_query.items()
            if values
        }

        request = GatewayRequest(
            method=environ.get(
                "REQUEST_METHOD",
                "GET",
            ),
            path=environ.get(
                "PATH_INFO",
                "/",
            ),
            query=query,
        )

        response = self.gateway.handle(request)

        status = HTTPStatus(
            response.status_code
        )

        payload = json.dumps(
            response.body,
            ensure_ascii=False,
            indent=2,
        ).encode("utf-8")

        headers = [
            *response.headers.items(),
            (
                "Content-Length",
                str(len(payload)),
            ),
        ]

        start_response(
            f"{status.value} {status.phrase}",
            headers,
        )

        return [payload]


application = KAIOSWSGIApplication()