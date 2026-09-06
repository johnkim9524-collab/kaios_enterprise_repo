# Post-merge proof quality: inactive lanes and completion observers

## Exact scope

Base main: `629592718e487665e6668ae37fe37c1d99281b4d` (PR #2024).
This follow-up is a separate review branch. It does not move protected main,
rebind an approval, reactivate exhausted lanes, or authorize deployment.
Production/Public/G5 remain HOLD.

## Exhausted Cloudflare workflows

Four historical deployment/credential workflows used `on: []`. The current
merge produced zero-job failures, including v3 run `34007344988` and credential
run `34007344286`. No job/provider invocation is inferred from those entries.
The native error annotation was not retrieved; the empty-event configuration
is independently visible in the exact source and is outside GitHub's documented
nonempty event syntax.

The replacement excludes **all** branches and tags from push and additionally
requires a literal `if: ${{ false }}` at the only job. It has no manual,
scheduled, upstream-workflow, or repository-dispatch trigger. Historical receipt
payloads, consumed authorizations, no-replay flags and pinned upload steps are
preserved as inert source, not as newly executed evidence. No credential,
environment, provider command, or permission is introduced.

A shared closed-subset validator rejects missing exclusions, manual triggers,
extra YAML keys/documents/jobs, an absent or nonliteral false gate, elevated
permissions and provider execution surfaces. It is not a general YAML parser.
The four existing control validators keep their other checks. The existing v3
validation workflow runs the new 31-case negative/positive suite.

## Exact-SHA producer completion observation without extra fanout

The first PR #2042 candidate `636878f1...` added a separate workflow-run
listener to the strict sentinel. Its native P0 run `34010460178`, job
`101425257276`, correctly rejected 17 consumers against the unchanged maximum
of 16. That candidate was not landed, and the failure is not reclassified.

The corrected route uses the four producer edges already watched by the
terminal Continuous Assurance workflow. Its existing classifier, audit and
trigger definitions are preserved. One independent, bounded read-only job
collects the four-producer content classification when those producers finish.
It is deliberately named **Record core producer content classification (not
health authorization)**. No additional workflow-run consumer, graph edge,
dispatch credential, or limit increase is needed. The resulting repository
metrics are 16 consumers, 38 edges (19 execution + 19 observer), depth 7 and
zero cycles; the limits themselves are not modified.

The separate strict sentinel retains its existing schedule and manual health
gate; it does not acquire a new workflow-run trigger. A classification artifact
is not that gate. The observer records healthy, blocked or failed state exactly
as returned by the resolver. A successful observation-integrity step means
only the exact receipt was retained and its digest, identity, state aggregation
and no-authority boundaries were checked. It never converts producer HOLD/FAIL
to health PASS. The dedicated sentinel still fails unless all four producers'
actual content has been validated. This separation also preserves the role of
Continuous Assurance in the protected-main structural landing suite.

Failed/cancelled producers also cause collection; the new job is not filtered
only to successful producers. Only the canonical repository, main and current
checkout SHA are accepted. A bounded regular JSON event file is read without
following symlinks. The upstream native run is fetched before and after
collection and its ID, attempt, name/path, event, source, result and repository
IDs must remain equal. The trigger is a pointer, never a success receipt.
Existing latest-generation selection, complete pagination, archive validation,
producer-content checks and release boundaries remain unchanged.

GitHub's workflow-run chain-depth limit still applies. This reuses existing
terminal-observer edges rather than adding a new chained workflow; it does not
guarantee arbitrary-depth delivery. The existing cron is retained as fallback.

The 41-case trigger suite includes the actual resolver with closed HTTP/Git
transport. The additional 28-case classification suite covers failed/HOLD
preservation, copied or altered receipts, actual CLI output, falsely claimed PASS, unchanged
workflow fanout and the separate strict gate. The hosted semantic command
still executes all existing 152 tests as well; it is not reduced to new tests.

## Evidence and limits

On the base main, the Owner Handoff packet `9981441149` records all six exact
merge-SHA push workflows consumed, without reusing the predecessor head.
Live Canonical packet `9981752045` binds generation
`kpmo-canonical-v3-629592718e48-34008107705-1` and the 25-board material registry.
The automatic Continuous Assurance packet `9981760650` has internal control
PASS but overall HOLD. These are historical, exact-generation observations,
not assurances about a later issue registry or a new candidate SHA.

Local tests use Node 22; hosted Node 24 validation is required for a new head.
The initial head's passing checks cannot be reused as this correction's checks.
A locally validated trigger is not natural main consumption. Full four-producer
semantic proof, the native invalid-authorization Atomic dispatch receipt,
lawful staging workload, managed PostgreSQL/PITR and operating readiness remain
separate exit criteria. No control test is an independent business sample.

## Reproduction

```sh
node --test tests/kidults/kpmo/cloudflare-consumed-workflow-v1.test.mjs
node --test tests/kidults/kpmo/sentinel-trigger-v1.test.mjs tests/kidults/kpmo/sentinel-observation-v1.test.mjs
node scripts/kidults/kpmo/run-p0-control-plane-closure-suite-v1.mjs
node scripts/kidults/kpmo/validate-cloudflare-workers-shadow-v3-approval-ready-v1.mjs
node scripts/kidults/kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs --self-test
```

Documentation sources: GitHub Actions workflow syntax (on.push branch/tag
filters and jobs.if), and events that trigger workflows (workflow_run completion,
trusted default-branch execution and chain-depth limitations).
