from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
COMPOSE_PATH = ROOT / "docker-compose.yml"


def compose_content() -> str:
    return COMPOSE_PATH.read_text(
        encoding="utf-8-sig"
    )


def test_compose_file_exists() -> None:
    assert COMPOSE_PATH.is_file()


def test_compose_defines_kaios_service() -> None:
    content = compose_content()

    assert "services:" in content
    assert "  kaios:" in content


def test_compose_builds_production_image() -> None:
    content = compose_content()

    assert "dockerfile: Dockerfile" in content
    assert "image: kaios-enterprise:local" in content


def test_compose_exposes_gateway_port() -> None:
    content = compose_content()

    assert (
        '"${KAIOS_GATEWAY_PORT:-8787}:8787"'
        in content
    )


def test_compose_passes_runtime_environment() -> None:
    content = compose_content()

    required_environment = {
        "KAIOS_GATEWAY_HOST:",
        "KAIOS_GATEWAY_PORT:",
        "KAIOS_RUNTIME_MODE:",
        "KAIOS_TRIGGER_TYPE:",
        "KAIOS_ENVIRONMENT:",
        "KAIOS_DATABASE_PATH:",
    }

    for variable in required_environment:
        assert variable in content


def test_compose_passes_live_adapter_environment() -> None:
    content = compose_content()

    required_environment = {
        "KAIOS_LIVE_RSS_URL:",
        "KAIOS_LIVE_HTTP_TIMEOUT_SECONDS:",
        "KAIOS_LIVE_RETRY_DELAY_SECONDS:",
    }

    for variable in required_environment:
        assert variable in content


def test_compose_has_healthcheck() -> None:
    content = compose_content()

    assert "healthcheck:" in content
    assert "deploy/healthcheck.py" in content


def test_compose_uses_no_new_privileges() -> None:
    content = compose_content()

    assert "security_opt:" in content
    assert "no-new-privileges:true" in content


def test_compose_allows_runtime_publication_writes() -> None:
    content = compose_content()

    assert "read_only: false" in content


def test_compose_mounts_persistent_runtime_data() -> None:
    content = compose_content()

    assert (
        "kaios-runtime-data:/app/data"
        in content
    )

    assert "kaios-runtime-data:" in content


def test_compose_does_not_shadow_public_assets() -> None:
    content = compose_content()

    assert (
        "kaios-public-data:/app/public"
        not in content
    )

    assert (
        "kaios-public-data:/app/public/api"
        not in content
    )


def test_compose_uses_init_and_graceful_stop() -> None:
    content = compose_content()

    assert "init: true" in content
    assert "stop_grace_period: 15s" in content


def test_compose_uses_tmpfs_for_temporary_files() -> None:
    content = compose_content()

    assert "tmpfs:" in content
    assert "/tmp:size=64m,mode=1777" in content