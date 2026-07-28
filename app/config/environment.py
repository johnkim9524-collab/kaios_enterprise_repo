from enum import StrEnum
from app.config.errors import ConfigurationError


class EnvironmentName(StrEnum):
    LOCAL = "local"
    TEST = "test"
    STAGING = "staging"
    PRODUCTION = "production"

    @classmethod
    def parse(cls, value: str | None) -> "EnvironmentName":
        normalized = (value or cls.LOCAL.value).strip().lower()
        try:
            return cls(normalized)
        except ValueError as exc:
            allowed = ", ".join(item.value for item in cls)
            raise ConfigurationError(f"KAIOS_ENVIRONMENT must be one of: {allowed}.") from exc

    @property
    def is_production_like(self) -> bool:
        return self in {EnvironmentName.STAGING, EnvironmentName.PRODUCTION}