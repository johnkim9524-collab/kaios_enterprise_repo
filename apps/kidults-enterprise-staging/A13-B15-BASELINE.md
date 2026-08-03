# A13-B15 External Source Certification & Production Gate

## Objective
Complete the secure onboarding and certification layer required to replace illustrative source contracts with approved external providers while keeping production promotion blocked until all legal, operational and technical gates pass.

## Integrated Scope
- provider connector interface
- secret and credential contract
- source rights registry
- provider health probes
- staging and production environment separation
- scheduled pipeline contract
- failure simulation
- machine-readable certification report
- production promotion gate

## Safety
- Production remains untouched.
- No secret value is committed to the repository.
- No provider is enabled without explicit rights, provenance, freshness and credential metadata.
- Staging may use contract-mode providers.
- Production promotion remains blocked by default.
- Illustrative fallback remains available until certification passes.

## Architecture
- provider configuration is data-driven
- credentials are referenced by environment variable name only
- connector contracts use stable provider and source-role identifiers
- rights and provenance are evaluated independently from endpoint health
- certification output is deterministic and machine-readable
- mobile validation remains required at 320px, 360px, 390px and 430px

## Completion Gates
- three required source roles registered
- at least two independent external provider families certified
- credentials present in the target environment
- rights status approved for production use
- health probes pass
- scheduled pipeline contract enabled
- failure simulation passes
- production readiness explicitly authorized by a separate release decision
