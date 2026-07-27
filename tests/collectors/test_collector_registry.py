from __future__ import annotations

from app.collectors.adapters import (
    FixtureSourceAdapter,
)
from app.collectors.registry import (
    AdapterRegistry,
)
from app.core.modes import RuntimeMode


class CustomAdapter:
    def collect(self, context):
        return []


def test_registry_resolves_mode_adapter() -> None:
    registry = AdapterRegistry(
        RuntimeMode.FIXTURE
    )

    adapter = registry.resolve(
        {"id": "source-one"}
    )

    assert isinstance(
        adapter,
        FixtureSourceAdapter,
    )


def test_registry_supports_source_override() -> None:
    registry = AdapterRegistry(
        RuntimeMode.FIXTURE
    )
    custom_adapter = CustomAdapter()

    registry.register_source(
        "source-one",
        custom_adapter,
    )

    resolved = registry.resolve(
        {"id": "source-one"}
    )

    assert resolved is custom_adapter