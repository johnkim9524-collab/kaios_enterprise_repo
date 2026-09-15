# KIDULTS Provider Operations Guide

The prepared cohort is PSA, eBay, Heritage, Goldin, Classic.com and Bring a Trailer. No credentials or live connections are stored in the repository.

## Detection
Validate provider capability, schema version, rights scope, credential availability and rate-limit state before each bounded run.

## Isolation
One provider owns one circuit, credential scope, rights receipt and reject queue. PSA grading evidence is never treated as a sold event.

## Recovery
Retry transport failures with bounded backoff; quarantine schema or rights failures; resume only from the last consumed receipt.

## Verification
Bind source fields to canonical fields, validate provenance, prove zero unknown fields, enforce purpose-specific rights and reconcile accepted/rejected counts.

## Communication
Internal reports identify provider, capability, field scope, rights expiry and exact receipt. No provider outreach, contract, spend or activation is implied.
