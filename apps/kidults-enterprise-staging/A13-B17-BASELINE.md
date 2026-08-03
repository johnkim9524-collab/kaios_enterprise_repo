# A13-B17 Secure Provider Injection & Release Handoff

## Objective
Complete the secure handoff layer required to inject approved external providers into the Kidults staging intelligence pipeline without exposing credentials or weakening release controls.

## Integrated Scope
- provider endpoint and health-probe injection contract
- environment-variable credential presence validation
- source-rights approval template
- provider onboarding command
- mock provider harness
- release command-center report
- staging-to-production promotion checklist
- rollback and rejection paths

## Safety
- Production remains untouched.
- No secret value is committed, printed or rendered.
- Credentials are referenced by environment-variable name only.
- Provider endpoint, health, rights and credential gates are evaluated independently.
- Illustrative fallback remains available.
- Production promotion remains blocked by default.

## Completion Gates
- three provider roles remain registered
- secure injection command validates endpoints without persisting secrets
- mock provider harness verifies connector shape
- rights template exists for every provider role
- release command-center output is machine-readable
- production promotion stays false until explicit authorization
- mobile gates remain 320px, 360px, 390px and 430px
