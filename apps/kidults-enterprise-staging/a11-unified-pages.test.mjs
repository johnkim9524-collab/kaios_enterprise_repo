import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('./public/', import.meta.url);
const pages = ['methodology.html', 'operations.html'];
const navItems = ['Intelligence', 'Markets', 'Kidult 100', 'Archive', 'Methodology', 'Status', 'Access'];

for (const page of pages) {
  test(`${page} uses the A11 unified V22 shell`, async () => {
    const html = await readFile(new URL(page, root), 'utf8');
    assert.match(html, /assets\/a11-unified-pages\.css/);
    assert.match(html, /class="site-header"/);
    assert.match(html, /Kidults<span class="brand-dot">\.<\/span>/);
    for (const item of navItems) assert.ok(html.includes(`>${item}<`), `${page} missing ${item}`);
    assert.match(html, /The Global Standard for Collector Intelligence/);
  });
}

test('Status keeps all dynamic quality bindings', async () => {
  const html = await readFile(new URL('operations.html', root), 'utf8');
  for (const hook of [
    'data-quality-root', 'data-quality-state', 'data-quality-evaluated',
    'data-quality-run-age', 'data-quality-records', 'data-quality-categories',
    'data-quality-confidence', 'data-quality-outputs', 'data-quality-alerts'
  ]) assert.ok(html.includes(hook), `missing ${hook}`);
});

test('A11 CSS includes mobile and overflow safeguards', async () => {
  const css = await readFile(new URL('assets/a11-unified-pages.css', root), 'utf8');
  assert.match(css, /overflow-x:clip/);
  assert.match(css, /@media\(max-width:520px\)/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
