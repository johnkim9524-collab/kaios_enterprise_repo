from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_compose_declares_api_secret_mount() -> None:
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    assert "KAIOS_API_SECRET_FILE:" in compose
    assert "/run/secrets/kaios_api_secret" in compose
    assert "source: kaios_api_secret" in compose
    assert "target: kaios_api_secret" in compose
    assert "file: ./secrets/kaios_api_secret" in compose


def test_secret_directory_ignores_runtime_secret() -> None:
    content = (ROOT / "secrets" / ".gitignore").read_text(encoding="utf-8")
    assert "*" in content
    assert "!.gitignore" in content
    assert "!README.md" in content