import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { createKidultsServer } from "./server.mjs";

async function withServer(run, options = {}) {
  const root = mkdtempSync(resolve(tmpdir(), "kidults-conversion-"));
  const publicDir = resolve(root, "public");
  const dataDir = resolve(root, "data");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(resolve(publicDir, "index.html"), "<!doctype html><title>Kidults</title>", "utf8");
  const projectionPath = resolve(root, "approved-projection.json");
  if (options.projection) writeFileSync(projectionPath, JSON.stringify(options.projection), "utf8");
  const server = createKidultsServer({
    publicDir,
    dataDir,
    secret: "test-secret-with-sufficient-entropy",
    rateMax: options.rateMax || 20,
    now: options.now || (() => new Date("2026-07-31T03:00:00.000Z")),
    projectionPath: options.projection ? projectionPath : null,
    projectionSecret: options.projection ? "projection-capability-test-secret-with-at-least-32-bytes" : null
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`, dataDir, projectionPath);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

function validSubmission(overrides = {}) {
  return {
    type: "newsletter",
    email: "qa@example.com",
    organization: "",
    interest: "",
    consent: true,
    consent_version: "2026-08",
    website: "",
    ...overrides
  };
}

async function submit(base, body) {
  return fetch(`${base}/api/conversions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

test("serves the portal and staging health contract with security headers", async () => {
  await withServer(async (base) => {
    const portal = await fetch(base);
    assert.equal(portal.status, 200);
    assert.match(await portal.text(), /Kidults/);
    assert.equal(portal.headers.get("x-frame-options"), "DENY");

    const health = await fetch(`${base}/health`);
    const body = await health.json();
    assert.equal(health.status, 200);
    assert.equal(body.environment, "staging");
    assert.equal(body.production_promotion_authorized, false);
  });
});

test("projection surfaces fail closed without server capability configuration", async () => {
  await withServer(async (base) => {
    for (const path of ["/api/v1/projection", "/api/v1/projection/data", "/api/v1/projection/export"]) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 503);
      assert.equal((await response.json()).release, "HOLD");
    }
  });
});

test("portal, API and export use signed exact-projection admission and revoke immediately", async () => {
  const { approvedProjectionFixture } = await import("../../scripts/kidults/portal/proof-product-test-fixtures-v1.mjs");
  const projection = approvedProjectionFixture();
  await withServer(async (base, _dataDir, projectionPath) => {
    const portal = await fetch(`${base}/api/v1/projection`);
    const portalBody = await portal.json();
    assert.equal(portal.status, 200);
    assert.equal(portalBody.portal_view.projection.state, "LIVE_APPROVED");
    assert.equal(portalBody.consumption_receipt.release_authority, "SIGNED_SERVER_CAPABILITY");

    const api = await fetch(`${base}/api/v1/projection/data`);
    assert.equal(api.status, 200);
    assert.equal((await api.json()).projection.projection_id, projection.projection_id);
    const exported = await fetch(`${base}/api/v1/projection/export`);
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get("content-disposition"), /attachment/);

    const revoked = structuredClone(projection);
    revoked.projection_state = "REVOKED";
    revoked.display_eligibility = "BLOCKED";
    writeFileSync(projectionPath, JSON.stringify(revoked), "utf8");
    const afterRevoke = await fetch(`${base}/api/v1/projection`);
    assert.equal(afterRevoke.status, 409);
    assert.equal((await afterRevoke.json()).release, "HOLD");
  }, { projection, now: () => new Date("2026-08-22T10:30:00Z") });
});

test("persists encrypted personal data and a non-PII audit event", async () => {
  await withServer(async (base, dataDir) => {
    const response = await submit(base, validSubmission());
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.status, "accepted");

    const submissions = readFileSync(resolve(dataDir, "conversion-submissions.jsonl"), "utf8");
    const audit = readFileSync(resolve(dataDir, "conversion-audit.jsonl"), "utf8");
    assert.doesNotMatch(submissions, /qa@example\.com/);
    assert.match(submissions, /email_fingerprint/);
    assert.match(submissions, /AES-256-GCM-v1/);
    assert.match(submissions, /expires_at/);
    assert.doesNotMatch(audit, /qa@example\.com/);
    assert.match(audit, /conversion_accepted/);
  });
});

test("rejects cross-origin conversion writes", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/conversions`, {
      method: "POST",
      headers: {"content-type":"application/json", origin:"https://attacker.invalid"},
      body: JSON.stringify(validSubmission())
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "cross_origin");
  });
});

test("persists newsletter, waitlist, and inquiry conversions", async () => {
  await withServer(async (base, dataDir) => {
    assert.equal((await submit(base, validSubmission())).status, 201);
    assert.equal((await submit(base, validSubmission({
      type: "waitlist",
      email: "waitlist@example.com",
      organization: "Staging QA"
    }))).status, 201);
    assert.equal((await submit(base, validSubmission({
      type: "inquiry",
      email: "inquiry@example.com",
      interest: "Mobile staging validation"
    }))).status, 201);

    const records = readFileSync(resolve(dataDir, "conversion-submissions.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(records.map((record) => record.type), [
      "newsletter",
      "waitlist",
      "inquiry"
    ]);
  });
});

test("deduplicates the same conversion type and email for 24 hours", async () => {
  await withServer(async (base, dataDir) => {
    assert.equal((await submit(base, validSubmission())).status, 201);
    const duplicate = await submit(base, validSubmission());
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json()).status, "duplicate");
    const lines = readFileSync(resolve(dataDir, "conversion-submissions.jsonl"), "utf8")
      .trim()
      .split("\n");
    assert.equal(lines.length, 1);
  });
});

test("requires consent and type-specific fields", async () => {
  await withServer(async (base) => {
    assert.equal((await submit(base, validSubmission({ consent: false }))).status, 400);
    assert.equal((await submit(base, validSubmission({
      type: "waitlist",
      organization: ""
    }))).status, 400);
    assert.equal((await submit(base, validSubmission({
      type: "inquiry",
      interest: "short"
    }))).status, 400);
  });
});

test("filters honeypot submissions without persisting personal data", async () => {
  await withServer(async (base, dataDir) => {
    const response = await submit(base, validSubmission({ website: "https://spam.invalid" }));
    assert.equal(response.status, 201);
    const audit = readFileSync(resolve(dataDir, "conversion-audit.jsonl"), "utf8");
    assert.match(audit, /conversion_filtered/);
    assert.doesNotMatch(audit, /qa@example\.com/);
    assert.throws(() => readFileSync(resolve(dataDir, "conversion-submissions.jsonl"), "utf8"));
  });
});

test("rejects path traversal and unsupported methods", async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/..%2Fserver.mjs`)).status, 403);
    assert.equal((await fetch(`${base}/api/conversions`, { method: "DELETE" })).status, 405);
  });
});

test("rate limits repeated requests from one client", async () => {
  await withServer(async (base) => {
    assert.equal((await submit(base, validSubmission())).status, 201);
    const response = await submit(base, validSubmission({ email: "second@example.com" }));
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("retry-after"), "900");
  }, { rateMax: 1 });
});
