import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, 'public');
const pages = ['index.html', 'methodology.html', 'operations.html'];
const expectedLabels = ['Intelligence', 'Markets', 'Kidult 100', 'Archive', 'Methodology', 'Status', 'Access'];

async function read(name) {
  return readFile(join(publicDir, name), 'utf8');
}

function navLabels(html) {
  const nav = html.match(/<nav class="site-nav"[\s\S]*?<\/nav>/)?.[0] ?? '';
  return [...nav.matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map((match) => match[1].trim());
}

test('all public pages expose the same navigation labels and order', async () => {
  for (const page of pages) {
    const html = await read(page);
    assert.deepEqual(navLabels(html), expectedLabels, `${page} navigation differs`);
  }
});

test('main and subpage stylesheet entry points import the canonical shell', async () => {
  const mainCss = await read('assets/a9-v22-shell.css');
  const subpageCss = await read('assets/a11-unified-pages.css');
  for (const css of [mainCss, subpageCss]) {
    assert.match(css, /@import url\("\.\/portal-shell\.css"\);/);
    assert.match(css, /@import url\("\.\/a12-comprehensive-tuning\.css"\);/);
  }
});

test('canonical shell neutralizes page-only active navigation styling', async () => {
  const css = await read('assets/portal-shell.css');
  assert.match(css, /\.site-nav a\[aria-current="page"\]/);
  assert.match(css, /border:0!important/);
  assert.match(css, /transform:none!important/);
});
