from __future__ import annotations
from app.collectors.source_collector import SourceCollector
from app.core.normalizer import SignalNormalizer
from app.engines.score_engine import ScoreEngine
from app.writers.intelligence_writer import IntelligenceWriter
from app.gates.quality_gate import QualityGate
from app.publishers.publisher import Publisher
from app.monitors.health_monitor import HealthMonitor

class KAIOSAgent:
    def run(self):
        SourceCollector().collect()
        SignalNormalizer().normalize()
        edition_data = ScoreEngine().score()
        edition = edition_data["edition"]
        IntelligenceWriter().write(edition)
        audit = QualityGate().check(edition)

        if not audit["passed"]:
            return {"published": False, "edition": edition, "audit": audit}

        Publisher().publish(edition)
        health = HealthMonitor().run()
        return {"published": True, "edition": edition, "audit": audit, "health": health}
