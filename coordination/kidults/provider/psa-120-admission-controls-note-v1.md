# PSA 120 Admission Controls — KPMO closure note

This lane is restricted to the already-authorized bounded private internal evaluation scope.

Implemented controls on this branch:
- exact PSA field-map admission contract;
- AES-256-GCM PRIVATE_ONLY record boundary;
- maximum 30-day retention and deletion-receipt contract;
- lawful-known-cert-only manifest with duplicate/synthetic/guessed identifiers rejected;
- provider quota plan requiring at least two execution waves;
- fail-closed validator and CI workflow.

This work does not authorize live acquisition, enumeration, Production, Public release, Candidate creation, Track B, or G5. The remaining empirical dependency is a lawful 120-known-cert manifest and governed live acquisition under the existing provider rights and quota.
