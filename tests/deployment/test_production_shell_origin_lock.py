from pathlib import Path


CANONICAL = 'readonly BASE_URL="https://kaios.kidults.com"'
AUTH_HEADER = 'Authorization: Bearer ${ADMIN_TOKEN}'


def _read(relative: str) -> str:
    return Path(relative).read_text(encoding="utf-8")


def test_controlled_promotion_origin_is_not_environment_overridable() -> None:
    text = _read("scripts/production/promote-kidults-controlled.sh")
    assert CANONICAL in text
    assert 'BASE_URL="${BASE_URL:-' not in text
    assert AUTH_HEADER in text
    assert '"${BASE_URL}/api/collector?mode=live"' in text


def test_postdeployment_certification_origin_is_not_environment_overridable() -> None:
    text = _read("scripts/production/certify-kidults-postdeployment.sh")
    assert CANONICAL in text
    assert 'BASE_URL="${BASE_URL:-' not in text
    assert AUTH_HEADER in text
    assert '"${BASE_URL}/api/collector?mode=live"' in text
    assert '"production_origin": "https://kaios.kidults.com"' in text
