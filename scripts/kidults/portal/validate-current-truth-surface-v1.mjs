import fs from "node:fs";

const summary = JSON.parse(fs.readFileSync("apps/kidults-enterprise-staging/public/portal/data/portal-summary.json", "utf8"));
const registry = JSON.parse(fs.readFileSync("apps/kidults-enterprise-staging/public/portal/data/registry-view.json", "utf8"));
const workspacePage = fs.readFileSync("apps/kidults-enterprise-staging/public/portal/workspace-page.js", "utf8");
const renderers = fs.readFileSync("apps/kidults-enterprise-staging/public/portal/components/renderers.js", "utf8");
const errors = [];

const requireTrue = (condition, message) => { if (!condition) errors.push(message); };

requireTrue(workspacePage.includes("registrySnapshotContext(data.registry)"), "Workspace snapshot context must source Registry truth.");
requireTrue(workspacePage.includes("registryEvidenceContext(data.registry)"), "Workspace Evidence context must source Registry truth.");
requireTrue(!workspacePage.includes("data.summary?.operations"), "Workspace status must never source Evidence from portal summary preview metrics.");
requireTrue(workspacePage.includes("candidateSnapshotId: data.registry?.snapshot?.candidate_id ?? null"), "Workspace runtime must expose candidate snapshot id from Registry.");
requireTrue(workspacePage.includes("evidencePackageId: data.registry?.evidence?.current_package_id ?? null"), "Workspace runtime must expose Evidence Package id from Registry.");

const noCandidate = registry.snapshot?.candidate_id == null;
const noEvidence = registry.evidence?.current_package_id == null;
if (noCandidate || noEvidence) {
  requireTrue(summary.snapshot_id === null, "Portal summary snapshot_id must be null without a current candidate.");
  requireTrue(summary.source_mode === "REGISTRY_FAIL_CLOSED", "Portal summary must declare REGISTRY_FAIL_CLOSED.");
  requireTrue(summary.truth_state?.candidate === "NOT_AVAILABLE", "Portal summary candidate must be NOT_AVAILABLE.");
  requireTrue(summary.truth_state?.evidence_package === "NOT_AVAILABLE", "Portal summary Evidence Package must be NOT_AVAILABLE.");
  for (const metric of summary.metrics ?? []) {
    requireTrue(metric.value === "—", `Metric ${metric.id} must be unavailable without a current candidate.`);
    requireTrue(metric.state === "NOT VERIFIED", `Metric ${metric.id} must be NOT VERIFIED.`);
  }
  const evidenceObjects = (summary.operations ?? []).find(item => item.label === "EVIDENCE OBJECTS");
  const confidence = (summary.operations ?? []).find(item => item.label === "MODEL CONFIDENCE");
  requireTrue(evidenceObjects?.value === "—" && evidenceObjects?.state === "NOT AVAILABLE", "Evidence object count must fail closed.");
  requireTrue(confidence?.value === "—" && confidence?.state === "NOT AVAILABLE", "Model confidence must fail closed.");
  requireTrue(summary.coverage?.countries === null && summary.coverage?.markets === null && summary.coverage?.languages === null, "Coverage must be null without candidate evidence.");
  requireTrue(Array.isArray(summary.composition) && summary.composition.length === 0, "Source composition must remain empty while unverified.");
}

const stale = JSON.stringify(summary);
for (const literal of ["18.7M+", "500+", '"417"', "94%", '"countries":73', '"markets":126', '"languages":15']) {
  requireTrue(!stale.includes(literal), `Stale preview claim reintroduced: ${literal}`);
}

requireTrue(renderers.includes('summary.coverage?.countries ?? "—"'), "Country coverage renderer must fail closed.");
requireTrue(renderers.includes('summary.coverage?.markets ?? "—"'), "Market coverage renderer must fail closed.");
requireTrue(renderers.includes('summary.coverage?.languages ?? "—"'), "Language coverage renderer must fail closed.");
requireTrue(renderers.includes("if (summary.composition?.length)"), "Composition renderer must support unavailable composition.");
requireTrue(renderers.includes("Current source composition"), "Composition unavailable state must be explicit.");

if (errors.length) {
  console.error(JSON.stringify({ suite: "KIDULTS_PORTAL_CURRENT_TRUTH_SURFACE_V1", result: "FAIL", errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  suite: "KIDULTS_PORTAL_CURRENT_TRUTH_SURFACE_V1",
  result: "PASS",
  candidate_id: registry.snapshot?.candidate_id ?? null,
  evidence_package_id: registry.evidence?.current_package_id ?? null,
  assessment: registry.assessment?.status ?? "NOT_AVAILABLE",
  production: registry.release?.status ?? "HOLD",
  stale_preview_claims: 0
}, null, 2));
