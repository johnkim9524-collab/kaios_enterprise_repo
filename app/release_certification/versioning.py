from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


SEMVER_PATTERN = re.compile(
    r"^(0|[1-9]\d*)\."
    r"(0|[1-9]\d*)\."
    r"(0|[1-9]\d*)"
    r"(?:-([0-9A-Za-z.-]+))?$"
)


@dataclass(frozen=True, slots=True)
class ReleaseVersion:
    major: int
    minor: int
    patch: int
    prerelease: str | None = None

    @property
    def value(self) -> str:
        base = (
            f"{self.major}."
            f"{self.minor}."
            f"{self.patch}"
        )
        if self.prerelease:
            return f"{base}-{self.prerelease}"
        return base

    @property
    def tag(self) -> str:
        return f"v{self.value}"


def parse_version(value: str) -> ReleaseVersion:
    normalized = value.strip()
    match = SEMVER_PATTERN.fullmatch(normalized)

    if not match:
        raise ValueError(
            f"Invalid semantic version: {value!r}"
        )

    return ReleaseVersion(
        major=int(match.group(1)),
        minor=int(match.group(2)),
        patch=int(match.group(3)),
        prerelease=match.group(4),
    )


def read_version(
    path: Path = Path("VERSION"),
) -> ReleaseVersion:
    return parse_version(
        path.read_text(
            encoding="utf-8"
        )
    )


def validate_tag(
    version: ReleaseVersion,
    tag: str,
) -> None:
    if tag != version.tag:
        raise ValueError(
            "Git tag does not match VERSION: "
            f"expected {version.tag}, got {tag}"
        )