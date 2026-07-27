from __future__ import annotations

from time import perf_counter
from typing import Any, Callable, TypeVar

from app.collectors.source_collector import SourceCollector
from app.core.contracts import RuntimeResult
from app.core.errors import StageExecutionError
from app.core.modes import RuntimeMode
from app.core.normalizer import SignalNormalizer
from app.core.runtime import KAIOSRuntime
from app.engines.score_engine import ScoreEngine
from app.gates.quality_gate import QualityGate
from app.monitors.health_monitor import HealthMonitor
from app.persistence.repository import RunHistoryRepository
from app.publishers.publisher import Publisher
from app.writers.intelligence_writer import IntelligenceWriter


T = TypeVar("T")


class KAIOSAgent:
    def __init__(
        self,
        mode: RuntimeMode | str = RuntimeMode.FIXTURE,
        history_repository: RunHistoryRepository | None = None,
    ) -> None:
        self.mode = (
            mode
            if isinstance(mode, RuntimeMode)
            else RuntimeMode.parse(mode)
        )

        self.history_repository = (
            history_repository
            if history_repository is not None
            else RunHistoryRepository()
        )

    def run(
        self,
        trigger_type: str = "manual",
    ) -> dict[str, Any]:
        started = perf_counter()
        runtime = KAIOSRuntime(self.mode)

        run_id = self.history_repository.start_run(
            mode=self.mode,
            trigger_type=trigger_type,
        )

        edition: str | None = None
        audit: dict[str, Any] | None = None

        def execute(
            stage_name: str,
            action: Callable[[], T],
        ) -> T:
            try:
                result = runtime.execute(
                    stage_name,
                    action,
                )
            except StageExecutionError:
                self.history_repository.record_stage(
                    run_id=run_id,
                    sequence_number=len(runtime.stages),
                    stage=runtime.stages[-1],
                )
                raise

            self.history_repository.record_stage(
                run_id=run_id,
                sequence_number=len(runtime.stages),
                stage=runtime.stages[-1],
            )

            return result

        try:
            collection = execute(
                "collector",
                lambda: SourceCollector(
                    self.mode
                ).collect(),
            )

            self.history_repository.record_sources(
                run_id=run_id,
                sources=collection.get(
                    "sources",
                    [],
                ),
            )

            execute(
                "normalizer",
                SignalNormalizer().normalize,
            )

            edition_data = execute(
                "score_engine",
                ScoreEngine().score,
            )

            edition = edition_data["edition"]

            execute(
                "intelligence_writer",
                lambda: IntelligenceWriter().write(
                    edition
                ),
            )

            audit = execute(
                "quality_gate",
                lambda: QualityGate().check(
                    edition
                ),
            )

            if not audit["passed"]:
                error = {
                    "type": "quality_gate_failed",
                    "stage": "quality_gate",
                    "message": (
                        "The intelligence edition did not pass."
                    ),
                }

                result = RuntimeResult(
                    run_id=run_id,
                    trigger_type=trigger_type,
                    published=False,
                    mode=self.mode,
                    edition=edition,
                    audit=audit,
                    stages=runtime.stages,
                    error=error,
                ).to_dict()

                self._complete_history(
                    run_id=run_id,
                    started=started,
                    status="failed",
                    published=False,
                    edition=edition,
                    error=error,
                )

                return result

            execute(
                "publisher",
                lambda: Publisher().publish(
                    edition
                ),
            )

            self.history_repository.record_publication(
                run_id=run_id,
                edition=edition,
            )

            health = execute(
                "health_monitor",
                HealthMonitor().run,
            )

            result = RuntimeResult(
                run_id=run_id,
                trigger_type=trigger_type,
                published=True,
                mode=self.mode,
                edition=edition,
                audit=audit,
                health=health,
                stages=runtime.stages,
            ).to_dict()

            self._complete_history(
                run_id=run_id,
                started=started,
                status="published",
                published=True,
                edition=edition,
            )

            return result

        except StageExecutionError as exc:
            error = {
                "type": exc.__class__.__name__,
                "stage": exc.stage,
                "message": str(exc.cause),
            }

            result = RuntimeResult(
                run_id=run_id,
                trigger_type=trigger_type,
                published=False,
                mode=self.mode,
                edition=edition,
                audit=audit,
                stages=runtime.stages,
                error=error,
            ).to_dict()

            self._complete_history(
                run_id=run_id,
                started=started,
                status="failed",
                published=False,
                edition=edition,
                error=error,
            )

            return result

    def _complete_history(
        self,
        run_id: str,
        started: float,
        status: str,
        published: bool,
        edition: str | None,
        error: dict[str, Any] | None = None,
    ) -> None:
        duration_ms = int(
            (perf_counter() - started) * 1000
        )

        self.history_repository.complete_run(
            run_id=run_id,
            status=status,
            published=published,
            edition=edition,
            duration_ms=duration_ms,
            error=error,
        )