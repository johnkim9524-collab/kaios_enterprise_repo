from __future__ import annotations

import pytest

from app.core.modes import RuntimeMode


def test_default_mode_is_fixture() -> None:
    assert RuntimeMode.parse(None) is RuntimeMode.FIXTURE


def test_modes_are_parsed_case_insensitively() -> None:
    assert RuntimeMode.parse("FIXTURE") is RuntimeMode.FIXTURE
    assert RuntimeMode.parse("fallback") is RuntimeMode.FALLBACK
    assert RuntimeMode.parse(" live ") is RuntimeMode.LIVE


def test_invalid_mode_is_rejected() -> None:
    with pytest.raises(ValueError):
        RuntimeMode.parse("unknown")