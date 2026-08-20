# Owned Intelligence Claim Handoff Gate v1

This gate is additive to Candidate/Evidence Handoff R2.

It does not classify raw external facts as KIDULTS-derived intelligence.

KIDULTS-owned derived claims must carry a claim-content-bound hardening binding containing the exact claim ID, a SHA-256 digest of the claim payload excluding the binding, and a canonical registered hardening proof. Any missing, mismatched, unregistered, stale-version, failed-check, or tampered proof blocks the derived claim from handoff eligibility.

This gate does not create empirical evidence, Track B PASS, publication authorization, or Production authorization.
