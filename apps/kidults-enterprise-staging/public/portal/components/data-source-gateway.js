const DEFAULT_TIMEOUT_MS = 4500;
const ALLOWED_ACCESS = new Set(["PUBLIC_PAYLOAD", "PUBLIC_STATUS_ONLY", "INTERNAL_ONLY"]);
const ALLOWED_POLICIES = new Set(["CONTRACT_GATED", "STATUS_ONLY", "NEVER"]);

function token(value) {
  return String(value ?? "NOT_AVAILABLE").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function readPath(value, dottedPath) {
  return String(dottedPath ?? "")
    .split(".")
    .filter(Boolean)
    .reduce((current, key) => current?.[key], value);
}

function present(value) {
  return value !== null &&
    value !== undefined &&
    value !== "" &&
    value !== "NOT_YET_REGISTERED" &&
    value !== "NOT_REGISTERED" &&
    value !== "NOT_AVAILABLE";
}

function assertLocalPath(value) {
  const path = String(value ?? "");
  if (!path || /^(?:https?:)?\/\//i.test(path) || path.startsWith("data:")) {
    throw new Error(`Remote or empty source paths are prohibited: ${path || "<empty>"}`);
  }
  return path;
}

async function fetchJson(path, timeoutMs) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(assertLocalPath(path), {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${response.status} ${path}`);
    return await response.json();
  } finally {
    window.clearTimeout(timer);
  }
}

function validateSource(source, payload, context) {
  const issues = [];
  const acceptedStatuses = (source.accepted_statuses ?? []).map(token);
  const status = token(readPath(payload, source.status_path ?? "status"));

  if (source.snapshot_binding === "BASELINE") {
    const actual = readPath(payload, source.snapshot_path ?? "snapshot_id");
    if (!present(actual)) issues.push("snapshot binding missing");
    else if (String(actual) !== String(context.baselineSnapshotId)) {
      issues.push(`snapshot mismatch: expected ${context.baselineSnapshotId}, received ${actual}`);
    }
  }

  for (const path of source.required_metadata ?? []) {
    if (!present(readPath(payload, path))) issues.push(`required metadata missing: ${path}`);
  }

  const statusAccepted = acceptedStatuses.length === 0 || acceptedStatuses.includes(status);
  if (!statusAccepted) {
    issues.push(`status ${status} is not publication-eligible`);
  }

  const contractValid = issues.filter(issue => !issue.startsWith("status ")).length === 0;
  const publicationEligible =
    source.publication_policy === "CONTRACT_GATED" &&
    contractValid &&
    statusAccepted &&
    source.access === "PUBLIC_PAYLOAD";

  return {
    contractValid,
    publicationEligible,
    status,
    issues
  };
}

function summarizeSource(source, validation, fetched, error) {
  let state = "WAITING";
  if (error) state = source.required ? "ERROR" : "UNAVAILABLE";
  else if (validation.publicationEligible) state = "VERIFIED_CONNECTED";
  else if (fetched) state = source.access === "INTERNAL_ONLY" ? "SHADOW_CONNECTED" : "CONNECTED_NOT_PUBLISHABLE";

  return Object.freeze({
    id: source.id,
    role: source.role,
    required: Boolean(source.required),
    access: source.access,
    publicationPolicy: source.publication_policy,
    state,
    status: validation.status,
    contractValid: validation.contractValid,
    publicationEligible: validation.publicationEligible,
    issues: Object.freeze(validation.issues.slice()),
    error: error ? String(error.message ?? error) : null
  });
}

export async function loadDataConnections({
  manifestPath = "data/data-source-manifest-v1.json",
  baselineSnapshotId,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (!present(baselineSnapshotId)) {
    throw new Error("A baseline snapshot ID is required before data connections can load.");
  }

  const manifest = await fetchJson(manifestPath, timeoutMs);
  const sourceIds = new Set();
  for (const source of manifest.sources ?? []) {
    if (!source.id || sourceIds.has(source.id)) throw new Error(`Duplicate or missing source id: ${source.id}`);
    if (!ALLOWED_ACCESS.has(source.access)) throw new Error(`Unsupported access policy for ${source.id}`);
    if (!ALLOWED_POLICIES.has(source.publication_policy)) throw new Error(`Unsupported publication policy for ${source.id}`);
    assertLocalPath(source.path);
    sourceIds.add(source.id);
  }

  const payloads = {};
  const sources = [];
  const context = { baselineSnapshotId };

  for (const source of manifest.sources ?? []) {
    let payload = null;
    let error = null;
    try {
      payload = await fetchJson(source.path, source.timeout_ms ?? timeoutMs);
    } catch (caught) {
      error = caught;
    }

    const validation = payload
      ? validateSource(source, payload, context)
      : { contractValid: false, publicationEligible: false, status: "NOT_AVAILABLE", issues: ["source unavailable"] };

    const summary = summarizeSource(source, validation, Boolean(payload), error);
    sources.push(summary);

    // Internal provider-shadow payloads are deliberately never exposed to the public Portal runtime.
    if (payload && source.access === "PUBLIC_PAYLOAD") payloads[source.id] = payload;
  }

  const requiredFailure = sources.some(source => source.required && source.state === "ERROR");
  const verifiedCount = sources.filter(source => source.publicationEligible).length;
  const connectedOptionalCount = sources.filter(source =>
    !source.required && ["VERIFIED_CONNECTED", "CONNECTED_NOT_PUBLISHABLE", "SHADOW_CONNECTED"].includes(source.state)
  ).length;

  const state = requiredFailure
    ? "DEGRADED"
    : verifiedCount > 0
      ? "VERIFIED_CONNECTED"
      : connectedOptionalCount > 0
        ? "SHADOW_CONNECTED"
        : "BASELINE_ONLY";

  return Object.freeze({
    manifest: Object.freeze({
      id: manifest.manifest_id,
      version: manifest.version,
      baselineSnapshotId: manifest.baseline_snapshot_id,
      productionEligible: Boolean(manifest.production_eligible)
    }),
    summary: Object.freeze({
      state,
      sourceCount: sources.length,
      verifiedCount,
      requiredFailure,
      productionEligible: false
    }),
    sources: Object.freeze(sources),
    payloads: Object.freeze(payloads)
  });
}

export function sourceIsOverlayEligible(connections, sourceId) {
  return Boolean(connections?.sources?.find(source =>
    source.id === sourceId &&
    source.contractValid &&
    source.publicationEligible &&
    source.state === "VERIFIED_CONNECTED"
  ));
}
