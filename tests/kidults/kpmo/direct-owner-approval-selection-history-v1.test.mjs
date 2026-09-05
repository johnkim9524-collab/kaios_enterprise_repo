import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const runner = fs.readFileSync('scripts/kidults/kpmo/run-direct-owner-landing-handoff-v1.mjs', 'utf8');
const MARKER = 'KIDULTS_DIRECT_OWNER_EVENT_EMITTING_MERGE_APPROVAL_V2';

function extractFunction(name) {
  const start = runner.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} source unavailable`);
  let cursor = runner.indexOf('{', start);
  let depth = 0;
  for (; cursor < runner.length; cursor += 1) {
    if (runner[cursor] === '{') depth += 1;
    if (runner[cursor] === '}') {
      depth -= 1;
      if (depth === 0) return runner.slice(start, cursor + 1);
    }
  }
  throw new Error(`${name} boundary unavailable`);
}

function loadProductionSelector(nowMs) {
  const keysStart = runner.indexOf('const approvalKeys = [');
  const keysEnd = runner.indexOf('];', keysStart) + 2;
  assert.ok(keysStart >= 0 && keysEnd > keysStart, 'approvalKeys source unavailable');

  const factory = new Function(
    'crypto', 'MARKER', 'OPERATION', 'TRANSPORT', 'SCOPE', 'MAX_APPROVAL_LIFETIME_MS', 'NONCE',
    'repository', 'prNumber', 'expectedBaseSha', 'expectedHeadSha', 'authorizationId', 'purpose',
    'handoffWindowSeconds', 'parseTime', 'fail', 'Date',
    `${runner.slice(keysStart, keysEnd)}\n${extractFunction('parseApproval')}\n${extractFunction('selectApproval')}\nreturn {parseApproval, selectApproval};`,
  );

  const fail = code => {
    const error = new Error(code);
    error.code = code;
    throw error;
  };
  const parseTime = (value, code) => {
    const parsed = globalThis.Date.parse(String(value || ''));
    if (!Number.isFinite(parsed)) fail(code);
    return parsed;
  };
  class FixedDate extends globalThis.Date {
    static now() { return nowMs; }
  }

  return factory(
    crypto,
    MARKER,
    'MERGE_PROTECTED_MAIN',
    'DIRECT_OWNER_GITHUB_UI',
    'ONE_DIRECT_OWNER_MERGE_ONLY',
    60 * 60 * 1000,
    /^[0-9a-f]{32}$/,
    'johnkim9524-collab/kaios_enterprise_repo',
    '1993',
    'cdf360a9fed2005e71651cdfa55659a924def90d',
    '6381174d0b5969c19234fc47d482d465d1eb7249',
    'DIRECT-PR-1993-6381174d0b59',
    'P1_1987_REVOCATION_CANARY',
    180,
    parseTime,
    fail,
    FixedDate,
  );
}

function approvalBody({nonce, expiresAt}) {
  return [
    MARKER,
    'repository=johnkim9524-collab/kaios_enterprise_repo',
    'pull_request=1993',
    'exact_base_sha=cdf360a9fed2005e71651cdfa55659a924def90d',
    'exact_head_sha=6381174d0b5969c19234fc47d482d465d1eb7249',
    'operation=MERGE_PROTECTED_MAIN',
    'transport=DIRECT_OWNER_GITHUB_UI',
    'authorization_id=DIRECT-PR-1993-6381174d0b59',
    `nonce=${nonce}`,
    `expires_at=${expiresAt}`,
    'purpose=P1_1987_REVOCATION_CANARY',
    'scope=ONE_DIRECT_OWNER_MERGE_ONLY',
    'approval_rebind=FORBIDDEN',
    'production=HOLD',
    'public=HOLD',
    'g5=HOLD',
  ].join('\n');
}

function ownerComment({id, createdAt, updatedAt = createdAt, body}) {
  return {
    id,
    created_at: createdAt,
    updated_at: updatedAt,
    body,
    user: {login: 'johnkim9524-collab', type: 'User'},
    author_association: 'OWNER',
    performed_via_github_app: null,
  };
}

test('historical malformed approval cannot poison a newer fresh valid generation', () => {
  const now = Date.parse('2026-09-05T05:00:00Z');
  const {selectApproval} = loadProductionSelector(now);
  const iso = offsetMinutes => new Date(now + offsetMinutes * 60_000).toISOString();
  const pr = {created_at: iso(-40)};
  const headCommit = {commit: {committer: {date: iso(-35)}}};
  const readyEvent = {created_at: iso(-4)};

  const historicalMalformed = ownerComment({
    id: 100,
    createdAt: iso(-20),
    updatedAt: iso(-15),
    body: `${approvalBody({nonce: '11111111111111111111111111111111', expiresAt: iso(10)})}\nREVOCATION_CANARY_MUTATION=1`,
  });
  const freshValid = ownerComment({
    id: 200,
    createdAt: iso(-5),
    body: approvalBody({nonce: '22222222222222222222222222222222', expiresAt: iso(25)}),
  });

  const selected = selectApproval([historicalMalformed, freshValid], 'johnkim9524-collab', pr, headCommit, readyEvent);
  assert.equal(selected.comment_id, 200);
});

test('newest malformed marked approval still fails closed', () => {
  const now = Date.parse('2026-09-05T05:00:00Z');
  const {selectApproval} = loadProductionSelector(now);
  const iso = offsetMinutes => new Date(now + offsetMinutes * 60_000).toISOString();
  const pr = {created_at: iso(-40)};
  const headCommit = {commit: {committer: {date: iso(-35)}}};
  const readyEvent = {created_at: iso(-1)};

  const olderValid = ownerComment({
    id: 200,
    createdAt: iso(-10),
    body: approvalBody({nonce: '33333333333333333333333333333333', expiresAt: iso(20)}),
  });
  const newestMalformed = ownerComment({
    id: 300,
    createdAt: iso(-2),
    updatedAt: iso(-2),
    body: `${approvalBody({nonce: '44444444444444444444444444444444', expiresAt: iso(25)})}\nUNEXPECTED_FIELD=1`,
  });

  assert.throws(
    () => selectApproval([olderValid, newestMalformed], 'johnkim9524-collab', pr, headCommit, readyEvent),
    /DIRECT_OWNER_HANDOFF_APPROVAL_SHAPE_INVALID/,
  );
});

test('selector chooses marker generation before parsing approval body', () => {
  const selector = extractFunction('selectApproval');
  const markerFilter = selector.indexOf('.filter(comment =>');
  const parseSelected = selector.indexOf('const fields = parseApproval(comment?.body)');
  assert.ok(markerFilter >= 0 && parseSelected > markerFilter);
  assert.doesNotMatch(selector, /\.map\(comment => \(\{comment, fields: parseApproval/);
});

test('pre-Draft approval cannot be rebound by a later Ready generation', () => {
  const now = Date.parse('2026-09-05T05:00:00Z');
  const {selectApproval} = loadProductionSelector(now);
  const iso = offsetMinutes => new Date(now + offsetMinutes * 60_000).toISOString();
  const pr = {created_at: iso(-40)};
  const headCommit = {commit: {committer: {date: iso(-35)}}};
  const readyEvent = {
    created_at: iso(-2),
    latest_invalidating_event: {id: 500, event: 'convert_to_draft', created_at: iso(-6)},
  };
  const staleApproval = ownerComment({
    id: 400,
    createdAt: iso(-10),
    body: approvalBody({nonce: '55555555555555555555555555555555', expiresAt: iso(20)}),
  });

  assert.throws(
    () => selectApproval([staleApproval], 'johnkim9524-collab', pr, headCommit, readyEvent),
    /DIRECT_OWNER_HANDOFF_APPROVAL_NOT_AFTER_LATEST_INVALIDATION/,
  );
});

test('fresh post-Draft approval remains valid before the new Ready event', () => {
  const now = Date.parse('2026-09-05T05:00:00Z');
  const {selectApproval} = loadProductionSelector(now);
  const iso = offsetMinutes => new Date(now + offsetMinutes * 60_000).toISOString();
  const pr = {created_at: iso(-40)};
  const headCommit = {commit: {committer: {date: iso(-35)}}};
  const readyEvent = {
    created_at: iso(-2),
    latest_invalidating_event: {id: 500, event: 'convert_to_draft', created_at: iso(-6)},
  };
  const freshApproval = ownerComment({
    id: 600,
    createdAt: iso(-4),
    body: approvalBody({nonce: '66666666666666666666666666666666', expiresAt: iso(20)}),
  });

  const selected = selectApproval([freshApproval], 'johnkim9524-collab', pr, headCommit, readyEvent);
  assert.equal(selected.comment_id, 600);
});
