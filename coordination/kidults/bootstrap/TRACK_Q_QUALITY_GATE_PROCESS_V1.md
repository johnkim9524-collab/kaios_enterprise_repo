# Track Q Customer Quality Gate — v1

**Owner:** KPMO  
**Independent QA role:** Track Q QA Agent (`track-q-qa-agent`)  
**Content and research interface:** REA Team  
**Status:** Draft proposal; operational only after role registration, runtime provisioning and verified bootstrap

## Purpose

Protect customer decision quality. Every customer-facing report, index, analysis, sample, visualization and product claim must be accurate, understandable, traceable, rights-aware and useful for a stated decision. The gate evaluates the exact version under review; it does not certify market truth beyond available evidence.

## Decision rights

| Owner | Accountable work | May decide | Must not |
|---|---|---|---|
| Producer / product owner | Source integrity, calculations, implementation, version binding and producer checks | Correct its artifact and submit a new immutable version | Approve its own independent QA finding |
| REA Team | Research method, interpretation, editorial clarity, audience fit and stated limitations | Record research/editorial findings and request correction | Waive missing evidence or rights; independently QA its own authored material |
| Track Q QA Agent | Independent source, rights, reproducibility, claims, usability and customer decision-quality review | Issue exact-version PASS or HOLD with evidence and exit criteria | Edit source claims to obtain PASS; authorize Production, Public or G5 |
| KPMO / QA Gate Committee chair | Integrate findings, preserve dissent, record gate state and owner | Record RELEASE-ELIGIBLE or HOLD when all required findings are present | Override a rights/evidence HOLD or imply committee review is final Owner approval |

Final release authority remains with the separately authorized release owner. A Track Q PASS means only that the reviewed artifact met the defined QA criteria at the bound version.

## Gate sequence

1. **Intake and freeze:** Name intended customer, decision task, artifact ID, exact version/SHA, source cutoff, methodology version and release scope. Missing bindings means HOLD.
2. **Producer check:** Validate calculations, source references, schema, rendering, accessibility basics and known limitations; attach immutable evidence and declare conflicts.
3. **REA review:** Check method fit, interpretation, editorial precision, audience assumptions, geographic/source coverage and limits. Findings are version-bound.
4. **Independent Track Q review:** Reproduce material calculations where possible; follow claims to source evidence; check rights, provenance, freshness, uncertainty, consistency, usability, accessibility and customer misinterpretation risk.
5. **Committee disposition:** KPMO records each role's finding and resolves workflow state. Any material unresolved rights, evidence, reproducibility or misleading-claim finding keeps the gate at HOLD.
6. **Release handoff:** Only a complete PASS package moves to the authorized release owner. QA does not publish, deploy or grant legal, commercial or Production authority.

## Customer-facing acceptance criteria

All critical criteria are binary gates; a high score in one area cannot compensate for failure in another.

- **Decision relevance:** The page or report names who it serves and what decision it supports; the evidence affects that decision.
- **Accuracy and calibration:** Facts, estimates and inferences are visibly distinguished; no claim exceeds its evidence or confidence.
- **Traceability:** Material claims link to source, date, method and version; reviewers can reproduce the result or see why they cannot.
- **Rights and provenance:** Use is within documented rights and provenance; unresolved legal scope is HOLD.
- **Clarity and comprehension:** A representative user can find the conclusion, supporting evidence, limitations and appropriate use without misleading navigation or jargon.
- **Uncertainty and limitations:** Missing, stale, partial and conflicting evidence remains visible; no unknown is treated as zero or certainty.
- **Comparability and fairness:** Units, periods, geographies and coverage limits are explicit; source or regional gaps are not hidden by a global average.
- **Accessibility and usability:** Content works on supported screen sizes, keyboard and assistive use; charts provide labels and non-color cues.
- **Customer safety and trust:** No implied guaranteed returns, false precision, undisclosed illustrative data or advice beyond the product's stated scope.

## Finding format

Each review record must include: agent ID; role/task/session IDs; artifact and exact SHA; intended audience and decision task; scope and exclusions; method and source references; criterion-level PASS/HOLD/NOT-APPLICABLE results; reproduced checks; severity; uncertainties; conflicts; remediation owner and testable exit criteria; reviewer timestamp; and receipt reference.

Severity handling:

- **Critical:** rights/provenance failure, fabricated or materially unsupported claim, non-reproducible decision-driving metric, version mismatch, or material customer deception risk. Gate = HOLD.
- **Major:** material ambiguity, missing limitation, coverage bias, inaccessible key information or reproducibility gap. Gate = HOLD until fixed or bounded by approved scope.
- **Minor:** non-material editorial or visual defect with no effect on interpretation. Record for correction; release eligibility depends on the applicable product standard.

## Customer validation and feedback loop

Before a public or paid release, test the actual decision task with people representative of the intended customer roles, regions and languages. Do not treat internal review or a single English-language walkthrough as global customer validation. The test plan must be written before testing and name the participant profile and selection limits, task, success definition, minimum threshold, sample size rationale and severity rules. Record the results and observed failures against the exact artifact version.

Each test must check whether participants can:
- identify the decision the artifact supports and the scope it covers;
- find the source behind each decision-critical claim;
- distinguish observed facts, estimates and interpretation;
- explain the main evidence limits and uncertainty;
- recognize illustrative material and avoid inferring unsupported current prices, liquidity or returns.

If representative customer testing has not occurred, mark customer validation NOT_TESTED; do not describe the product as customer-validated. A public or paid release remains HOLD until the predeclared critical comprehension and task-success thresholds pass. Internal or preview use must be labeled as unvalidated and must not imply customer outcomes.

After release, capture recurring customer questions, correction requests, misunderstanding reports and task-completion friction against the artifact version. For each release, report: decision-task completion rate (successful sessions divided by eligible sessions); median time to locate decision-critical evidence; limitation-comprehension rate against the predeclared questions; critical misunderstanding count and rate; customer-impacting corrections or withdrawals per released artifact; and open customer-impact defects. State numerator, denominator, observation window, participant/customer coverage and exclusions. Preserve anonymized test notes and release lineage under the applicable data policy.

Do not optimize for clicks or engagement when they conflict with decision quality. The producer and REA Team collect the evidence; Track Q independently checks the test design, result and version binding; KPMO owns the service thresholds and records gate disposition. Set thresholds before each study and report results without hiding failures. Feed validated findings into the next methodology and product revision while preserving prior versions.

## Operating status

The role, ID and process are proposed in Draft PR #2704. The repository currently lists no actual AI/model dispatch job. Until a protected persistent runtime is provisioned and completes exact-head acceptance with an independently verified and consumed bootstrap receipt, Track Q is not dispatchable and no release review may be attributed to the reserved identity.
