from __future__ import annotations

import pytest

from app.collectors.registry import (
    AdapterRegistry,
)
from app.collectors.runtime import (
    CollectorRuntime,
)
from app.core.errors import (
    LiveModeUnavailableError,
)
from app.core.modes import RuntimeMode


SOURCES = [
    {
        "id": "source-one",
        "name": "Source One",
        "type": "official",
        "enabled": True,
    },
    {
        "id": "source-two",
        "name": "Source Two",
        "type": "community",
        "enabled": True,
    },
]

BRANDS = [
    {
        "id": "brand-one",
        "name": "Brand One",
        "category": "Figures",
        "region": "Global",
    }
]


class PassingAdapter:
    def collect(self, context):
        return [
            {
                "source_id": context.source["id"],
                "brand_id": "brand-one",
                "mode": context.mode.value,
            }
        ]


class FailingAdapter:
    def collect(self, context):
        raise RuntimeError("adapter failure")


class RetryAdapter:
    def __init__(self) -> None:
        self.calls = 0

    def collect(self, context):
        self.calls += 1

        if self.calls == 1:
            raise RuntimeError(
                "temporary failure"
            )

        return [
            {
                "source_id": context.source["id"],
                "brand_id": "brand-one",
                "mode": context.mode.value,
            }
        ]


def test_runtime_reports_operational() -> None:
    registry = AdapterRegistry(
        RuntimeMode.FIXTURE
    )

    registry.register_source(
        "source-one",
        PassingAdapter(),
    )
    registry.register_source(
        "source-two",
        PassingAdapter(),
    )

    report = CollectorRuntime(
        mode=RuntimeMode.FIXTURE,
        registry=registry,
    ).collect(
        sources=SOURCES,
        brands=BRANDS,
    )

    assert report.status == "operational"
    assert report.successful_source_count == 2
    assert report.failed_source_count == 0


def test_runtime_reports_degraded_partial_failure() -> None:
    registry = AdapterRegistry(
        RuntimeMode.FIXTURE
    )

    registry.register_source(
        "source-one",
        PassingAdapter(),
    )
    registry.register_source(
        "source-two",
        FailingAdapter(),
    )

    report = CollectorRuntime(
        mode=RuntimeMode.FIXTURE,
        registry=registry,
        max_attempts=2,
    ).collect(
        sources=SOURCES,
        brands=BRANDS,
    )

    assert report.status == "degraded"
    assert report.successful_source_count == 1
    assert report.failed_source_count == 1

    failed_source = report.sources[1]

    assert failed_source.status == "failed"
    assert failed_source.attempts == 2
    assert failed_source.error == "adapter failure"


def test_runtime_retries_temporary_failure() -> None:
    registry = AdapterRegistry(
        RuntimeMode.FIXTURE
    )
    adapter = RetryAdapter()

    registry.register_source(
        "source-one",
        adapter,
    )
    registry.register_source(
        "source-two",
        PassingAdapter(),
    )

    report = CollectorRuntime(
        mode=RuntimeMode.FIXTURE,
        registry=registry,
        max_attempts=2,
    ).collect(
        sources=SOURCES,
        brands=BRANDS,
    )

    assert report.status == "operational"
    assert adapter.calls == 2
    assert report.sources[0].attempts == 2


def test_live_runtime_does_not_fallback() -> None:
    runtime = CollectorRuntime(
        mode=RuntimeMode.LIVE,
    )

    with pytest.raises(
        LiveModeUnavailableError
    ):
        runtime.collect(
            sources=SOURCES,
            brands=BRANDS,
        )