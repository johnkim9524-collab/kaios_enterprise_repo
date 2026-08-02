import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("./public/", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

test("A9 app binds canonical quality status hooks", async () => {
  const source = await read("assets/app.js");
  assert.match(source, /quality:\s*"data\/quality-status\.json"/);
  assert.match(source, /data-hero-status/);
  assert.match(source, /data-hero-updated/);
  assert.match(source, /data-hero-score/);
  assert.match(source, /data-quality-status/);
  assert.match(source, /monitoring_pending/);
  assert.match(source, /insufficient_evidence/);
});

test("A9 bindings preserve index, archive and conversion behavior", async () => {
  const source = await read("assets/app.js");
  assert.match(source, /data-index-list/);
  assert.match(source, /data-archive-results/);
  assert.match(source, /data-archive-search/);
  assert.match(source, /data-conversion-form/);
  assert.match(source, /\/api\/conversions/);
});

test("quality status public payload remains production-safe", async () => {
  const payload = JSON.parse(await read("data/quality-status.json"));
  assert.equal(payload.environment, "staging");
  assert.equal(payload.production_promotion_authorized, false);
  assert.ok(Array.isArray(payload.alerts));
});
