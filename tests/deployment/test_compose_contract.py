from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def compose_text() -> str:
    return (
        ROOT / "docker-compose.yml"
    ).read_text(
        encoding="utf-8-sig"
    )


def test_compose_exposes_gateway() -> None:
    compose = compose_text()

    assert (
        '${KAIOS_GATEWAY_PORT:-8787}:8787'
        in compose
    )
    assert "KAIOS_GATEWAY_PORT" in compose
    assert "KAIOS_GATEWAY_HOST" in compose


def test_compose_uses_healthcheck() -> None:
    compose = compose_text()

    assert "healthcheck:" in compose
    assert "deploy/healthcheck.py" in compose
    assert "start_period:" in compose
    assert "retries:" in compose


def test_compose_uses_production_guards() -> None:
    compose = compose_text()

    required_entries = [
        "restart: unless-stopped",
        "init: true",
        "no-new-privileges:true",
        "read_only: true",
        "tmpfs:",
        "stop_grace_period:",
    ]

    for entry in required_entries:
        assert entry in compose


def test_compose_does_not_mount_source_tree() -> None:
    compose = compose_text()

    assert "- .:/app" not in compose
    assert ".:/app" not in compose


def test_compose_uses_named_volumes() -> None:
    compose = compose_text()

    assert "kaios-runtime-data:" in compose
    assert "kaios-public-data:" in compose
    assert "/app/data" in compose
    assert "/app/public/api" in compose