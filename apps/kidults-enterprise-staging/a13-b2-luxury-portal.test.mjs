import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(process.cwd(), 'apps/kidults-enterprise-staging/public/a13-b2');
const pages = ['index.html','markets/index.html','kidult-100/index.html','research/index.html','canon/index.html','enterprise/index.html','methodology/index.html','archive/index.html','status/index.html','about/index.html'];

test('A13-B2 pages exist and share luxury shell', async () => {
  for (const page of pages) {
    const html = await readFile(join(root, page), 'utf8');
    assert.match(html, /luxury\.css/);
    assert.match(html, /shell\.js/);
    assert.match(html, /data-global-header/);
    assert.match(html, /data-global-footer/);
    assert.match(html, /data-global-trust/);
  }
});

test('major product pages contain substantive sections', async () => {
  for (const page of ['index.html','markets/index.html','kidult-100/index.html','research/index.html','canon/index.html','enterprise/index.html']) {
    const html = await readFile(join(root, page), 'utf8');
    const sections = (html.match(/<section/g) || []).length;
    assert.ok(sections >= 6, `${page} has only ${sections} sections`);
  }
});

test('luxury design system includes responsive breakpoints and premium typography', async () => {
  const css = await readFile(join(root, 'assets/luxury.css'), 'utf8');
  assert.match(css, /Cormorant Garamond/);
  assert.match(css, /Inter/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /@media\(max-width:380px\)/);
  assert.match(css, /--ivory/);
  assert.match(css, /--forest/);
  assert.match(css, /--gold/);
});