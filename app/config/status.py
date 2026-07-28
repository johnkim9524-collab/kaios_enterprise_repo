from collections.abc import Mapping
from typing import Any
from app.config.errors import ConfigurationError
from app.config.loader import load_application_config


def configuration_status(environ: Mapping[str, str] | None = None) -> dict[str, Any]:
    try:
        config = load_application_config(environ, strict=False)
    except ConfigurationError as exc:
        return {
            "status": "invalid",
            "production_ready": False,
            "missing": [],
            "invalid": [str(exc)],
            "security": {"api_secret_configured": False, "api_secret_source": "unknown"},
        }
    return config.public_status()