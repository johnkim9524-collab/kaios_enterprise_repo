# Sprint 19-A4 — Kidults Production Promotion Evidence Sealing

> **Current gate notice:** The former score-derived authorization described by
> this historical sprint is superseded. Technical readiness never self-authorizes
> Production; sealing now requires an exact-evidence-bound Ed25519 Program Owner receipt.

## Objective

Seal the verified Kidults Production readiness evidence after a 100/100 GO decision, preserve Artfund's production block, and create an immutable authorization package before any production deployment is executed.

## Current safe state

- Kidults decision: `hold` until current empirical evidence is supplied
- Technical readiness does not authorize Production
- Explicit Program Owner release receipt: required
- Artfund production promotion authorized: `false`
- Production deployment executed by this sprint: `false`

## Safety boundary

This sprint does not modify the Kidults production runtime, containers, database, Caddy configuration, scheduler, or publication flags. It only validates and archives evidence already produced by the approved production audit.

## Required evidence

1. `production-audit.json`
2. `production-rollback-rehearsal.json`
3. `production-mobile-320.json`
4. `production-governance-trust.json`
5. `production-observability.json`
6. `production-incident-response.json`
7. `staging-production-delta.json`
8. `production-readiness-evidence-v1.json`
9. `kidults-production-readiness.json`
10. `program-owner-production-release-receipt-v1.json`
11. every exact `support/...` member declared by
    `production-readiness-evidence-v1.json.support_evidence_bindings`

The Program Owner public key and its independently provisioned fingerprint are
read only from these fixed, root-owned trust paths; neither path is caller-overridable:

- `/etc/kaios/kidults-production-release/program-owner-ed25519-public.pem`
- `/etc/kaios/kidults-production-release/program-owner-ed25519-key-id`

GitHub certification additionally accepts evidence only from a successful
`workflow_dispatch` run of the exact producer path
`.github/workflows/kidults-production-release-evidence-v1.yml` at the current
protected-main SHA. It downloads the exact artifact ID through the Actions API,
compares the downloaded ZIP bytes to the API `sha256` digest, and safely extracts
only regular members. That producer workflow is not provided by this repository
revision, so GitHub certification intentionally remains fail-closed `HOLD` until
the separately governed producer is landed.

Release dashboard state for this revision is therefore explicit:
`evidence producer = NOT_IMPLEMENTED_PENDING_SEPARATE_GOVERNED_PRODUCER`,
`certification = HOLD`, and `Production authority = HARD_DISABLED`. Internal
validators cannot convert that missing producer execution into release evidence.

The `producer_id` inside an auxiliary or support receipt is schema-routing
metadata, not release authority. Authority requires the exact protected producer
workflow/run/artifact ZIP bytes, every raw evidence-member digest, the Program
Owner signature, and the independent protected-executor consumption chain.

## Server execution

```bash
cd /opt/intelligence-holdings/staging/kaios-enterprise

git fetch origin main
git switch main
git reset --hard origin/main

chmod +x scripts/production/seal-kidults-production-evidence.sh

EVIDENCE_DIR="$PWD/artifacts/production-audit" \
bash scripts/production/seal-kidults-production-evidence.sh
```

The archive root is fixed at
`/mnt/ih_prod_01/backups/production-certification`; Production callers cannot
redirect it. The directory must already exist with a root-owned,
group/world-non-writable ancestor chain. The sealer holds and path-binds the
archive and evidence-directory FDs. It captures the technical evidence first,
derives the support-member closure only from those captured bytes, and captures
each member through an `O_NOFOLLOW`, single-link regular-file FD. Those exact raw
bytes are materialized in a random exclusive mode-`0700` snapshot directory
under the held archive root. The Node release gate reads that snapshot through
its inherited directory FD, and the tar archive is built from the same captured
bytes after every snapshot member is revalidated byte-for-byte.

The canonical policy and the fixed Program Owner public key and key-id are also
held through `O_NOFOLLOW` FDs. Their path identities and bytes are revalidated
before and after the gate and throughout publication. The sealer stages and
fsyncs the archive, checksum, and manifest as exclusive mode-`0600`, single-link
regular files, revalidates the archive-root path against its held FD before each
publish, and publishes with `RENAME_NOREPLACE`. The manifest is published last
as the commit marker, followed by the final root-directory fsync and identity
revalidation. Any existing output, random snapshot left by a crash, or other
interrupted hidden stage is `HOLD`; the script never truncates or follows it.

Dynamic seal tests may use only the explicit
`ENABLED_ISOLATED_SAFE_TEST_ONLY` mode with a unique, current-UID-owned,
mode-`0700` private anchor whose direct `archive` and `trust` children are also
mode `0700`. That isolated mode has no Production authority. Production rejects
the test anchor, node, failpoint, mutation hook, and every archive output
redirection environment variable.

## Expected output

- `kidults-production-evidence-<UTC timestamp>.tar.gz`
- matching `.sha256`
- matching `.manifest.json`
- manifest status: `sealed_release_candidate`
- decision: `ready_for_program_owner_release`
- technical readiness verified: `true`
- explicit Program Owner release verified: `true`
- protected executor consumption verified: `false`
- Artfund authorization: `false`
- production change executed: `false`

## Verification

```bash
LATEST_ARCHIVE="$(find /mnt/ih_prod_01/backups/production-certification -type f -name 'kidults-production-evidence-*.tar.gz' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"

sha256sum -c "${LATEST_ARCHIVE}.sha256"
python3 -m json.tool "${LATEST_ARCHIVE}.manifest.json"
tar -tzf "${LATEST_ARCHIVE}"
```

## Protected executor boundary

A sealed candidate does not authorize certification or Production. A protected
executor outside the repository must atomically consume the owner release nonce
exactly once, bind the exact archive and GitHub artifact/run context, and issue a
signed consumption attestation. Read-only certification emits
`CERTIFIED_UNCONSUMED` and does not consume that nonce. A Production promotion
also requires the external CAS nonce-store receipt whose raw digest is signed by
the executor. The CAS receipt is executor evidence, not an independent authority;
the root-owned, `O_NOFOLLOW`, atomically created and fsynced host marker is the
durable local replay guard. The seal script never creates either protected
executor artifact.
The deployment sprint must separately create and bind a pre-deployment snapshot,
execute a controlled runtime replacement, run authenticated and unauthenticated
smoke tests, verify rollback readiness, and record post-deployment evidence.
