# PSA lawful known-cert intake runbook v1

## Current truth

- Target: exactly 120 unique, provenance-bound lawful known-cert records.
- Current admissible progress: 0/120.
- The historical declared-only count of 2 is not admission progress because no source-record provenance is present.
- Enumeration, sequential lookup, guessed identifiers, synthetic empirical admission, raw cert persistence in Git, live acquisition, Production, Public, and G5 are prohibited by this lane.

## Private input contract

Keep the input under an explicit non-repository private root with directory mode `0700` and file mode `0600`. The file must be a regular, single-link, non-symlink JSON file. Do not paste its cert values into issues, pull requests, logs, command arguments, or repository files.

```json
{
  "schema_version": "1.0.0",
  "batch_type": "KIDULTS_PSA_LAWFUL_KNOWN_CERT_PRIVATE_BATCH",
  "authority_id": "PSA_SOURCE_AUTHORITY_<GOVERNED_ID>",
  "reference_key_id": "PSA_CERT_REFERENCE_KEY_V1",
  "source_class": "PROGRAM_OWNER_KNOWN_CERT_RECORD",
  "rights_basis_id": "PSA_BOUNDED_PRIVATE_EVALUATION_2026_08_24",
  "collector_id": "PROGRAM_OWNER",
  "admission_purpose": "PRIVATE_ER_EVALUATION_ONLY",
  "enumeration_method": "NONE",
  "non_enumeration_verified": true,
  "records": [
    {
      "cert_number": "<lawfully-known cert value>",
      "source_record_locator": "<immutable private source-record locator>",
      "source_observed_at": "<canonical UTC timestamp>"
    }
  ]
}
```

The cert-reference HMAC key must be a canonical base64 encoding of exactly 32 random bytes. Inject it from the approved runtime secret context as `PSA_CERT_REFERENCE_KEY_B64`; never inline it in shell history or save it with the batch.

In v1, each normalized private JSON row is the canonical semantic source record. Its `source_record_locator` is an opaque provenance label committed inside the HMAC; the intake does not dereference that label or verify bytes of a separate CSV, spreadsheet, PDF, or remote object. The source-record token binds the authority ID, cert HMAC, canonical observation time, and exact locator, and the bundle token binds the complete order-independent set of cert/source-record tokens. If the original external file bytes—not the normalized rows—are the legal provenance authority, stop before preauthorization and add direct private artifact-byte HMAC binding. A caller-supplied digest alone is insufficient.

## Two-PR authority separation

1. Run `PREAUTH_PREVIEW` against the private batch. This produces only a raw-free bundle token and authority proposal; it admits zero records.
2. Add the matching authority entry to `psa-source-authority-registry-v1.json` in an authority-only pull request. Bind both the immutable evidence locator as `rights_evidence_ref` and the SHA-256 content digest of the exact evidence bytes as `rights_evidence_digest`, together with the expected count, bundle token, collector, purpose, authorization window, and non-enumeration assertion. Obtain explicit Program Owner approval and land it on protected `main` before continuing.
3. Create the manifest-admission branch from that exact protected-main head. A registry change and manifest admission in the same change are prohibited.

The evidence digest prevents an authority entry from silently following mutable locator content, but it is only a technical integrity binding. A locator, digest, or self-authored registry entry does not independently prove lawfulness; explicit Program Owner approval on protected `main` remains mandatory for every actual authority.

Example preauthorization invocation, assuming the secret and private paths are already injected into the environment:

```bash
PSA_LAWFUL_INTAKE_ACTION=PREAUTH_PREVIEW \
node scripts/kidults/provider/intake-psa-lawful-known-cert-batch-v1.mjs
```

Required private environment variables are `PSA_PRIVATE_INTAKE_ROOT`, `PSA_PRIVATE_BATCH_RELATIVE_PATH`, and `PSA_CERT_REFERENCE_KEY_B64`. `PSA_INTAKE_AS_OF` is optional and must be a canonical timestamp when supplied.

## Read-only admission preview

On a branch based on the protected main containing the preapproved authority, compute the canonical registry digest and the current manifest byte digest locally. Do not substitute a digest from an unprotected registry change.

```bash
export PSA_PROTECTED_BASE_REGISTRY_DIGEST="$(node --input-type=module - <<'NODE'
import fs from 'node:fs';
import { digestPsaSourceAuthorityRegistry } from './scripts/kidults/provider/intake-psa-lawful-known-cert-batch-v1.mjs';
const registry = JSON.parse(fs.readFileSync('coordination/kidults/provider/psa-source-authority-registry-v1.json', 'utf8'));
process.stdout.write(digestPsaSourceAuthorityRegistry(registry));
NODE
)"
export PSA_EXPECTED_MANIFEST_DIGEST="sha256:$(sha256sum coordination/kidults/provider/psa-120-known-cert-manifest-v1.json | cut -d' ' -f1)"
PSA_LAWFUL_INTAKE_ACTION=ADMISSION_PREVIEW \
node scripts/kidults/provider/intake-psa-lawful-known-cert-batch-v1.mjs > /tmp/psa-lawful-intake-preview.json
```

The preview contains a raw-free candidate manifest and digest-only receipt. Review it before promotion. The intake rejects unknown fields, duplicate cert or source-record tokens, authority replay, expired or revoked authority, observation outside the authority window, stale protected-base digest, and a result above 120.

## Atomic manifest promotion

After review, run the same inputs with `PSA_LAWFUL_INTAKE_ACTION=ADMISSION_WRITE`. The write uses a lock, compares the exact pre-write manifest byte digest, writes a temporary file, fsyncs it, and atomically renames it. Commit only the resulting digest manifest and receipt-safe governance changes; never commit the private batch or HMAC key.

The manifest remains `WAITING_FOR_PROVENANCE_BOUND_SOURCE_COMPLETION` below 120. At exactly 120 it becomes `MANIFEST_READY_RUNTIME_GATES_PENDING`; this still does not authorize provider calls.

## Provider execution hold

Provider acquisition may start only after all of the following are independently verified:

- exactly 120 authority-bound manifest entries;
- authenticated manifest and runtime-gate verification receipts;
- a persistent private encrypted store outside the repository;
- an active retention scheduler and healthy deletion enforcement;
- a durable quota ledger shared by every eligible live runner;
- a verified kill switch, documented endpoint contract, exact field map, and bounded rights receipt.

The acquisition orchestrator enforces a maximum first wave of 90 and a second wave of at most 30 on the next UTC day, with quota reservation before every provider attempt and no retries. Authorization, rate-limit, schema, payload-binding, quota, private-store, retention, or runtime-health failure stops the wave for review.

No current repository evidence proves the shared live-runner quota mount or scheduled retention runtime. Those gates remain `HOLD`, and this runbook does not authorize a live provider call.
