import pytest
from app.config.environment import EnvironmentName
from app.config.errors import ConfigurationError, MissingConfigurationError
from app.config.loader import load_application_config


def test_local_configuration_uses_safe_defaults() -> None:
    config = load_application_config({"KAIOS_ENVIRONMENT": "local"})
    assert config.environment is EnvironmentName.LOCAL
    assert config.gateway_port == 8787
    assert config.api_secret is None
    assert config.status.status == "configured"


def test_production_requires_api_secret() -> None:
    with pytest.raises(MissingConfigurationError):
        load_application_config({"KAIOS_ENVIRONMENT": "production"})


def test_production_accepts_direct_secret() -> None:
    config = load_application_config({"KAIOS_ENVIRONMENT": "production", "KAIOS_API_SECRET": "sprint-12-secret"})
    assert config.api_secret == "sprint-12-secret"
    assert config.api_secret_source == "environment"
    assert config.status.production_ready is True


def test_secret_file_is_supported(tmp_path) -> None:
    secret_file = tmp_path / "api-secret"
    secret_file.write_text("secret-from-file\n", encoding="utf-8")
    config = load_application_config({"KAIOS_ENVIRONMENT": "production", "KAIOS_API_SECRET_FILE": str(secret_file)})
    assert config.api_secret == "secret-from-file"
    assert config.api_secret_source == "file"


def test_direct_and_file_secret_are_mutually_exclusive(tmp_path) -> None:
    secret_file = tmp_path / "api-secret"
    secret_file.write_text("file-secret", encoding="utf-8")
    with pytest.raises(ConfigurationError):
        load_application_config({"KAIOS_API_SECRET": "direct-secret", "KAIOS_API_SECRET_FILE": str(secret_file)})


def test_gateway_port_range_is_validated() -> None:
    with pytest.raises(ConfigurationError):
        load_application_config({"KAIOS_GATEWAY_PORT": "70000"})