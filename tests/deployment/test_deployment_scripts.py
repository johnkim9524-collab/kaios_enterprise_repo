from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def load_module(
    name: str,
    relative_path: str,
):
    path = ROOT / relative_path

    specification = (
        importlib.util.spec_from_file_location(
            name,
            path,
        )
    )

    assert specification is not None
    assert specification.loader is not None

    module = importlib.util.module_from_spec(
        specification
    )

    specification.loader.exec_module(
        module
    )

    return module


def test_healthcheck_url_uses_environment(
    monkeypatch,
) -> None:
    healthcheck = load_module(
        "kaios_healthcheck",
        "deploy/healthcheck.py",
    )

    monkeypatch.setenv(
        "KAIOS_HEALTHCHECK_HOST",
        "localhost",
    )
    monkeypatch.setenv(
        "KAIOS_GATEWAY_PORT",
        "9000",
    )

    assert (
        healthcheck.health_url()
        == "http://localhost:9000/api/health"
    )


def test_gateway_defaults_are_local(
    monkeypatch,
) -> None:
    gateway = load_module(
        "kaios_run_gateway",
        "scripts/run_gateway.py",
    )

    monkeypatch.delenv(
        "KAIOS_GATEWAY_HOST",
        raising=False,
    )
    monkeypatch.delenv(
        "KAIOS_GATEWAY_PORT",
        raising=False,
    )
    monkeypatch.delenv(
        "KAIOS_ENVIRONMENT",
        raising=False,
    )

    assert gateway.gateway_host() == "127.0.0.1"
    assert gateway.gateway_port() == 8787
    assert gateway.environment_name() == "local"


def test_gateway_rejects_invalid_port(
    monkeypatch,
) -> None:
    gateway = load_module(
        "kaios_run_gateway_invalid_port",
        "scripts/run_gateway.py",
    )

    monkeypatch.setenv(
        "KAIOS_GATEWAY_PORT",
        "invalid",
    )

    try:
        gateway.gateway_port()
    except ValueError as exc:
        assert (
            "must be an integer"
            in str(exc)
        )
    else:
        raise AssertionError(
            "Invalid gateway port must fail."
        )