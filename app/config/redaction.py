from collections.abc import Mapping, Sequence
from typing import Any

REDACTED = "[REDACTED]"
_SECRET_MARKERS = ("secret", "token", "password", "credential", "private_key", "api_key", "apikey")


def is_sensitive_key(key: str) -> bool:
    normalized = key.strip().lower()
    return any(marker in normalized for marker in _SECRET_MARKERS)


def redact_mapping(value: Mapping[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, item in value.items():
        result[str(key)] = REDACTED if is_sensitive_key(str(key)) else redact(item)
    return result


def redact(value: Any) -> Any:
    if isinstance(value, Mapping):
        return redact_mapping(value)
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [redact(item) for item in value]
    return value