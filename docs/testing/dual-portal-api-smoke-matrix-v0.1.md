# Dual Portal API Smoke Matrix v0.1

## Kidults

| Case | Role | Expected |
|---|---|---|
| Enterprise snapshot with governed data | Viewer | 200, ready or partial |
| Enterprise snapshot without authentication | None | 401, unauthorized |
| Restricted rights | Viewer | 200, rights_restricted, restricted records omitted |
| Low confidence | Viewer | 200, partial, low-confidence records omitted |
| Repository unavailable | Operator | 503, retryable error |
| Export manifest | Viewer | export disabled |
| Export manifest | Operator/Admin | enabled only when snapshot is ready |

## Artfund

| Case | Role | Expected |
|---|---|---|
| Institutional snapshot with governed data | Viewer | 200, ready or partial |
| Institutional snapshot without authentication | None | 401, unauthorized |
| Disputed provenance | Viewer | 200, provenance_disputed, disputed records omitted |
| Restricted rights | Viewer | 200, rights_restricted |
| Repository unavailable | Admin | 503, retryable error |
| Export manifest | Operator/Admin | enabled only when rights and provenance gates pass |

## Common Assertions

- No write operation is exposed.
- Score and index values come from staging repositories.
- Trust Surface values accompany every portal snapshot.
- Methodology identifiers and versions are preserved.
- Desktop and mobile clients receive identical semantic states.
- Illustrative static values cannot override repository values.
