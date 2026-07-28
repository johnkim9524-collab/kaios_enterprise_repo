from __future__ import annotations

import os
import sys
from pathlib import Path
from wsgiref.simple_server import WSGIServer, make_server


ROOT = Path(__file__).resolve().parents[1]

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


from app.api.wsgi import application
from app.config import load_application_config
from app.config.environment import EnvironmentName
from app.config.errors import ConfigurationError


def environment_name() -> str:
    return EnvironmentName.parse(
        os.getenv("KAIOS_ENVIRONMENT")
    ).value


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


def serve(server: WSGIServer) -> None:
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nKAIOS API Gateway shutdown requested.")
    finally:
        server.server_close()
        print("KAIOS API Gateway stopped.")


def main() -> int:
    try:
        config = load_application_config(strict=True)
    except ConfigurationError as exc:
        print(
            f"KAIOS configuration error: {exc}",
            file=sys.stderr,
        )
        return 2

    print("KAIOS API Gateway starting")
    print(f"Environment: {config.environment.value}")
    print(f"Log level: {config.log_level}")
    print(f"Secret source: {config.api_secret_source}")
    print(
        f"Listening: http://{config.gateway_host}:{config.gateway_port}"
    )
    print(
        f"Portal: http://{config.gateway_host}:{config.gateway_port}/portal/"
    )
    print(
        f"Health: http://{config.gateway_host}:{config.gateway_port}/api/health"
    )
    print(
        "Configuration: "
        f"http://{config.gateway_host}:{config.gateway_port}/api/config/status"
    )

    with make_server(
        config.gateway_host,
        config.gateway_port,
        application,
    ) as server:
        serve(server)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())