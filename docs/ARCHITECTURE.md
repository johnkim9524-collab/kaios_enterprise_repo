# Architecture

## Constitutional authority

The [KIDULTS Platform Constitution](../CONSTITUTION.md) governs every architectural decision. This guide describes implementation topology only; it cannot create duplicate authority or weaken constitutional requirements for determinism, recoverability, observability, maintainability, fail-closed behavior, append-only evidence, natural validation, and a single source of truth.

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
