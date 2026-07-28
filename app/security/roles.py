from __future__ import annotations

from enum import IntEnum


class Role(IntEnum):
    VIEWER = 10
    OPERATOR = 20
    ADMIN = 30

    @classmethod
    def parse(cls, value: str | None) -> "Role":
        normalized = (value or "viewer").strip().lower()

        mapping = {
            "viewer": cls.VIEWER,
            "operator": cls.OPERATOR,
            "admin": cls.ADMIN,
        }

        if normalized not in mapping:
            raise ValueError(
                "Role must be viewer, operator, or admin."
            )

        return mapping[normalized]

    @property
    def label(self) -> str:
        return self.name.lower()