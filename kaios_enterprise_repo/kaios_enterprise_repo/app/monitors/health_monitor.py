from __future__ import annotations
from app.utils.io import read_json, write_json
from app.utils.time import now_iso

class HealthMonitor:
    def run(self):
        status = {
            "checked_at": now_iso(),
            "status": "operational",
            "checks": [
                {"name":"monthly_data", "ok": read_json("public/monthly-data.json") is not None},
                {"name":"sources_config", "ok": read_json("config/sources.json") is not None},
                {"name":"brands_config", "ok": read_json("config/brands.json") is not None}
            ]
        }
        write_json("data/audit/health_status.json", status)
        write_json("public/api/health.json", status)
        return status
