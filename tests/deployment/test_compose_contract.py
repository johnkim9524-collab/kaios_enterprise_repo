from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
COMPOSE_PATH = ROOT / "docker-compose.yml"


def compose_model(
    *,
    profile: str | None = None,
) -> dict[str, Any]:
    command = [
        "docker",
        "compose",
    ]

    if profile is not None:
        command.extend(
            [
                "--profile",
                profile,
            ]
        )

    command.extend(
        [
            "config",
            "--format",
            "json",
        ]
    )

    completed = subprocess.run(
        command,
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )

    return json.loads(completed.stdout)


def test_compose_file_exists() -> None:
    assert COMPOSE_PATH.is_file()


def test_compose_defines_gateway_service() -> None:
    model = compose_model()
    gateway = model["services"]["kaios"]

    assert gateway["container_name"] == "kaios-enterprise"


def test_compose_defines_scheduler_service() -> None:
    model = compose_model(profile="scheduler")
    scheduler = model["services"]["kaios-scheduler"]

    assert scheduler["container_name"] == "kaios-scheduler"


def test_compose_builds_shared_production_image() -> None:
    model = compose_model(profile="scheduler")
    services = model["services"]

    assert services["kaios"]["image"] == "kaios-enterprise:local"
    assert (
        services["kaios-scheduler"]["image"]
        == "kaios-enterprise:local"
    )


def test_gateway_exposes_expected_port() -> None:
    model = compose_model()
    ports = model["services"]["kaios"]["ports"]

    assert any(
        int(item["target"]) == 8787
        and int(item["published"]) == 8787
        for item in ports
    )


def test_gateway_has_healthcheck() -> None:
    model = compose_model()
    healthcheck = model["services"]["kaios"]["healthcheck"]

    assert "deploy/healthcheck.py" in " ".join(
        healthcheck["test"]
    )


def test_scheduler_uses_module_entrypoint() -> None:
    model = compose_model(profile="scheduler")
    command = model["services"]["kaios-scheduler"]["command"]

    assert command == [
        "python",
        "-m",
        "scripts.run_scheduler",
    ]


def test_scheduler_uses_explicit_profile() -> None:
    model = compose_model(profile="scheduler")
    profiles = model["services"]["kaios-scheduler"]["profiles"]

    assert "scheduler" in profiles


def test_scheduler_waits_for_healthy_gateway() -> None:
    model = compose_model(profile="scheduler")
    depends_on = model["services"]["kaios-scheduler"]["depends_on"]

    assert depends_on["kaios"]["condition"] == "service_healthy"


def test_compose_passes_runtime_environment() -> None:
    model = compose_model(profile="scheduler")

    required_environment = {
        "KAIOS_RUNTIME_MODE",
        "KAIOS_ENVIRONMENT",
        "KAIOS_LOG_LEVEL",
        "KAIOS_DATABASE_PATH",
    }

    for service_name in (
        "kaios",
        "kaios-scheduler",
    ):
        environment = model["services"][service_name]["environment"]
        assert required_environment.issubset(environment)


def test_compose_passes_live_adapter_environment() -> None:
    model = compose_model(profile="scheduler")

    required_environment = {
        "KAIOS_LIVE_RSS_URL",
        "KAIOS_LIVE_HTTP_TIMEOUT_SECONDS",
        "KAIOS_LIVE_RETRY_DELAY_SECONDS",
    }

    for service_name in (
        "kaios",
        "kaios-scheduler",
    ):
        environment = model["services"][service_name]["environment"]
        assert required_environment.issubset(environment)


def test_compose_passes_scheduler_environment() -> None:
    model = compose_model(profile="scheduler")

    required_environment = {
        "KAIOS_SCHEDULER_ENABLED",
        "KAIOS_SCHEDULER_INTERVAL_SECONDS",
        "KAIOS_SCHEDULER_LOCK_TTL_SECONDS",
        "KAIOS_SCHEDULER_HEARTBEAT_SECONDS",
        "KAIOS_SCHEDULER_RUNTIME_MODE",
        "KAIOS_SCHEDULER_ID",
    }

    for service_name in (
        "kaios",
        "kaios-scheduler",
    ):
        environment = model["services"][service_name]["environment"]
        assert required_environment.issubset(environment)


def test_gateway_and_scheduler_share_database_volume() -> None:
    model = compose_model(profile="scheduler")

    gateway_volumes = model["services"]["kaios"]["volumes"]
    scheduler_volumes = model["services"]["kaios-scheduler"]["volumes"]

    assert any(
        item["target"] == "/app/data"
        for item in gateway_volumes
    )
    assert any(
        item["target"] == "/app/data"
        for item in scheduler_volumes
    )


def test_compose_uses_no_new_privileges() -> None:
    model = compose_model(profile="scheduler")

    for service_name in (
        "kaios",
        "kaios-scheduler",
    ):
        security_opt = model["services"][service_name]["security_opt"]
        assert "no-new-privileges:true" in security_opt


def test_compose_allows_runtime_publication_writes() -> None:
    model = compose_model(profile="scheduler")

    assert (
        model["services"]["kaios"].get(
            "read_only",
            False,
        )
        is False
    )
    assert (
        model["services"]["kaios-scheduler"].get(
            "read_only",
            False,
        )
        is False
    )


def test_compose_uses_tmpfs_for_both_services() -> None:
    model = compose_model(profile="scheduler")

    for service_name in (
        "kaios",
        "kaios-scheduler",
    ):
        tmpfs = model["services"][service_name]["tmpfs"]
        assert any(
            item.startswith("/tmp")
            for item in tmpfs
        )


def test_compose_uses_graceful_shutdown() -> None:
    model = compose_model(profile="scheduler")

    assert (
        model["services"]["kaios"]["stop_grace_period"]
        == "15s"
    )
    assert (
        model["services"]["kaios-scheduler"]["stop_grace_period"]
        == "15s"
    )


def test_scheduler_does_not_publish_a_host_port() -> None:
    model = compose_model(profile="scheduler")
    scheduler = model["services"]["kaios-scheduler"]

    assert not scheduler.get("ports")


def test_docker_secret_is_mounted_by_both_services() -> None:
    model = compose_model(profile="scheduler")

    for service_name in (
        "kaios",
        "kaios-scheduler",
    ):
        secrets = model["services"][service_name]["secrets"]
        assert any(
            item["target"] == "kaios_api_secret"
            for item in secrets
        )

        environment = model["services"][service_name]["environment"]
        assert (
            environment["KAIOS_API_SECRET_FILE"]
            == "/run/secrets/kaios_api_secret"
        )