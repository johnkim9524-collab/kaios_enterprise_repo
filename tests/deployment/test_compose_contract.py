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


def test_compose_defines_gateway_service() -> None:
    content = compose_content()

    assert "services:" in content
    assert "  kaios:" in content
    assert "container_name: kaios-enterprise" in content


def test_compose_defines_scheduler_service() -> None:
    content = compose_content()

    assert "  kaios-scheduler:" in content
    assert "container_name: kaios-scheduler" in content


def test_compose_builds_shared_production_image() -> None:
    content = compose_content()

    assert content.count(
        "image: kaios-enterprise:local"
    ) == 2

    assert content.count(
        "dockerfile: Dockerfile"
    ) == 2


def test_gateway_exposes_expected_port() -> None:
    content = compose_content()

    assert (
        '"${KAIOS_GATEWAY_PORT:-8787}:8787"'
        in content
    )


def test_gateway_has_healthcheck() -> None:
    content = compose_content()

    assert "healthcheck:" in content
    assert "deploy/healthcheck.py" in content


def test_scheduler_uses_module_entrypoint() -> None:
    content = compose_content()

    assert "command:" in content
    assert "      - python" in content
    assert "      - -m" in content
    assert "      - scripts.run_scheduler" in content


def test_scheduler_uses_explicit_profile() -> None:
    content = compose_content()

    assert "profiles:" in content
    assert "      - scheduler" in content


def test_scheduler_waits_for_healthy_gateway() -> None:
    content = compose_content()

    assert "depends_on:" in content
    assert "condition: service_healthy" in content


def test_compose_passes_runtime_environment() -> None:
    content = compose_content()

    required_environment = {
        "KAIOS_RUNTIME_MODE:",
        "KAIOS_ENVIRONMENT:",
        "KAIOS_LOG_LEVEL:",
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


def test_compose_passes_scheduler_environment() -> None:
    content = compose_content()

    required_environment = {
        "KAIOS_SCHEDULER_ENABLED:",
        "KAIOS_SCHEDULER_INTERVAL_SECONDS:",
        "KAIOS_SCHEDULER_LOCK_TTL_SECONDS:",
        "KAIOS_SCHEDULER_HEARTBEAT_SECONDS:",
        "KAIOS_SCHEDULER_RUNTIME_MODE:",
        "KAIOS_SCHEDULER_ID:",
    }

    for variable in required_environment:
        assert variable in content


def test_gateway_and_scheduler_share_database_volume() -> None:
    content = compose_content()

    assert content.count(
        "kaios-runtime-data:/app/data"
    ) == 2

    assert "kaios-runtime-data:" in content


def test_compose_uses_no_new_privileges() -> None:
    content = compose_content()

    assert content.count(
        "no-new-privileges:true"
    ) == 2


def test_compose_allows_runtime_publication_writes() -> None:
    content = compose_content()

    assert content.count(
        "read_only: false"
    ) == 2


def test_compose_uses_tmpfs_for_both_services() -> None:
    content = compose_content()

    assert content.count(
        "/tmp:size=64m,mode=1777"
    ) == 2


def test_compose_uses_graceful_shutdown() -> None:
    content = compose_content()

    assert content.count(
        "stop_grace_period: 15s"
    ) == 2


def test_scheduler_does_not_publish_a_host_port() -> None:
    content = compose_content()

    scheduler_section = content.split(
        "  kaios-scheduler:",
        maxsplit=1,
    )[1]

    assert "\n    ports:" not in scheduler_section