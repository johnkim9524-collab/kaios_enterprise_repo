# Canonical V3 post-write read-back race — 2026-09-05

Status: `CONTROL_CORRECTION_ONLY / NO_CANONICAL_WRITE / PRODUCTION_PUBLIC_G5_HOLD`

## Observed runtime fact

Protected-main Canonical V3 Apply run `33934698526`, attempt `1`, on main `9a2e903949644465f13b9416e89d89d16e4beb74` posted generation `kpmo-canonical-v3-9a2e90394964-33934698526-1`.

The run wrote all 25 staged member comments and aggregate commit comment `5548245963`, then failed `POST_WRITE_READBACK_INVALID` during immediate public read-plane discovery. Its terminal receipt correctly remained `VERIFIED_FAIL`, but reported `writes=25` even though the aggregate POST had already occurred.

Natural current-main Canonical Latest run `33934847971` later completed `SUCCESS` and independently validated:

- protected main `9a2e903949644465f13b9416e89d89d16e4beb74`;
- generation `kpmo-canonical-v3-9a2e90394964-33934698526-1`;
- aggregate comment `5548245963`;
- canonical members `25`;
- material defect count `164`;
- material registry digest `sha256:8b8e2fe0c6480cd8d09d562d23aa9f087ce3440e627c91b1cb4b046f8eccebbd`;
- Production/Public/G5 `HOLD/HOLD/HOLD`.

## Correction

This branch adds a bounded, first-attempt-only recovery wrapper around the existing V3 writer. Recovery is permitted only when the original failure receipt is exactly `POST_WRITE_READBACK_INVALID`, has all 25 staged member writes, and a later independent validator observes the exact same generation, run, main, 25-member cardinality, aggregate comment and HOLD boundary.

No rerun is authorized. A different generation, different main, moved material truth, incomplete write, or any other failure class remains RED. A recovered receipt records the original fail receipt digest and corrects the effective write count to 26.

This document creates no provider, database, empirical, Public, Production, G5, spend, credential, deployment or legal authority.
