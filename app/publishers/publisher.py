from __future__ import annotations
from app.utils.io import read_json, write_json, write_text
from app.utils.io import ROOT
import shutil

class Publisher:
    def publish(self, edition: str):
        data = read_json(f"data/editions/{edition}.json")
        if not data:
            raise FileNotFoundError(f"data/editions/{edition}.json")

        write_json("public/monthly-data.json", data)
        write_json(f"public/data/{edition}.json", data)

        archive_dir = ROOT / "public" / "archive" / edition
        archive_dir.mkdir(parents=True, exist_ok=True)
        report = ROOT / "public" / "report" / "index.html"
        if report.exists():
            shutil.copy2(report, archive_dir / "index.html")

        archive = {"current": edition, "editions": [{"edition": edition, "title": f"KIDULTS Monthly Intelligence — {edition}", "path": f"/archive/{edition}/", "data": f"/data/{edition}.json"}]}
        write_json("public/archive/index.json", archive)
        write_json("public/api/status.json", {"status": "operational", "edition": edition, "quality_gate": "passed"})

        sitemap = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.kidults.com/</loc></url>
  <url><loc>https://www.kidults.com/dashboard/</loc></url>
  <url><loc>https://www.kidults.com/report/</loc></url>
  <url><loc>https://www.kidults.com/archive/{edition}/</loc></url>
</urlset>
"""
        write_text("public/sitemap.xml", sitemap)
        return data
