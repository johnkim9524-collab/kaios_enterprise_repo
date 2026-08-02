import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("./", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const pages = [
  "public/index.html",
  "public/methodology.html",
  "public/operations.html"
];

const expectedNav = [
  "Intelligence",
  "Markets",
  "Kidult 100",
  "Archive",
  "Methodology",
  "Status",
  "Access"
];

function navLabels(html) {
  const nav = html.match(/<nav class="site-nav"[\s\S]*?<\/nav>/)?.[0] ?? "";
  return [...nav.matchAll(/<a\b[^>]*>([^<]+)<\/a>/g)].map((match) => match[1].trim());
}

test("all portal pages expose the same navigation labels and order", async () => {
  for (const page of pages) {
    const html = await read(page);
    assert.deepEqual(navLabels(html), expectedNav, page);
  }
});

test("both stylesheet entry points import the canonical shell and A12 tuning", async () => {
  for (const path of ["public/assets/a9-v22-shell.css", "public/assets/a11-unified-pages.css"]) {
    const css = await read(path);
    assert.match(css, /portal-shell\.css/, path);
    assert.match(css, /a12-comprehensive-tuning\.css/, path);
  }
});

test("canonical shell neutralizes page-specific movement", async () => {
  const css = await read("public/assets/portal-shell.css");
  assert.match(css, /scrollbar-gutter:stable/);
  assert.match(css, /transition:none!important/);
  assert.match(css, /transform:none!important/);
  assert.match(css, /a\[aria-current="page"\]/);
});

test("A12 tuning includes mobile and reduced-motion safeguards", async () => {
  const css = await read("public/assets/a12-comprehensive-tuning.css");
  assert.match(css, /@media\(max-width:560px\)/);
  assert.match(css, /overflow-x:clip/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /grid-template-columns:1fr!important/);
});
