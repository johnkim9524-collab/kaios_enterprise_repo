from __future__ import annotations
from app.utils.io import read_json, write_json

class IntelligenceWriter:
    def write(self, edition: str):
        path = f"data/editions/{edition}.json"
        data = read_json(path)
        if not data:
            raise FileNotFoundError(path)

        top = data.get("top_50_brands", [])
        cats = data.get("industry_map", [])
        lead_brand = top[0]["brand"] if top else "leading brands"
        lead_cat = cats[0]["category"] if cats else "collectible culture"

        summary = f"This edition shows continued strength in {lead_cat}, led by {lead_brand} and supported by recurring collector demand."
        data["hero_summary"] = summary
        data["monthly_commentary"] = summary
        data["report_intelligence"] = {
            "editorial_note": summary,
            "what_changed": [f"{lead_cat} remained the leading category signal in the current edition."],
            "why_it_matters": ["Recurring movement across brands, categories and confidence signals supports a durable reading of collectible culture demand."],
            "what_to_watch_next": ["Watch whether leading brands maintain momentum into the next edition cycle."]
        }
        data["seo"] = {"title": f"KIDULTS Monthly Intelligence — {edition}", "description": summary[:155]}
        write_json(path, data)
        return data
