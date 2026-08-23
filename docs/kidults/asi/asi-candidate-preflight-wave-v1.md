# KIDULTS ASI Candidate Preflight Wave v1

**Owner:** KPMO  
**Priority:** P1A  
**Direction:** Autonomous → Global → Irreplaceable Value → Transparent

## Purpose

This wave continuously consumes the source candidates produced by P0 Mission Consumption and performs bounded host-level preflight before any purpose-specific admission decision.

```text
Source Candidate Increment
        ↓
Unique canonical host selection
        ↓
HEAD reachability and redirect check
        ↓
Bounded origin-root metadata GET
        ↓
Bounded robots.txt GET
        ↓
Identity / Technical / Robots / Semantic / Rights-Unknown classification
        ↓
Candidate Admission Readiness Ledger
```

## P1A scope

The network execution unit is the **Unique canonical host**. Up to 96 previously unprocessed hosts are selected each cycle. A preflight result is then assigned to every candidate attached to that host.

Each cycle restores the previous cumulative ledger and skips hosts already processed. New P0 candidates automatically enter the next cycle.

## Bounded requests

The runner performs only:

- `HEAD` against the representative candidate URL;
- bounded `GET` against the origin root;
- bounded `GET` against `robots.txt`.

Each GET is limited to **64 KiB**. The runner does not deep-crawl the site, follow discovered links, or collect market records.

## Preflight dimensions

Every host is evaluated for:

- canonical and final host identity;
- redirect behavior;
- TLS and HTTP reachability;
- content type;
- robots disclosure;
- root title and meta description;
- terms, privacy, legal, license, API, and market-semantic link discovery;
- mission-specific transaction or liquidity terminology;
- rights uncertainty;
- factual-origin uncertainty.

## Rights interpretation

The following rules are absolute:

```text
Preflight ≠ Admission
Reachable ≠ Lawful to collect
Robots allow ≠ License
Terms link ≠ Rights pass
Official website ≠ Transaction source
Article page ≠ Sold record
Semantic signal ≠ Evidence
Host identity ≠ Factual-origin proof
```

A `robots.txt` disallow-all rule or an explicit 401/403 access rejection moves the host to rejection for automated preflight and collection. An allow state only means the robots rule did not prohibit the bounded request; it never creates a license.

Terms and legal links are discovered but never followed by this wave. Their existence moves the candidate to explicit purpose-rights review.

## Output states

Host preflight states:

- `PREFLIGHT_COMPLETE_RIGHTS_REVIEW_REQUIRED`
- `PREFLIGHT_SEMANTIC_HOLD`
- `PREFLIGHT_TECHNICAL_HOLD`
- `PREFLIGHT_REJECT_ROBOTS_OR_ACCESS`

Candidates not reached because of the cycle limit remain:

- `PREFLIGHT_NOT_EXECUTED_CYCLE_LIMIT`

Admission-readiness states:

- `NOT_READY_RIGHTS_UNKNOWN`
- `NOT_READY_SEMANTIC_INSUFFICIENT`
- `NOT_READY_TECHNICAL_FAILURE`
- `REJECTED_AUTOMATION_OR_ACCESS`
- `WAITING_FOR_HOST_PREFLIGHT`

No candidate is automatically admitted.

## Continuous execution

```text
Successful P0 Mission Consumption run
or relevant main push
or hourly schedule at :37
        ↓
Restore latest P0 candidate artifact
        ↓
Restore previous P1 cumulative ledger
        ↓
Select up to 96 new canonical hosts
        ↓
Execute bounded live preflight
        ↓
Assign host result to every candidate
        ↓
Validate truth boundaries and mutation rejection
        ↓
Emit KPMO receipt and rolling artifact
```

Manual dispatch remains only for recovery or explicit replay.
