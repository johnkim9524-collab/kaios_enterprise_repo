import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const file = path.join(import.meta.dirname, 'public/executive/control-tower.html');
const html = fs.readFileSync(file, 'utf8');

test('management control tower is a governed read-only surface', () => {
  assert.match(html, /INTERNAL · READ-ONLY · GOVERNED SNAPSHOT/);
  assert.match(html, /권리-clear current-SOLD 0/);
  assert.match(html, /Production \/ Public \/ G5/);
  assert.match(html, /no live provider payloads/);
  assert.match(html, /WHAT MANAGEMENT SEES/);
  assert.match(html, /WHAT MANAGEMENT DECIDES/);
});

test('dashboard exposes decision queue and source truth boundaries', () => {
  assert.match(html, /3개 HOLD 소스/);
  assert.match(html, /30 natural runs/);
  assert.match(html, /current-sold-sample-governance-v1\.json/);
  assert.match(html, /management-control-tower-contract-v1\.json/);
  assert.match(html, /unknown.*추정|추정하지 않습니다/);
});

test('dashboard supports latest governed snapshot refresh', () => {
  assert.match(html, /control-tower-snapshot-v1\.json/);
  assert.match(html, /cache:'no-store'/);
});
