# PSA 120 Admission Controls — KPMO closure note

This lane is restricted to the already-authorized bounded private internal evaluation scope.

Implemented controls on this branch:
- exact PSA field-map admission contract;
- AES-256-GCM PRIVATE_ONLY record boundary;
- maximum 30-day retention and deletion-receipt contract;
- lawful-known-cert-only manifest with duplicate/synthetic/guessed identifiers rejected;
- versioned HMAC reference tokens and governed source-authority registry binding;
- immutable `rights_evidence_digest` values bound into each canonical source-authority entry;
- durable private-root quota lease and an exact 90 + 30 two-wave acquisition orchestrator;
- fail-closed validator and CI workflow.

This work does not authorize live acquisition, enumeration, Production, Public release, Candidate creation, Track B, or G5. Provenance-bound admission is currently 0/120; the historical declared-only count of 2 is not admissible progress. A registry entry and its rights-evidence digest are technical bindings and do not independently prove lawfulness: every actual source authority still requires immutable rights evidence and explicit Program Owner approval on protected main before a separate manifest admission change. The private intake and two-PR promotion procedure is defined in `coordination/kidults/provider/psa-lawful-known-cert-intake-runbook-v1.md`.

The remaining empirical dependency is a lawful 120-known-cert source batch and governed live acquisition under the existing provider rights and quota. Live execution also remains on HOLD until a persistent governed runner proves a quota ledger shared by every eligible live runner and an active scheduled-retention runtime.
