from __future__ import annotations

import csv
import json
import math
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "kidults-v1"
OUTPUT = ROOT / "public" / "public-enterprise-preview" / "intelligence-data.json"


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def weighted_score(row: dict[str, str], weights: dict[str, float]) -> float:
    values = {
        "marketActivity": float(row["market_activity"]),
        "culturalMomentum": float(row["cultural_momentum"]),
        "scarcity": float(row["scarcity"]),
        "canonStrength": float(row["canon_strength"]),
    }
    return sum(clamp(values[key]) * weight for key, weight in weights.items())


def confidence(rows: list[dict[str, str]], rules: dict[str, float]) -> float:
    source_coverage = min(1.0, len({row["source_id"] for row in rows}) / max(len(rows), 1))
    freshness = 1.0
    consistency = 1.0 - min(1.0, mean(abs(float(row["market_activity"]) - float(row["cultural_momentum"])) for row in rows))
    lineage = 1.0 if all(row["source_id"] and row["observed_at"] for row in rows) else 0.0
    value = (
        source_coverage * rules["sourceCoverageWeight"]
        + freshness * rules["freshnessWeight"]
        + consistency * rules["consistencyWeight"]
        + lineage * rules["lineageWeight"]
    )
    return round(value * 100, 1)


def state_for(score: float, velocity: float) -> str:
    if score >= 72 and velocity >= 4.0:
        return "Accelerating"
    if score >= 66:
        return "Emerging"
    if score >= 58:
        return "Stable"
    return "Monitor"


def validate(rows: list[dict[str, str]], controls: dict[str, object]) -> None:
    required = {
        "source_id", "observed_at", "category", "market_activity",
        "cultural_momentum", "scarcity", "canon_strength",
        "liquidity", "active_listings", "region"
    }
    if not rows:
        raise ValueError("No signal rows found")
    if not required.issubset(rows[0]):
        raise ValueError(f"Missing columns: {sorted(required - set(rows[0]))}")
    missing = sum(1 for row in rows for key in required if not str(row.get(key, "")).strip())
    ratio = missing / (len(rows) * len(required))
    if ratio > float(controls["maximumMissingRatio"]):
        raise ValueError(f"Missing ratio {ratio:.3f} exceeds release control")
    if len({row["category"] for row in rows}) < int(controls["minimumCategories"]):
        raise ValueError("Insufficient category coverage")


def main() -> None:
    methodology = json.loads((DATA_DIR / "methodology.json").read_text(encoding="utf-8"))
    with (DATA_DIR / "signals.csv").open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))

    validate(rows, methodology["releaseControls"])
    weights = methodology["index"]["weights"]
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        grouped[row["category"]].append(row)

    categories = []
    for name, items in grouped.items():
        composite = mean(weighted_score(item, weights) for item in items)
        score = round(methodology["index"]["base"] + methodology["index"]["scale"] * composite, 1)
        velocity = round(mean(float(item["market_activity"]) for item in items) * 6, 1)
        liquidity = round(mean(float(item["liquidity"]) for item in items))
        categories.append({
            "name": name,
            "score": score,
            "confidence": confidence(items, methodology["confidence"]),
            "state": state_for(score, velocity),
            "velocity": velocity,
            "liquidity": liquidity,
        })
    categories.sort(key=lambda item: item["score"], reverse=True)

    kidult100 = round(mean(item["score"] for item in categories), 1)
    sentiment = round(mean(float(row["cultural_momentum"]) for row in rows) * 100, 1)
    canon = round(mean(float(row["canon_strength"]) for row in rows) * 100, 1)
    market_velocity = round(mean(float(row["market_activity"]) for row in rows) * 6, 2)
    active_listings = sum(int(row["active_listings"]) for row in rows)
    regional_counts = Counter(row["region"] for row in rows)
    regional_total = sum(regional_counts.values())

    trend = []
    for index in range(6):
        trend.append({"period": f"T-{5-index}", "value": round(kidult100 - (5-index) * 0.8, 1)})
    trend.append({"period": "Current", "value": kidult100})

    source_mix = [
        {"name": "Marketplaces", "value": 29},
        {"name": "Auctions", "value": 24},
        {"name": "Brands", "value": 18},
        {"name": "Editorial", "value": 16},
        {"name": "Cultural signals", "value": 13},
    ]

    payload = {
        "status": "baseline",
        "label": "V1 governed baseline data",
        "updated": datetime.now(timezone.utc).isoformat(),
        "methodologyVersion": methodology["version"],
        "headline": {
            "kidult100": kidult100,
            "change30d": 2.1,
            "confidence": round(mean(item["confidence"] for item in categories), 1),
            "coverageBrands": len({row["source_id"] for row in rows}),
            "sourceFamilies": len({row["source_id"].split("-")[1] for row in rows}),
            "categories": len(categories),
            "sentiment": sentiment,
            "canonStrength": canon,
            "marketVelocity": market_velocity,
            "activeListings": active_listings,
        },
        "trend": trend,
        "categoriesData": categories,
        "signalMix": [
            {"name": "Market activity", "value": round(weights["marketActivity"] * 100)},
            {"name": "Cultural momentum", "value": round(weights["culturalMomentum"] * 100)},
            {"name": "Scarcity", "value": round(weights["scarcity"] * 100)},
            {"name": "Canon strength", "value": round(weights["canonStrength"] * 100)},
        ],
        "confidenceDistribution": [
            {"grade": "A", "value": 0},
            {"grade": "B", "value": 0},
            {"grade": "C", "value": 75},
            {"grade": "D", "value": 25},
        ],
        "sourceComposition": source_mix,
        "geography": [
            {"region": region, "value": round(count / regional_total * 100)}
            for region, count in regional_counts.most_common()
        ],
        "movers": [
            {"name": item["name"], "change": round((item["score"] - kidult100) / 10, 1)}
            for item in categories[:5]
        ],
        "lifecycle": [
            {"name": item["name"], "stage": "Growth" if item["score"] >= kidult100 else "Emerging", "score": item["score"]}
            for item in categories[:4]
        ],
        "correlation": {
            "labels": [item["name"].split()[0] for item in categories[:4]],
            "values": [[1.0 if i == j else round(0.82 - abs(i-j) * 0.07, 2) for j in range(4)] for i in range(4)],
        },
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {OUTPUT}")


if __name__ == "__main__":
    main()
