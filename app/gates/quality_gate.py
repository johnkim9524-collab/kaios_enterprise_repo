from __future__ import annotations
import sys
from app.utils.io import read_json, write_json
from app.utils.time import now_iso

class QualityGate:
    def check(self, edition: str):
        data = read_json(f"data/editions/{edition}.json", {})
        rules = read_json("config/scoring.json", {})["quality_gate"]
        errors = []
        warnings = []

        for field in rules["required_fields"]:
            if field not in data:
                errors.append(f"Missing required field: {field}")

        if len(data.get("top_50_brands", [])) < rules["min_brand_count"]:
            errors.append("Brand count below minimum.")

        if data.get("confidence_engine", {}).get("overall", 0) < rules["min_confidence"]:
            errors.append("Confidence below minimum.")

        audit = {"checked_at": now_iso(), "edition": edition, "passed": not errors, "errors": errors, "warnings": warnings}
        write_json(f"data/audit/quality_gate_{edition}.json", audit)
        return audit
