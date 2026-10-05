# KIDULTS Developer Guide

## Governing authority

All development is governed by the [KIDULTS Platform Constitution](../CONSTITUTION.md). Article 0, the **KIDULTS Supreme Platform Philosophy**, is its highest governing layer and highest acceptance criterion; every implementation must strengthen Autonomous, Global, Irreplaceable Value, and Transparent principles. If this guide, a local convention, a tool instruction, or an implementation plan conflicts with the Constitution, the Constitution prevails and the conflict must be surfaced rather than silently resolved.

Every change must document its purpose, risk, rollback, recovery, validation, and long-term impact. Important changes require static, runtime, regression, natural, and operational validation; CI or merge alone is not completion evidence.

## Implementation baseline

- Prefer one authoritative truth, registry, runtime, leader, state, receipt, and authority per operational domain.
- Reduce complexity, coupling, duplication, and operational entropy.
- Preserve deterministic output, restart, replay, recovery, independent validation, and replacement.
- Preserve append-only evidence and fail closed: uncertainty is `HOLD`, never `PASS`.
- Convert each repaired defect into lasting architecture, governance, validation, regression, documentation, and automated recovery.

Repository-specific commands and component procedures remain in the relevant component documentation and machine contracts.
