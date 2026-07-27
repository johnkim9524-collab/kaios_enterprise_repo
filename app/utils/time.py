from datetime import datetime, timezone

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def current_edition() -> str:
    return datetime.now(timezone.utc).strftime("%Y.%m")
