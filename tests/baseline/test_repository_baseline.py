from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_canonical_repository_structure() -> None:
    required_directories = [
        ".github",
        "app",
        "config",
        "data",
        "docs",
        "public",
        "scripts",
        "tests",
    ]

    for directory in required_directories:
        assert (ROOT / directory).is_dir(), (
            f"Missing canonical directory: {directory}"
        )


def test_canonical_root_files() -> None:
    required_files = [
        "README.md",
        "VERSION",
        "pyproject.toml",
        "requirements.txt",
        "scripts/run_kaios.py",
    ]

    for file_name in required_files:
        assert (ROOT / file_name).is_file(), (
            f"Missing canonical file: {file_name}"
        )


def test_no_duplicated_repository_directory() -> None:
    assert not (ROOT / "kaios_enterprise_repo").exists()


def test_schema_files_are_valid_json() -> None:
    schema_paths = [
        ROOT / "config/schema/intelligence-edition.schema.json",
        ROOT / "config/schema/health-status.schema.json",
    ]

    for schema_path in schema_paths:
        payload = json.loads(
            schema_path.read_text(encoding="utf-8-sig")
        )

        assert payload["type"] == "object"
        assert payload["required"]