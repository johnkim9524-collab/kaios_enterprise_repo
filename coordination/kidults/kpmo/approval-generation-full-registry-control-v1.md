# Approval authority full-registry control v1

This control closes #1787 and #1793 by making approval freshness a complete-registry invariant rather than a changed-file convention.

## Merge-candidate rule

Every approval/authorization JSON under `coordination/kidults/governance/` is enumerated from complete candidate and base recursive Git trees. Truncated trees, incomplete PR-file pagination, malformed records, non-regular authority files, duplicate IDs, and delete/rename ambiguity fail closed.

An active record is valid only when its issuance protected-main SHA equals the PR base and live protected main exactly, and its immutable GitHub issue comment is re-read and byte-digest verified. Even then, an active committed authority is not permitted to survive a merge candidate: the external workflow must first land dormant with no active approval, and only afterward may the Program Owner issue an exact-current-main one-shot approval.

## Enforcement points

- PR lifecycle classification
- governed Ready authorization
- Scope-Aware status
- Atomic Governed Landing initial scan
- immediate pre-merge full-registry rescan
- workflow-specific external runtime live-receipt verification before secret resolution

## Boundary

The generic library and synthetic tests prove local enforcement behavior only; they do not prove a specific external workflow's live approval integration. Cloudflare requests and Environment secret resolution remain zero. Public, Production, and G5 remain HOLD.
