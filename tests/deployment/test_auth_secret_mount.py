from __future__ import annotations

import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def compose_model() -> dict:
    completed = subprocess.run(
        [
            "docker",
            "compose",
            "--profile",
            "scheduler",
            "config",
            "--format",
            "json",
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )

    return json.loads(completed.stdout)


def test_gateway_mounts_all_role_token_secrets() -> None:
    gateway = compose_model()["services"]["kaios"]
    targets = {
        item["target"]
        for item in gateway["secrets"]
    }

    assert {
        "kaios_viewer_token",
        "kaios_operator_token",
        "kaios_admin_token",
    }.issubset(targets)


def test_gateway_uses_role_token_files() -> None:
    environment = (
        compose_model()["services"]["kaios"]["environment"]
    )

    assert (
        environment["KAIOS_VIEWER_TOKEN_FILE"]
        == "/run/secrets/kaios_viewer_token"
    )
    assert (
        environment["KAIOS_OPERATOR_TOKEN_FILE"]
        == "/run/secrets/kaios_operator_token"
    )
    assert (
        environment["KAIOS_ADMIN_TOKEN_FILE"]
        == "/run/secrets/kaios_admin_token"
    )