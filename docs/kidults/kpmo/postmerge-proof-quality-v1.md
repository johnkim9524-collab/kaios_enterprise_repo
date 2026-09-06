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

## Exact-SHA producer completion observer

The existing semantic sentinel previously had only scheduled and manual live
activation. Its PR job tested contracts; a completed Live Canonical workflow
was consumed by structural Continuous Assurance but did not directly start the
four-producer semantic observer.

The existing sentinel now additionally watches completed SHADOW, Coverage,
Reserve and Live Canonical producers. The cron schedule and manual recovery
remain. Failed/cancelled producers also trigger re-evaluation; their failure is
not hidden behind a success-only listener. GitHub's workflow-run chain-depth
limit still applies, so this is not a guarantee of delivery from arbitrary
upstream chains. The schedule is the fallback, not a proof of an execution.

Only the same repository, main branch and exact trusted checkout SHA are
accepted. A bounded regular JSON event file is read without following symlinks.
The named upstream native run is fetched before and after collection and its
ID, attempt, workflow name/path, event, source, terminal result and repository
IDs must remain equal. The trigger is a pointer, never a success receipt.
Existing latest-generation selection, complete pagination, archive validation,
producer-specific semantic content checks and no-authority flags remain.

A new 41-case suite includes the actual resolver with closed HTTP/Git transport:
valid triggers with absent producers remain HOLD; malformed/fork/stale/native
identity and readback drift produce durable RED without network writes. The
existing full semantic regression command remains in hosted CI.

## Evidence and limits

On the base main, the Owner Handoff packet `9981441149` records all six exact
merge-SHA push workflows consumed, without reusing the predecessor head.
Live Canonical packet `9981752045` binds generation
`kpmo-canonical-v3-629592718e48-34008107705-1` and the 25-board material registry.
The automatic Continuous Assurance packet `9981760650` has internal control
PASS but overall HOLD. These are historical, exact-generation observations,
not assurances about a later issue registry or a new candidate SHA.

Local tests use Node 22; hosted Node 24 validation is required for a new head.
A locally validated trigger is not natural main consumption. Full four-producer
semantic proof, the native invalid-authorization Atomic dispatch receipt,
lawful staging workload, managed PostgreSQL/PITR and operating readiness remain
separate exit criteria. No control test is an independent business sample.

## Reproduction

```sh
node --test tests/kidults/kpmo/cloudflare-consumed-workflow-v1.test.mjs
node --test tests/kidults/kpmo/sentinel-trigger-v1.test.mjs
node scripts/kidults/kpmo/validate-cloudflare-workers-shadow-v3-approval-ready-v1.mjs
node scripts/kidults/kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs --self-test
```

Documentation sources: GitHub Actions workflow syntax (on.push branch/tag
filters and jobs.if), and events that trigger workflows (workflow_run completion,
trusted default-branch execution and chain-depth limitations).
