# PSA manifest contract sync note

Protected main PR #1469 supersedes the earlier self-asserted lawful-source-ref manifest contract.

Canonical empirical admission now requires a provenance-bound `KIDULTS_PSA_KNOWN_CERT_SOURCE_RECEIPT` and exact cert-to-receipt binding. Required manifest entry fields are:

- `cert_reference_digest`
- `source_receipt_digest`
- `source_record_digest`
- `source_class`
- `rights_basis_id`
- `collector_id`
- `source_observed_at`
- `admission_purpose=PRIVATE_ER_EVALUATION_ONLY`
- `non_enumeration_verified=true`
- `enumeration_used=false`
- `raw_cert_value_in_repository=false`
- `empirical_admissible=true`

Declared or self-asserted cert references do not increment empirical progress. Synthetic/guessed/enumerated identifiers remain prohibited. Production/Public/G5 remain HOLD.
