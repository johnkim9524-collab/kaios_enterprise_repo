from __future__ import annotations
import random
from app.utils.io import read_json, write_json
from app.utils.time import now_iso

class SourceCollector:
    def __init__(self):
        self.sources = read_json("config/sources.json", {"sources": []})["sources"]
        self.brands = read_json("config/brands.json", {"brands": []})["brands"]

    def _fallback_signal(self, source, brand):
        base = random.randint(72, 96)
        return {
            "collected_at": now_iso(),
            "source_id": source["id"],
            "source_name": source["name"],
            "source_type": source["type"],
            "source_weight": source.get("weight", 0.1),
            "brand_id": brand["id"],
            "brand": brand["name"],
            "category": brand["category"],
            "region": brand["region"],
            "signal": base,
            "sentiment": random.randint(68, 96),
            "visibility": random.randint(62, 96),
            "confidence": random.randint(75, 96),
            "mode": "fallback"
        }

    def collect(self):
        signals = []
        active_sources = [s for s in self.sources if s.get("enabled")]
        for source in active_sources:
            for brand in self.brands:
                signals.append(self._fallback_signal(source, brand))

        payload = {
            "collected_at": now_iso(),
            "source_count": len(active_sources),
            "brand_count": len(self.brands),
            "signals": signals
        }
        write_json("data/raw/latest_signals.json", payload)
        write_json(f"data/cache/signals_{payload['collected_at'][:10]}.json", payload)
        return payload
