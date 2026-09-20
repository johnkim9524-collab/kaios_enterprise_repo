# Resilient Git checkpoint v1

## Purpose

This control detects replacement or rollback of the shared Git object database. It stores a
verified Git bundle and a self-digested manifest outside both the repository and its Git common
directory. Shallow-boundary metadata is preserved so the bundle remains independently importable
when the workspace checkout is shallow. Inspection is fail-closed and never changes the worktree.

## Required placement

`--checkpoint-root` must be an absolute, private directory on storage whose lifecycle is
independent of the workspace and Git common directory. A directory inside the repository, inside
the common Git directory, or containing either location is rejected.

For protection against workspace-level rehydration, the operator must supply a durable mounted
volume or an equivalent protected external path. A second directory on the same ephemeral volume
only protects against replacement of the shared `.git`; it does not protect against loss of the
entire volume.

## Lifecycle

After every verified local commit, atomically write a checkpoint:

```sh
npm run checkpoint:git -- \
  --checkpoint-root /absolute/protected/kidults-git-checkpoints \
  --created-at 2026-09-20T00:00:00.000Z
```

Before bootstrap or any new mutation, inspect continuity:

```sh
npm run inspect:git-checkpoint -- \
  --checkpoint-root /absolute/protected/kidults-git-checkpoints
```

The allowed state is `CONTINUITY_VERIFIED`. `ROLLBACK_DETECTED_HOLD`,
`DIVERGENCE_DETECTED_HOLD`, invalid evidence, or missing evidence must block further mutation.
The inspection returns a recovery fetch command for an authorized operator, but does not execute
it. Automatic reset, merge, push, deployment, and release are deliberately prohibited.

## Durable remote generation

Every verified development batch must also create two GitHub refs through a credentialed protected
orchestrator: a rolling `checkpoint/<source-branch>` pointer and a new immutable generation named
`checkpoint-snapshots/<source-branch>-<source-head-prefix>`. The generation is a squash recovery
snapshot based on the exact current remote `main`, contains the complete changed file set plus
`.kidults-checkpoint/manifest.json`, and never grants promotion authority.

Before reporting a batch as durably preserved, verify the immutable generation from the canonical
remote:

```sh
npm run verify:durable-git-checkpoint -- \
  --checkpoint-ref refs/heads/checkpoint-snapshots/codex-common-control-foundation-v1-157c4dda45be
```

Missing credentials block generation. Missing refs, mismatched source SHA, unexpected manifest
fields, a non-main parent, or any file-tree difference returns `HOLD`. A local bundle is defense in
depth only and cannot substitute for this durable remote generation.

## Recovery boundary

Recovery requires review of the bundle, current branch, and divergence before an operator fetches
the saved commit. Production, Public Release, and G5 remain `HOLD` throughout this control.
