from __future__ import annotations

import os
import sys
from pathlib import Path
from wsgiref.simple_server import (
    WSGIServer,
    make_server,
)


ROOT = Path(__file__).resolve().parents[1]

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


from app.api.wsgi import application


def environment_name() -> str:
    return os.getenv(
        "KAIOS_ENVIRONMENT",
        "local",
    ).strip().lower()


def gateway_host() -> str:
    return os.getenv(
        "KAIOS_GATEWAY_HOST",
        "127.0.0.1",
    ).strip()


def gateway_port() -> int:
    raw_port = os.getenv(
        "KAIOS_GATEWAY_PORT",
        "8787",
    ).strip()

    try:
        port = int(raw_port)
    except ValueError as exc:
        raise ValueError(
            "KAIOS_GATEWAY_PORT must be an integer."
        ) from exc

    if not 1 <= port <= 65535:
        raise ValueError(
            "KAIOS_GATEWAY_PORT must be between 1 and 65535."
        )

    return port


def serve(
    server: WSGIServer,
) -> None:
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print(
            "\nKAIOS API Gateway shutdown requested."
        )
    finally:
        server.server_close()
        print(
            "KAIOS API Gateway stopped."
        )


def main() -> int:
    host = gateway_host()
    port = gateway_port()
    environment = environment_name()

    print(
        "KAIOS API Gateway starting"
    )
    print(
        f"Environment: {environment}"
    )
    print(
        f"Listening: http://{host}:{port}"
    )
    print(
        f"Portal: http://{host}:{port}/portal/"
    )
    print(
        f"Health: http://{host}:{port}/api/health"
    )

    with make_server(
        host,
        port,
        application,
    ) as server:
        serve(server)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())