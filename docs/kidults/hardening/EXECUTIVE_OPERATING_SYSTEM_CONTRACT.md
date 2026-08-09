# KIDULTS Executive Operating System Contract

Status: product/operating baseline aligned with A28–A31 Control Tower evidence. Live business and customer metrics require authoritative data connections.

## Executive view

The primary view should expose only decision-relevant state:

- platform/service health and SLO/error-budget state;
- revenue/value signals and product usage where authoritative;
- operating/provider/compute cost and budget pressure;
- data freshness, provenance and quality status;
- active incidents, recovery and rollback state;
- provider health, dependency and rights risk;
- governance/security/commercial exceptions;
- business impact and required decision.

Developer diagnostics remain available through evidence links but are not the primary executive surface.

## Exception-first queue

Normal healthy operation should not generate executive work. The queue contains only exceptions requiring bounded human authority: legal, financial, strategic, security, provider-contract, irreversible production, material customer or commercial decisions.

Each exception record requires severity, scope, evidence references, business impact, recommended action, alternatives, deadline, authority required and current recovery/fail-closed state.

## Evidence-linked explanation

Every material recommendation or decision must link to source/evidence IDs, policy/methodology version, freshness, confidence/quality state and the reason a threshold or governance rule was triggered.

## Audit timeline

Maintain detect → classify → contain → decide → act → verify → recover/rollback → close events with correlation/run IDs. The timeline must make repeated incidents, policy decisions and unresolved risks visible.

## Business-impact attachment

Operational events should carry measurable impact where available: affected products/entities/customers, freshness delay, lost/deferred intelligence outputs, cost increase, revenue/value exposure and decision delay.

## Fail-closed rule

Missing authoritative business data is displayed as unknown/unavailable, never synthesized into revenue, customer, provider-rights or commercial evidence.
