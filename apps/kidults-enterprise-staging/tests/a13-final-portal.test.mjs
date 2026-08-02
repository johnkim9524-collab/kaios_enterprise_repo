import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../public/a13/", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const css = await readFile(new URL("final.css", root), "utf8");
const js = await readFile(new URL("final.js", root), "utf8");

assert.match(html, /Cormorant\+Garamond/);
assert.match(html, /class="premium-number index-number"/);
assert.match(html, /data-momentum-list/);
assert.match(html, /data-top-movers/);
assert.match(html, /data-ranking-list/);
assert.match(html, /data-archive-grid/);
assert.match(html, /Culture,<br>Collected\./);
assert.match(html, /final\.css/);
assert.match(html, /final\.js/);
assert.doesNotMatch(html, /<style>/);

assert.match(css, /font-variant-numeric:oldstyle-nums proportional-nums/);
assert.match(css, /\.premium-number \.tall-digit/);
assert.match(css, /scaleY\(1\.18\)/);
assert.match(css, /@media\(max-width:600px\)/);
assert.match(css, /overflow-x:hidden/);

assert.match(js, /stretchPremiumDigits/);
assert.match(js, /\[346789\]/);
assert.match(js, /\/data\/kidult-100\.json/);
assert.match(js, /\/data\/quality-status\.json/);
assert.match(js, /Promise\.allSettled/);

console.log("A13 final portal contract: PASS");
