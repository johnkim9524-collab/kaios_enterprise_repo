import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("./public/a13/", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const tokens = await readFile(new URL("styles/tokens.css", root), "utf8");
const base = await readFile(new URL("styles/base.css", root), "utf8");
const shell = await readFile(new URL("styles/shell.css", root), "utf8");
const home = await readFile(new URL("styles/home.css", root), "utf8");
const app = await readFile(new URL("app.js", root), "utf8");

const navLabels = ["Intelligence", "Kidult 100", "Research", "Trust Center", "Enterprise Access"];
for (const label of navLabels) assert.ok(html.includes(`>${label}<`), `missing navigation label: ${label}`);
assert.equal((html.match(/<nav class="primary-nav"/g) || []).length, 1);
assert.ok(html.includes("Global intelligence for collectible markets"));
assert.ok(html.includes("data-index-list"));
assert.ok(html.includes("data-archive-results"));
assert.ok(html.includes('data-conversion-form="waitlist"'));
assert.ok(html.includes("data-hero-status"));
assert.ok(html.includes("styles/tokens.css"));
assert.ok(html.includes("styles/base.css"));
assert.ok(html.includes("styles/shell.css"));
assert.ok(html.includes("styles/home.css"));

assert.ok(tokens.includes("--color-signal"));
assert.ok(tokens.includes("--font-serif"));
assert.ok(base.includes(":focus-visible"));
assert.ok(shell.includes("overflow-x:auto"));
assert.ok(home.includes("@media(max-width:640px)"));
assert.ok(app.includes('index: "/data/kidult-100.json"'));
assert.ok(app.includes('fetch("/api/conversions"'));
assert.ok(!html.includes("a9-v22-shell.css"));
assert.ok(!html.includes("a11-unified-pages.css"));
assert.ok(!html.includes("a12-comprehensive-tuning.css"));

console.log("A13 Global Intelligence House prototype contract passed.");
