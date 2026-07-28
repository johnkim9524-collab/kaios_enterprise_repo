from app.config.redaction import REDACTED, redact_mapping


def test_nested_secret_values_are_redacted() -> None:
    source = {"api_secret": "never-return-this", "nested": {"password": "hidden", "safe": "visible"}}
    redacted = redact_mapping(source)
    assert redacted["api_secret"] == REDACTED
    assert redacted["nested"]["password"] == REDACTED
    assert redacted["nested"]["safe"] == "visible"
    assert "never-return-this" not in str(redacted)