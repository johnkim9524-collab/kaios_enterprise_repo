from __future__ import annotations
from collections import defaultdict
from app.utils.io import read_json, write_json

class SignalNormalizer:
    def normalize(self):
        raw = read_json("data/raw/latest_signals.json", {"signals": []})
        grouped = defaultdict(list)

        for s in raw.get("signals", []):
            normalized = (
                float(s.get("signal", 0)) * 0.40 +
                float(s.get("sentiment", 0)) * 0.20 +
                float(s.get("visibility", 0)) * 0.20 +
                float(s.get("confidence", 0)) * 0.20
            )
            item = dict(s)
            item["normalized_signal"] = round(max(0, min(100, normalized)), 2)
            grouped[s["brand_id"]].append(item)

        brands = []
        for brand_id, items in grouped.items():
            first = items[0]
            brands.append({
                "brand_id": brand_id,
                "brand": first["brand"],
                "category": first["category"],
                "region": first["region"],
                "signal_count": len(items),
                "average_signal": round(sum(i["normalized_signal"] for i in items) / len(items), 2),
                "average_confidence": round(sum(i["confidence"] for i in items) / len(items), 2),
                "signals": items
            })

        payload = {"brands": brands}
        write_json("data/signals/normalized_signals.json", payload)
        return payload
