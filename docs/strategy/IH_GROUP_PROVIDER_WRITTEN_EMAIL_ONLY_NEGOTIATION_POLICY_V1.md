# Intelligence Holdings Group Provider Written-Email-Only Negotiation Policy v1

**Status:** Mandatory strategy addendum / non-bypass operating rule  
**Effective date:** 2026-09-01  
**Revision:** 2026-09-09 — KPMO strategy/content review and Program Owner exact-content approval

**Applies to:** Intelligence Holdings, KIDULTS, Artfund, Capitaltimes, Muchmoney, Humanpool, Autobit, Kompare  
**Incorporated baseline:** `docs/strategy/IH_GROUP_GLOBAL_PROVIDER_STRATEGY_V6.md`

## 1. Executive rule

All external provider negotiations involving technical scope, data rights, schema, pricing, commercial terms, contracts, security, privacy, retention, deletion, attribution, service levels, or termination **must be conducted through written email only**.

This is not a preference for email before or after a call. Phone, voice, and video calls are not available negotiation channels for the Program Owner.

The governing reason is explicit:

> English is not the Program Owner's native language. Accurate understanding of technical, rights, commercial, and contractual terms requires written email and an auditable record.

The required communication manner is equally explicit:

> **“솔직하고 정중하게 양해를 구한다.”** Explain the circumstance honestly and respectfully, ask for the provider's understanding, and state that written email is required for accurate and auditable negotiation.

This is a professional accuracy and record-control measure, not an apology, a concession, or an invitation to move the discussion to a call.

## 2. Prohibited negotiation patterns

Agents and operators must not:

- offer, accept, schedule, or recommend a phone, voice, or video call;
- ask the Program Owner for call availability or meeting times;
- state that a call may occur after principal terms are aligned by email;
- describe a short call as useful, optional, efficient, or the next step;
- make a provider call a prerequisite for receiving a sample, schema, price, schedule, term sheet, redline, or rights determination;
- treat a verbal statement as evidence of a right, permission, price, commitment, waiver, or contractual term;
- report a provider-requested call to the Program Owner as work that the Program Owner must perform.

The following formulations are specifically disallowed in KPMO recommendations and provider-facing drafts:

- “before scheduling a call”;
- “after the principal terms are aligned, we can consider a call”;
- “a short call may be useful”;
- “please share your availability”;
- “we can discuss the remaining points by phone/video.”

## 3. Required provider response when a call is proposed

When a provider requests a call, the response must:

1. honestly and respectfully explain that English is not the Program Owner's native language and ask for the provider's understanding — **“솔직하고 정중하게 양해를 구한다”**;
2. politely decline the call;
3. explain that accuracy and an auditable record require written email;
4. identify the exact written materials required, such as a sample, schema, price table, Schedule, term sheet, contract redline, security response, or item-by-item rights determination;
5. preserve all legal, spend, credential, acquisition, Production, Public, and G5 gates.

Standard meaning:

> English is not my native language, and I would sincerely appreciate your understanding. To ensure that I understand the technical, rights, pricing, and contractual terms accurately and to preserve a reviewable record, I conduct these negotiations by written email only. Please provide the relevant information and proposed terms in writing. Thank you for your understanding.

The explanation must be candid, respectful, and direct. It must not conceal the language context, over-apologize, weaken the written-email-only requirement, or imply that a call may become available later.

## 4. Material terms that must exist in writing

At minimum, the written record must cover all applicable items below before a provider can advance:

- provider product, bundle, endpoint, and delivery method;
- schema fields, identifiers, nullability, field semantics, timestamps, corrections, and provenance;
- exact permitted uses by purpose and environment;
- private storage, normalization, entity resolution, human QA, model/analytics use, and derived-output rights;
- raw-data retention, deletion, deletion evidence, and post-termination duties;
- pre-existing and independently developed Intelligence Holdings/KIDULTS intellectual property;
- public display, attribution, raw redistribution, API/SaaS, territory, affiliate, contractor, and language restrictions;
- price, volume bands, minimum commitment, prepayment, taxes, credits, and overage rules;
- term, renewal, cancellation, notice, cure, termination, export, transition, assignment, novation, and change of control;
- quota, SLA, support, incident handling, schema-change notice, and correction policy;
- security, privacy, audit, and data-processing obligations.

A term that exists only in a call, meeting, or verbal summary is `NON_ADMISSIBLE` and cannot authorize spend, contract execution, credential use, acquisition, product admission, Production, Public, or G5.

## 5. Provider refusal rule

If a provider refuses to supply material terms in writing, requires a call as a prerequisite, or will not provide a written rights and commercial record, the provider must be classified as:

```text
HOLD_OR_REPLACE
```

The response is not to pressure the Program Owner into a call. TRACK Z and KPMO must activate the documented replacement path, compare lawful alternatives, and preserve zero authority for spend, contract, credential, acquisition, and release.

## 6. CLASSIC.COM application

For the current CLASSIC.COM negotiation:

- requested bundles are `Taxonomy` and `Sales History`;
- `Programmatic Widget Generation` is not required for the current private intelligence use case;
- the provider's schema-matched sample may be accepted as `CONTROL_ONLY / SCHEMA_PREVIEW` evidence;
- sample data does not constitute live Canary, reliability evidence, rights clearance, or Product connection;
- KPMO may request the sample, pricing, monthly fee, minimum term, 30-day cancellation terms, quota, historical depth, correction process, and applicable Master Agreement/Schedule terms by email;
- KPMO must not accept or recommend a call as a prerequisite or next step;
- refusal to continue material negotiations in writing results in `HOLD_OR_REPLACE`.

## 7. Agent and content enforcement

Before any provider outbound message is eligible, the pre-send gate must verify:

```text
written_email_only_channel_confirmed = true
honest_respectful_understanding_request_present_when_channel_reason_is_explained = true
outbound_call_offer_absent = true
provider_call_request_declined_in_writing_if_present = true
all_material_terms_requested_in_writing = true
program_owner_not_assigned_to_phone_voice_or_video_call = true
```

Any false value yields `DO_NOT_SEND`.

### 7.1 Mandatory KPMO review and Program Owner approval

Written email is the only negotiation channel, but the use of email alone does not make an outbound message eligible. Before any external provider email is drafted in Gmail or sent, the following additional evidence must exist:

```text
current_provider_evidence_refreshed = true
detailed_response_strategy_reviewed_by_kpmo = true
exact_email_package_reviewed_by_kpmo = true
kpmo_verdict = APPROVED_FOR_PROGRAM_OWNER_REVIEW
program_owner_report_contains_strategy_and_exact_email_package = true
exact_program_owner_send_approval_recorded = true
approval_bound_to_sender_recipients_thread_subject_body_attachments_links_and_digest = true
post_approval_change_absent = true
```

The detailed strategy must cover the objective, response necessity, verified facts and conflicts, unresolved questions, requested evidence, concessions and prohibited concessions, all Track Z money-to-usable-data gates, provider independence, alternative path, deadline, escalation/stop conditions, identity and contracting boundaries, and the effect of sending or not sending.

The exact email package consists of sender identity, all recipients including CC/BCC, thread or reply target, subject, complete body, attachments, links and a deterministic content digest. The digest must be `sha256:<lowercase-hex>` over RFC 8785 canonical JSON, with exact UTF-8 values, CRLF normalized to LF, ordered recipient and link arrays, and attachment filename, media type, byte length and SHA-256 digest. KPMO must review the complete package, not an abstract intent or partial excerpt. If the author is also acting as KPMO, a distinct second-pass adversarial review record is mandatory.

KPMO review does not authorize sending. The Program Owner must receive the detailed strategy, KPMO verdict, risks and exact package and must explicitly approve that exact package. Any later change to sender, recipients, thread, subject, body, attachments or links invalidates approval. The changed package must return to KPMO and the Program Owner.

Missing review, incomplete reporting, generalized approval, stale evidence, or post-approval mutation yields `DO_NOT_DRAFT_OR_SEND`. No Gmail draft or outbound message may be created automatically while either approval is missing.

All KPMO reports must distinguish:

```text
Provider requested a call
≠ Program Owner action required
≠ Negotiation accepted
≠ Material terms supplied
```

The next action must instead identify the precise written document or answer required from the provider.

## 8. Non-bypass boundaries

This policy creates no new authority for:

- provider outreach without explicit communication authority;
- spend or contract acceptance;
- credential issuance or activation;
- live acquisition;
- Public or Production use;
- G5 promotion.

Existing approval gates remain unchanged.

## 9. Supersession

This addendum supersedes any repository text, agent recommendation, email template, report, or draft that describes written email as merely preferred, suggests a call before or after written alignment, assigns call attendance to the Program Owner, or omits the required honest and respectful request for the provider's understanding when the channel reason is explained.

Where this addendum conflicts with earlier provider communication language, this addendum controls.
