from __future__ import annotations

from app.core.contracts import RuntimeResult, StageRecord
from app.core.modes import RuntimeMode


def test_runtime_result_preserves_legacy_fields() -> None:
    result = RuntimeResult(
        published=True,
        mode=RuntimeMode.FIXTURE,
        edition="2026.06",
        audit={"passed": True},
        health={"status": "operational"},
        stages=[
            StageRecord(
                name="collector",
                status="passed",
            )
        ],
    ).to_dict()

    assert result["published"] is True
    assert result["edition"] == "2026.06"
    assert result["audit"]["passed"] is True
    assert result["health"]["status"] == "operational"
    assert result["mode"] == "fixture"
    assert result["stages"][0]["name"] == "collector"
    assert result["error"] is None