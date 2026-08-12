# KIDULTS Registry Governance v1.0

## Purpose

The Registry is the shared operating memory for all humans, AI agents, services, code, Portal and official Books.

It is not merely a storage folder. It controls identifiers, roles, states, decisions, risks, evidence, handoffs and releases.

## Registry ownership

| Registry | Primary producer | Custodian | Main consumers |
|---|---|---|---|
| Program | KPMO / integration | Atlas | Everyone |
| Core Vertical | Architecture | Atlas | A, B, C |
| Snapshot | Track A / Publisher | Atlas | B, C, Books |
| Evidence | Track A | Atlas | B, QA |
| Decision | John / Atlas | Atlas | Everyone |
| Risk | Any track / integration | Atlas | John, QA, all tracks |
| Handoff | Sending track | Atlas | Receiving track |
| Object | Architecture / editorial | Atlas | A, C |
| Asset | Editorial & Rights | Atlas | C, QA |
| Rights | Editorial & Rights | Atlas | C, QA, John |
| Provider | John / Track A analysis | Atlas | A, B, John |
| Release | Snapshot Publisher / QA | Atlas | C, Books, operations |

## Change lifecycle

```text
proposal
→ evidence attached
→ review
→ approval
→ registry update
→ implementation
→ verification
→ changelog and Book sync
```

## Stable identifiers

- IDs are never reused.
- Superseded IDs are deprecated, not deleted.
- Every material entry carries version, owner, state and evidence reference.
- Display names may change without changing the stable ID.
- Snapshot IDs are immutable.

## Official status

A statement becomes official only when it is:

1. Registered in GitHub
2. Linked to evidence
3. Assigned an owner and state
4. Approved at the required level
5. Merged or recorded in a canonical issue

Chat-only statements, local files and unmerged branches are working material.

## Registry discipline

- No silent overwrite
- No missing-to-zero conversion
- No orphan decision without evidence
- No cross-track artifact without snapshot ID
- No Production release without rollback
- No asset without rights state
- No Provider commitment without measured gap

## Audit and synchronization

Atlas reviews registry integrity continuously and reports material changes in the 06:00 KST digest.

Every Sunday, approved changes are mapped to:

- Master Book
- Baseline Book
- Architecture Book

No fourth official Book is introduced.
