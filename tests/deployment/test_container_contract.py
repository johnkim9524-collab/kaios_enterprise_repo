from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (
        ROOT / path
    ).read_text(
        encoding="utf-8-sig"
    )


def test_dockerfile_runs_gateway() -> None:
    dockerfile = read(
        "Dockerfile"
    )

    assert (
        'CMD ["python", "scripts/run_gateway.py"]'
        in dockerfile
    )
    assert "EXPOSE 8787" in dockerfile
    assert "HEALTHCHECK" in dockerfile


def test_dockerfile_uses_non_root_user() -> None:
    dockerfile = read(
        "Dockerfile"
    )

    assert "useradd" in dockerfile
    assert "USER kaios" in dockerfile
    assert "USER root" not in dockerfile


def test_dockerfile_has_runtime_defaults() -> None:
    dockerfile = read(
        "Dockerfile"
    )

    required_values = [
        "KAIOS_GATEWAY_HOST=0.0.0.0",
        "KAIOS_GATEWAY_PORT=8787",
        "KAIOS_RUNTIME_MODE=fixture",
        "KAIOS_ENVIRONMENT=production",
    ]

    for value in required_values:
        assert value in dockerfile


def test_dockerignore_excludes_local_state() -> None:
    dockerignore = read(
        ".dockerignore"
    )

    required_entries = [
        ".git",
        ".venv",
        "__pycache__",
        ".pytest_cache",
        ".env",
        "*.log",
    ]

    for entry in required_entries:
        assert entry in dockerignore


def test_environment_example_exists() -> None:
    env_example = read(
        ".env.example"
    )

    assert "KAIOS_GATEWAY_HOST=0.0.0.0" in env_example
    assert "KAIOS_GATEWAY_PORT=8787" in env_example
    assert "KAIOS_RUNTIME_MODE=fixture" in env_example