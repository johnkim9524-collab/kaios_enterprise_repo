import os
from collections.abc import Mapping
from pathlib import Path
from app.config.environment import EnvironmentName
from app.config.errors import ConfigurationError, MissingConfigurationError, SecretFileError
from app.config.models import ApplicationConfig, ConfigurationStatus

_ALLOWED_LOG_LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}


def _integer(environ: Mapping[str, str], key: str, default: int, minimum: int, maximum: int) -> int:
    raw_value = environ.get(key, str(default)).strip()
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise ConfigurationError(f"{key} must be an integer.") from exc
    if not minimum <= value <= maximum:
        raise ConfigurationError(f"{key} must be between {minimum} and {maximum}.")
    return value


def _secret(environ: Mapping[str, str], key: str) -> tuple[str | None, str]:
    direct_value = environ.get(key, "").strip()
    file_value = environ.get(f"{key}_FILE", "").strip()
    if direct_value and file_value:
        raise ConfigurationError(f"Configure either {key} or {key}_FILE, not both.")
    if direct_value:
        return direct_value, "environment"
    if not file_value:
        return None, "missing"
    path = Path(file_value)
    try:
        value = path.read_text(encoding="utf-8").strip()
    except OSError as exc:
        raise SecretFileError(f"Unable to read {key}_FILE.") from exc
    if not value:
        raise SecretFileError(f"{key}_FILE must not be empty.")
    return value, "file"


def load_application_config(environ: Mapping[str, str] | None = None, *, strict: bool = True) -> ApplicationConfig:
    source = os.environ if environ is None else environ
    environment = EnvironmentName.parse(source.get("KAIOS_ENVIRONMENT"))
    host = source.get("KAIOS_GATEWAY_HOST", "127.0.0.1").strip()
    if not host:
        raise ConfigurationError("KAIOS_GATEWAY_HOST must not be empty.")
    port = _integer(source, "KAIOS_GATEWAY_PORT", 8787, 1, 65535)
    shutdown_timeout = _integer(source, "KAIOS_SHUTDOWN_TIMEOUT_SECONDS", 10, 1, 300)
    log_level = source.get("KAIOS_LOG_LEVEL", "INFO").strip().upper()
    if log_level not in _ALLOWED_LOG_LEVELS:
        raise ConfigurationError("KAIOS_LOG_LEVEL must be DEBUG, INFO, WARNING, ERROR, or CRITICAL.")
    database_path = source.get("KAIOS_DATABASE_PATH", "data/kaios.db").strip()
    if not database_path:
        raise ConfigurationError("KAIOS_DATABASE_PATH must not be empty.")
    api_secret, secret_source = _secret(source, "KAIOS_API_SECRET")
    missing: list[str] = []
    if environment.is_production_like and api_secret is None:
        missing.append("KAIOS_API_SECRET")
    production_ready = not missing
    status = ConfigurationStatus(
        status="configured" if production_ready else "missing",
        environment=environment.value,
        production_ready=production_ready,
        secret_source=secret_source,
        missing=tuple(missing),
        invalid=(),
    )
    if strict and missing:
        raise MissingConfigurationError("Missing required production configuration: " + ", ".join(missing))
    return ApplicationConfig(
        environment=environment,
        gateway_host=host,
        gateway_port=port,
        log_level=log_level,
        database_path=database_path,
        shutdown_timeout_seconds=shutdown_timeout,
        api_secret=api_secret,
        api_secret_source=secret_source,
        status=status,
    )