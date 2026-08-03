# A13-B24 Manual Dispatch Export & Operator Confirmation

## Objective
Generate provider-specific manual dispatch packets for the five remaining outreach candidates and require explicit operator confirmation before any contacted event is recorded.

## Scope
- provider-specific dispatch packet export
- shared commercial, technical and rights questionnaire
- operator review checklist
- explicit post-dispatch confirmation manifest
- generated contacted-event commands
- duplicate-dispatch protection
- mobile-safe staging status UI contract

## Safety gates
- staging only
- production untouched
- no automatic email or form submission
- no recipient address, personal contact detail or secret stored
- no candidate marked contacted before explicit operator confirmation
- production promotion remains blocked by default
