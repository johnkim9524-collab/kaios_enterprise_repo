# Architecture

## Constitutional authority

Article 0, the **KIDULTS Supreme Platform Philosophy**, is the highest governing layer of the [KIDULTS Platform Constitution](../CONSTITUTION.md) and the highest architectural criterion. Every architectural decision must strengthen Autonomous, Global, Irreplaceable Value, and Transparent principles. This guide describes implementation topology only; it cannot create duplicate authority or weaken constitutional requirements for determinism, recoverability, observability, maintainability, fail-closed behavior, append-only evidence, natural validation, and a single source of truth.

```text
Collectors
↓
Normalizer
↓
Score Engine
↓
Intelligence Writer
↓
Quality Gate
↓
Publisher
↓
Cloudflare Pages
```
