from __future__ import annotations

from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from typing import Iterable
from xml.etree import ElementTree


@dataclass(frozen=True)
class FeedEntry:
    title: str
    link: str
    summary: str
    published_at: str | None
    external_id: str


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def child_text(element: ElementTree.Element, names: Iterable[str]) -> str:
    expected = {name.lower() for name in names}
    for child in list(element):
        if local_name(child.tag) in expected:
            value = "".join(child.itertext()).strip()
            if value:
                return value
    return ""


def atom_link(element: ElementTree.Element) -> str:
    for child in list(element):
        if local_name(child.tag) != "link":
            continue
        href = child.attrib.get("href", "").strip()
        relation = child.attrib.get("rel", "alternate").strip()
        if href and relation in {"", "alternate"}:
            return href
    return ""


def normalize_date(value: str) -> str | None:
    raw_value = value.strip()
    if not raw_value:
        return None
    try:
        return parsedate_to_datetime(raw_value).isoformat()
    except (TypeError, ValueError, OverflowError):
        return raw_value


def parse_feed(body: bytes) -> list[FeedEntry]:
    try:
        root = ElementTree.fromstring(body)
    except ElementTree.ParseError as exc:
        raise RuntimeError(f"Invalid RSS or Atom XML: {exc}") from exc
    root_name = local_name(root.tag)
    entries: list[FeedEntry] = []
    if root_name == "rss":
        channel = next((child for child in list(root) if local_name(child.tag) == "channel"), None)
        if channel is None:
            raise RuntimeError("RSS feed does not contain a channel.")
        candidates = [child for child in list(channel) if local_name(child.tag) == "item"]
        for item in candidates:
            title = child_text(item, {"title"})
            link = child_text(item, {"link"})
            summary = child_text(item, {"description", "summary", "content"})
            published = child_text(item, {"pubdate", "published", "updated"})
            external_id = child_text(item, {"guid", "id"}) or link or title
            if title and external_id:
                entries.append(FeedEntry(title, link, summary, normalize_date(published), external_id))
    elif root_name == "feed":
        candidates = [child for child in list(root) if local_name(child.tag) == "entry"]
        for item in candidates:
            title = child_text(item, {"title"})
            link = atom_link(item)
            summary = child_text(item, {"summary", "content"})
            published = child_text(item, {"published", "updated"})
            external_id = child_text(item, {"id"}) or link or title
            if title and external_id:
                entries.append(FeedEntry(title, link, summary, normalize_date(published), external_id))
    else:
        raise RuntimeError(f"Unsupported feed root element: {root_name}")
    if not entries:
        raise RuntimeError("RSS or Atom feed contains no usable entries.")
    return entries