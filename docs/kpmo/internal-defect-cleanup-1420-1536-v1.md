# KPMO Internal Defect Cleanup 1420 / 1536 V1

Source main: `9d8ff2e4fee83197dadb5c37872ef88c84d55650`.

This packet is limited to two reversible internal governance corrections:

1. #1420 — replace exact-SHA-only canonical issue transition validation with monotonic ancestor-or-equal lineage validation. Diverged, future/behind, invalid SHA, missing block and compare failure remain fail-closed.
2. #1536 — remove the unauthorized GitHub Actions force-cancel escalation. Retain only normal cancellation plus bounded passive terminal read-back; exact-head runs remain excluded from cancellation.

This packet does not authorize Cloudflare project mutations, Production/Public/G5 promotion, provider calls, credentials, PostgreSQL execution, ruleset mutation, or empirical evidence promotion.
