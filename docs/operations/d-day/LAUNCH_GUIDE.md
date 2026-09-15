# KIDULTS Provider Launch Guide

Launch means bounded provider qualification, not Production, Public or G5 release.

## Detection
Confirm exact protected-main SHA, clean checkout, current canonical issue truth and required exact-head checks.

## Isolation
Create a provider-specific private lane with no public projection, no shared credential and no cross-provider failure propagation.

## Recovery
On any failure, revoke the lane, rotate only the affected credential through the secret manager, and restore the last verified configuration.

## Verification
Require rights receipt, schema digest, capability match, one control canary, replay and failure tests, zero public records and KPMO qualification evidence.

## Communication
Record provider, scope, fields, purpose, expiry, run ID and activation owner internally. External communication remains separately authorized.
