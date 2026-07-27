from __future__ import annotations

from app.collectors.adapters import FixtureSourceAdapter
from app.collectors.contracts import AdapterContext
from app.core.modes import RuntimeMode


SOURCE = {
    "id": "source-one",
    "name": "Source One",
    "type": "official",
    "weight": 0.5,
    "enabled": True,
}

BRANDS = [
    {
        "id": "brand-one",
        "name": "Brand One",
        "category": "Figures",
        "region": "Global",
    }
]


def test_fixture_adapter_is_deterministic() -> None:
    adapter = FixtureSourceAdapter()
    context = AdapterContext(
        mode=RuntimeMode.FIXTURE,
        source=SOURCE,
        brands=BRANDS,
    )

    first = adapter.collect(context)
    second = adapter.collect(context)

    assert first == second
    assert len(first) == 1
    assert first[0]["mode"] == "fixture"


def test_fixture_adapter_preserves_identity() -> None:
    adapter = FixtureSourceAdapter()

    result = adapter.collect(
        AdapterContext(
            mode=RuntimeMode.FIXTURE,
            source=SOURCE,
            brands=BRANDS,
        )
    )

    signal = result[0]

    assert signal["source_id"] == "source-one"
    assert signal["brand_id"] == "brand-one"
    assert signal["source_weight"] == 0.5