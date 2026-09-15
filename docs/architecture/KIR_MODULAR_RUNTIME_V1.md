# KIR Modular Runtime v1

## Decision

KIR remains a modular monolith with one stable public entrypoint:
`scripts/kidults/runtime/kir-runtime-kernel-v1.mjs`.

Callers may use only that entrypoint. Runtime logic is split into private modules with an explicit,
acyclic dependency graph. A machine-readable policy and negative tests reject undeclared coupling,
private-module bypasses, CLI/process side effects inside domain modules, and unbounded module growth.

## Module boundaries

| Module | Responsibility | Allowed internal dependencies |
| --- | --- | --- |
| `constants` | Immutable paths, states, DAG and pure assertions | none |
| `snapshot` | Read and digest-bind the evaluated contract snapshot | `constants` |
| `graph` | Registry topology, evidence and readiness bindings | `constants` |
| `state-machine` | Current-SOLD, ledger, assessment and release transitions | `constants`, `graph` |
| `evaluator` | Contract validation, execution identity and terminal receipt | all modules through declared edges |

The public entrypoint owns CLI I/O and backward-compatible exports. Private modules contain no CLI,
provider call, database write, deployment, or release authority.

## Integration rule

New capability is integrated through a contract and an adapter at a declared boundary. It must not
reach into another private module, add a reverse dependency, or append unrelated orchestration to the
public entrypoint. Cross-cutting behavior requires a separate module with one responsibility and an
explicit dependency-policy update reviewed with negative tests.

## Optimization effect

- Change impact is localized to one responsibility.
- Existing callers and workflows keep the same public API and CLI.
- The runtime loads and hashes each truth file once per evaluation, as before.
- Five-gate validation remains serial to avoid fan-out amplification.
- Complexity limits are enforced before runtime activation or release can be considered.

## Authority boundary

This refactor grants no Provider, credential, database, deployment, Production, Public, or G5
authority. All remain `HOLD`; Track Z continues to own Provider work independently.
