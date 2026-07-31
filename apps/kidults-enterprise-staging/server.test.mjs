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
  const server = createKidultsServer({
    publicDir,
    dataDir,
    secret: "test-secret-with-sufficient-entropy",
    rateMax: options.rateMax || 20,
    now: () => new Date("2026-07-31T03:00:00.000Z")
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`, dataDir);
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

test("persists an accepted submission and a non-PII audit event", async () => {
  await withServer(async (base, dataDir) => {
    const response = await submit(base, validSubmission());
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.status, "accepted");

    const submissions = readFileSync(resolve(dataDir, "conversion-submissions.jsonl"), "utf8");
    const audit = readFileSync(resolve(dataDir, "conversion-audit.jsonl"), "utf8");
    assert.match(submissions, /qa@example\.com/);
    assert.match(submissions, /email_fingerprint/);
    assert.doesNotMatch(audit, /qa@example\.com/);
    assert.match(audit, /conversion_accepted/);
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
