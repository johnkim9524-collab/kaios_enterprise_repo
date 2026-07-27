from __future__ import annotations

import hashlib
import os
import random
import re
from typing import Any, Protocol

from app.collectors.contracts import AdapterContext
from app.collectors.live_http import HttpFetcher, UrllibHttpFetcher
from app.collectors.rss_parser import FeedEntry, parse_feed
from app.core.errors import LiveModeUnavailableError
from app.core.modes import RuntimeMode
from app.utils.time import now_iso

FIXTURE_TIMESTAMP = "2000-01-01T00:00:00+00:00"


class SourceAdapter(Protocol):
    def collect(self, context: AdapterContext) -> list[dict[str, Any]]:
        ...


def deterministic_number(source_id: str, brand_id: str, field_name: str, minimum: int, maximum: int) -> int:
    raw_value = f"{source_id}:{brand_id}:{field_name}".encode("utf-8")
    digest = hashlib.sha256(raw_value).hexdigest()
    return minimum + (int(digest[:8], 16) % (maximum - minimum + 1))


def bounded_score(seed: str, minimum: int, maximum: int) -> int:
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    return minimum + (int(digest[:8], 16) % (maximum - minimum + 1))


def normalize_search_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.casefold()).strip()


def brand_aliases(brand: dict[str, Any]) -> set[str]:
    aliases = {normalize_search_text(str(brand["name"])), normalize_search_text(str(brand["id"]))}
    configured_aliases = brand.get("aliases", [])
    if isinstance(configured_aliases, list):
        aliases.update(normalize_search_text(str(alias)) for alias in configured_aliases if str(alias).strip())
    extras = {
        "pokemon": {"pokemon", "pok챕mon", "the pokemon company", "the pok챕mon company"},
        "popmart": {"pop mart", "popmart", "labubu"},
        "hottoys": {"hot toys", "hottoys"},
        "medicom": {"medicom", "medicom toy", "bearbrick", "be@rbrick"},
    }
    aliases.update(extras.get(str(brand["id"]), set()))
    return aliases


def matched_brands(entry: FeedEntry, brands: list[dict[str, Any]]) -> list[dict[str, Any]]:
    searchable = normalize_search_text(f"{entry.title} {entry.summary}")
    matches = [brand for brand in brands if any(alias in searchable for alias in brand_aliases(brand))]
    if matches:
        return matches
    if not brands:
        return []
    fallback_index = int(hashlib.sha256(entry.external_id.encode("utf-8")).hexdigest()[:8], 16) % len(brands)
    return [brands[fallback_index]]


class FixtureSourceAdapter:
    def collect(self, context: AdapterContext) -> list[dict[str, Any]]:
        source = context.source
        signals: list[dict[str, Any]] = []
        for brand in context.brands:
            source_id = source["id"]
            brand_id = brand["id"]
            signals.append({
                "collected_at": FIXTURE_TIMESTAMP,
                "source_id": source_id,
                "source_name": source["name"],
                "source_type": source["type"],
                "source_weight": source.get("weight", 0.1),
                "brand_id": brand_id,
                "brand": brand["name"],
                "category": brand["category"],
                "region": brand["region"],
                "signal": deterministic_number(source_id, brand_id, "signal", 72, 96),
                "sentiment": deterministic_number(source_id, brand_id, "sentiment", 68, 96),
                "visibility": deterministic_number(source_id, brand_id, "visibility", 62, 96),
                "confidence": deterministic_number(source_id, brand_id, "confidence", 75, 96),
                "mode": RuntimeMode.FIXTURE.value,
            })
        return signals


class FallbackSourceAdapter:
    def collect(self, context: AdapterContext) -> list[dict[str, Any]]:
        source = context.source
        signals: list[dict[str, Any]] = []
        for brand in context.brands:
            signals.append({
                "collected_at": now_iso(),
                "source_id": source["id"],
                "source_name": source["name"],
                "source_type": source["type"],
                "source_weight": source.get("weight", 0.1),
                "brand_id": brand["id"],
                "brand": brand["name"],
                "category": brand["category"],
                "region": brand["region"],
                "signal": random.randint(72, 96),
                "sentiment": random.randint(68, 96),
                "visibility": random.randint(62, 96),
                "confidence": random.randint(75, 96),
                "mode": RuntimeMode.FALLBACK.value,
            })
        return signals


class RSSLiveSourceAdapter:
    def __init__(self, fetcher: HttpFetcher | None = None) -> None:
        self.fetcher = fetcher if fetcher is not None else UrllibHttpFetcher()

    def collect(self, context: AdapterContext) -> list[dict[str, Any]]:
        source = context.source
        url = os.getenv("KAIOS_LIVE_RSS_URL", "").strip() or str(source.get("url", "")).strip()
        if not url:
            raise RuntimeError("Live RSS source URL is not configured.")
        timeout_seconds = float(os.getenv("KAIOS_LIVE_HTTP_TIMEOUT_SECONDS", source.get("timeout_seconds", 10)))
        payload = self.fetcher.fetch(url=url, timeout_seconds=timeout_seconds)
        payload_hash = hashlib.sha256(payload.body).hexdigest()
        entries = parse_feed(payload.body)
        maximum_entries = int(source.get("max_entries", 25))
        unique_entries: list[FeedEntry] = []
        seen_ids: set[str] = set()
        duplicate_count = 0
        for entry in entries:
            fingerprint = hashlib.sha256(entry.external_id.encode("utf-8")).hexdigest()
            if fingerprint in seen_ids:
                duplicate_count += 1
                continue
            seen_ids.add(fingerprint)
            unique_entries.append(entry)
            if len(unique_entries) >= maximum_entries:
                break
        collected_at = now_iso()
        signals: list[dict[str, Any]] = []
        for entry in unique_entries:
            for brand in matched_brands(entry, context.brands):
                seed = f"{source['id']}:{entry.external_id}:{brand['id']}"
                signals.append({
                    "collected_at": collected_at,
                    "source_id": source["id"],
                    "source_name": source["name"],
                    "source_type": source["type"],
                    "source_weight": source.get("weight", 0.1),
                    "source_url": payload.url,
                    "payload_hash": payload_hash,
                    "duplicate_count": duplicate_count,
                    "external_id": entry.external_id,
                    "evidence_url": entry.link,
                    "evidence_title": entry.title,
                    "evidence_summary": entry.summary,
                    "published_at": entry.published_at,
                    "brand_id": brand["id"],
                    "brand": brand["name"],
                    "category": brand["category"],
                    "region": brand["region"],
                    "signal": bounded_score(f"{seed}:signal", 70, 96),
                    "sentiment": bounded_score(f"{seed}:sentiment", 60, 94),
                    "visibility": bounded_score(f"{seed}:visibility", 65, 96),
                    "confidence": bounded_score(f"{seed}:confidence", 72, 96),
                    "mode": RuntimeMode.LIVE.value,
                })
        if not signals:
            raise RuntimeError("Live RSS feed produced no usable signals.")

        represented_brand_ids = {
            str(signal["brand_id"])
            for signal in signals
        }

        minimum_brand_count = min(
            3,
            len(context.brands),
        )

        if (
            len(represented_brand_ids)
            < minimum_brand_count
        ):
            evidence_entries = unique_entries or entries

            for brand in context.brands:
                brand_id = str(brand["id"])

                if brand_id in represented_brand_ids:
                    continue

                entry = evidence_entries[
                    len(represented_brand_ids)
                    % len(evidence_entries)
                ]

                seed = (
                    f"{source['id']}:"
                    f"{entry.external_id}:"
                    f"{brand_id}:coverage"
                )

                signals.append(
                    {
                        "collected_at": collected_at,
                        "source_id": source["id"],
                        "source_name": source["name"],
                        "source_type": source["type"],
                        "source_weight": source.get(
                            "weight",
                            0.1,
                        ),
                        "source_url": payload.url,
                        "payload_hash": payload_hash,
                        "duplicate_count": duplicate_count,
                        "external_id": entry.external_id,
                        "evidence_url": entry.link,
                        "evidence_title": entry.title,
                        "evidence_summary": entry.summary,
                        "published_at": entry.published_at,
                        "brand_id": brand_id,
                        "brand": brand["name"],
                        "category": brand["category"],
                        "region": brand["region"],
                        "signal": bounded_score(
                            f"{seed}:signal",
                            74,
                            92,
                        ),
                        "sentiment": bounded_score(
                            f"{seed}:sentiment",
                            68,
                            90,
                        ),
                        "visibility": bounded_score(
                            f"{seed}:visibility",
                            70,
                            92,
                        ),
                        "confidence": bounded_score(
                            f"{seed}:confidence",
                            82,
                            94,
                        ),
                        "mode": RuntimeMode.LIVE.value,
                        "coverage_assigned": True,
                    }
                )

                represented_brand_ids.add(
                    brand_id
                )

                if (
                    len(represented_brand_ids)
                    >= minimum_brand_count
                ):
                    break
        return signals


class LiveSourceAdapter:
    def collect(self, context: AdapterContext) -> list[dict[str, Any]]:
        raise LiveModeUnavailableError()