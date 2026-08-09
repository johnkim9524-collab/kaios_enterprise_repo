# KIDULTS Secrets Inventory & Rotation Baseline

Status: control baseline. Secret values are never recorded here.

## Inventory rule

Every production or external-integration credential must have an inventory record containing: logical name, purpose, owner, environment, provider/system, privilege scope, creation date, last rotation, next review/rotation, revocation procedure, dependent workflows/services and blast radius.

## Currently observed repository secret references

| Logical name | Observed purpose | Value | Verification state |
|---|---|---|---|
| `KAIOS_PRODUCTION_ADMIN_TOKEN` | Explicitly authorized production smoke certification in `.github/workflows/production-release.yml` | Never stored in source | Reference observed; actual secret existence/value/age not inspected |

This list is intentionally limited to secret references observed in repository code during the hardening pass. It is not a claim that no additional repository/environment/provider secrets exist.

## Rotation policy

- Rotate immediately on suspected disclosure, privilege change, owner separation, provider compromise, or unauthorized access.
- Production/admin credentials require a documented periodic review and rotation interval appropriate to provider capability and risk.
- Prefer short-lived/OIDC credentials over long-lived static tokens where supported.
- Rotation must include revocation of the prior credential and a bounded validation of dependent workflows.
- Failed rotation must fail closed rather than silently restoring a stale or over-privileged credential.

## Access policy

- Least privilege and environment separation are mandatory.
- Credentials must not be printed in logs, fixtures, screenshots, generated reports, issues or source files.
- Production credentials may be consumed only by explicitly authorized workflows/actions.
- Provider-contract, billing and customer mutation credentials remain authority-gated.

## Evidence still required

Repository/environment secret inventory from the control plane, actual owners, privilege scopes, ages, rotation timestamps and recovery/revocation drill evidence. Those facts are operationally external to source control and are not fabricated by this baseline.
