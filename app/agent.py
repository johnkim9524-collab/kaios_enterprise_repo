from __future__ import annotations

from typing import Any

from app.collectors.source_collector import SourceCollector
from app.core.contracts import RuntimeResult
from app.core.errors import StageExecutionError
from app.core.modes import RuntimeMode
from app.core.normalizer import SignalNormalizer
from app.core.runtime import KAIOSRuntime
from app.engines.score_engine import ScoreEngine
from app.gates.quality_gate import QualityGate
from app.monitors.health_monitor import HealthMonitor
from app.publishers.publisher import Publisher
from app.writers.intelligence_writer import IntelligenceWriter


class KAIOSAgent:
    def __init__(
        self,
        mode: RuntimeMode | str = RuntimeMode.FIXTURE,
    ) -> None:
        self.mode = (
            mode
            if isinstance(mode, RuntimeMode)
            else RuntimeMode.parse(mode)
        )

    def run(self) -> dict[str, Any]:
        runtime = KAIOSRuntime(self.mode)
        edition: str | None = None
        audit: dict[str, Any] | None = None

        try:
            runtime.execute(
                "collector",
                lambda: SourceCollector(self.mode).collect(),
            )

            runtime.execute(
                "normalizer",
                SignalNormalizer().normalize,
            )

            edition_data = runtime.execute(
                "score_engine",
                ScoreEngine().score,
            )

            edition = edition_data["edition"]

            runtime.execute(
                "intelligence_writer",
                lambda: IntelligenceWriter().write(edition),
            )

            audit = runtime.execute(
                "quality_gate",
                lambda: QualityGate().check(edition),
            )

            if not audit["passed"]:
                return RuntimeResult(
                    published=False,
                    mode=self.mode,
                    edition=edition,
                    audit=audit,
                    stages=runtime.stages,
                    error={
                        "type": "quality_gate_failed",
                        "stage": "quality_gate",
                        "message": "The intelligence edition did not pass.",
                    },
                ).to_dict()

            runtime.execute(
                "publisher",
                lambda: Publisher().publish(edition),
            )

            health = runtime.execute(
                "health_monitor",
                HealthMonitor().run,
            )

            return RuntimeResult(
                published=True,
                mode=self.mode,
                edition=edition,
                audit=audit,
                health=health,
                stages=runtime.stages,
            ).to_dict()

        except StageExecutionError as exc:
            return RuntimeResult(
                published=False,
                mode=self.mode,
                edition=edition,
                audit=audit,
                stages=runtime.stages,
                error={
                    "type": exc.__class__.__name__,
                    "stage": exc.stage,
                    "message": str(exc.cause),
                },
            ).to_dict()