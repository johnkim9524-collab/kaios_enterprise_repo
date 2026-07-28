from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]


def test_environment_example_declares_secret_contract() -> None:
    content = (ROOT / ".env.example").read_text(encoding="utf-8")
    assert "KAIOS_API_SECRET=" in content
    assert "KAIOS_API_SECRET_FILE=" in content