from __future__ import annotations
from collections import defaultdict
from app.utils.io import read_json, write_json
from app.utils.time import current_edition, now_iso

class ScoreEngine:
    def score(self):
        site = read_json("config/site.json", {})
        edition = site.get("current_edition") or current_edition()
        normalized = read_json("data/signals/normalized_signals.json", {"brands": []})
        brands = sorted(normalized.get("brands", []), key=lambda x: x["average_signal"], reverse=True)

        top = []
        for i, b in enumerate(brands, 1):
            top.append({
                "rank": i,
                "brand": b["brand"],
                "category": b["category"],
                "region": b["region"],
                "score": b["average_signal"],
                "rank_change": 0 if i <= 3 else "NEW",
                "confidence": b["average_confidence"],
                "signal_count": b["signal_count"]
            })

        cat = defaultdict(list)
        geo = defaultdict(list)
        for b in top:
            cat[b["category"]].append(b["score"])
            geo[b["region"]].append(b["score"])

        industry_map = [{"category": k, "average_score": round(sum(v)/len(v), 2), "momentum": round((sum(v)/len(v)-80)/10, 2)} for k, v in cat.items()]
        total_geo = sum(sum(v) for v in geo.values()) or 1
        geography = [{"region": k, "share": round(sum(v)/total_geo*100, 2)} for k, v in geo.items()]
        avg_index = round(sum(b["score"] for b in top)/len(top), 2) if top else 0
        avg_conf = round(sum(b["confidence"] for b in top)/len(top), 2) if top else 0

        edition_data = {
            "edition": edition,
            "generated_at": now_iso(),
            "platform": "KIDULTS",
            "system": "KAIOS Enterprise",
            "kidult_100_index": {"value": avg_index, "change": 0.4},
            "collector_sentiment": {"score": avg_index, "label": "Positive" if avg_index >= 75 else "Neutral"},
            "confidence_engine": {
                "overall": avg_conf,
                "grade": "A" if avg_conf >= 85 else "B",
                "breakdown": [
                    {"label":"Coverage","weight":35,"score":avg_conf},
                    {"label":"Freshness","weight":25,"score":avg_conf},
                    {"label":"Consistency","weight":25,"score":avg_conf},
                    {"label":"Source Reliability","weight":15,"score":avg_conf}
                ]
            },
            "top_50_brands": top,
            "industry_map": industry_map,
            "geography": geography
        }
        write_json(f"data/editions/{edition}.json", edition_data)
        return edition_data
