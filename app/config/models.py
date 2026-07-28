from dataclasses import dataclass
from typing import Any
from app.config.environment import EnvironmentName


@dataclass(frozen=True, slots=True)
class ConfigurationStatus:
    status: str
    environment: str
    production_ready: bool
    secret_source: str
    missing: tuple[str, ...]
    invalid: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "environment": self.environment,
            "production_ready": self.production_ready,
            "secret_source": self.secret_source,
            "missing": list(self.missing),
            "invalid": list(self.invalid),
        }


@dataclass(frozen=True, slots=True)
class ApplicationConfig:
    environment: EnvironmentName
    gateway_host: str
    gateway_port: int
    log_level: str
    database_path: str
    shutdown_timeout_seconds: int
    api_secret: str | None
    api_secret_source: str
    status: ConfigurationStatus

    def public_status(self) -> dict[str, Any]:
        data = self.status.to_dict()
        data["gateway"] = {"host_configured": bool(self.gateway_host), "port": self.gateway_port}
        data["database"] = {"configured": bool(self.database_path)}
        data["security"] = {
            "api_secret_configured": self.api_secret is not None,
            "api_secret_source": self.api_secret_source,
        }
        return data