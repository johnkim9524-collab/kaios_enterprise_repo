from __future__ import annotations

import pytest

from app.release_certification.versioning import (
    parse_version,
    validate_tag,
)


def test_parse_semantic_version() -> None:
    version = parse_version("0.9.0")

    assert version.value == "0.9.0"
    assert version.tag == "v0.9.0"


def test_parse_prerelease_version() -> None:
    version = parse_version(
        "1.0.0-rc.1"
    )

    assert version.tag == "v1.0.0-rc.1"


@pytest.mark.parametrize(
    "value",
    [
        "",
        "v0.9.0",
        "01.0.0",
        "0.9",
        "latest",
    ],
)
def test_invalid_versions_are_rejected(
    value,
) -> None:
    with pytest.raises(ValueError):
        parse_version(value)


def test_tag_must_match_version() -> None:
    version = parse_version("0.9.0")

    validate_tag(version, "v0.9.0")

    with pytest.raises(ValueError):
        validate_tag(version, "v0.9.1")