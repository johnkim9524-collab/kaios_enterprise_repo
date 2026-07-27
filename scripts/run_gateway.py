from __future__ import annotations

import os
import sys
from pathlib import Path
from wsgiref.simple_server import make_server


ROOT = Path(__file__).resolve().parents[1]

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


from app.api.wsgi import application


def main() -> int:
    host = os.getenv(
        "KAIOS_GATEWAY_HOST",
        "127.0.0.1",
    )

    port = int(
        os.getenv(
            "KAIOS_GATEWAY_PORT",
            "8787",
        )
    )

    print(
        f"KAIOS API Gateway listening on "
        f"http://{host}:{port}"
    )

    with make_server(
        host,
        port,
        application,
    ) as server:
        server.serve_forever()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())