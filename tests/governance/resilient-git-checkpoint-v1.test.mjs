import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  classifyCheckpointContinuity,
  createResilientGitCheckpoint,
  inspectResilientGitCheckpoint,
} from '../../scripts/governance/resilient-git-checkpoint-v1.mjs';

function git(repository, args) {
  return execFileSync('/usr/bin/git', args, {
    cwd: repository,
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC' },
  }).trim();
}

function commit(repository, filename, contents, message) {
  writeFileSync(path.join(repository, filename), contents);
  git(repository, ['add', filename]);
  git(repository, ['commit', '--quiet', '-m', message]);
  return git(repository, ['rev-parse', 'HEAD']);
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kidults-checkpoint-test-'));
  const repository = path.join(root, 'repository');
  const checkpointRoot = path.join(root, 'checkpoints');
  mkdirSync(repository, { mode: 0o700 });
  mkdirSync(checkpointRoot, { mode: 0o700 });
  git(repository, ['init', '--quiet', '--initial-branch=main']);
  git(repository, ['config', 'user.name', 'Checkpoint Test']);
  git(repository, ['config', 'user.email', 'checkpoint@example.invalid']);
  git(repository, ['remote', 'add', 'origin', 'https://example.invalid/repository.git']);
  return { root, repository, checkpointRoot };
}

test('classifies exact, forward, rollback, and divergence states', () => {
  assert.equal(classifyCheckpointContinuity({ currentSha: 'a', checkpointSha: 'a',
    currentContainsCheckpoint: false, checkpointContainsCurrent: false }), 'CONTINUITY_VERIFIED');
  assert.equal(classifyCheckpointContinuity({ currentSha: 'b', checkpointSha: 'a',
    currentContainsCheckpoint: true, checkpointContainsCurrent: false }), 'CONTINUITY_VERIFIED');
  assert.equal(classifyCheckpointContinuity({ currentSha: 'a', checkpointSha: 'b',
    currentContainsCheckpoint: false, checkpointContainsCurrent: true }), 'ROLLBACK_DETECTED_HOLD');
  assert.equal(classifyCheckpointContinuity({ currentSha: 'c', checkpointSha: 'b',
    currentContainsCheckpoint: false, checkpointContainsCurrent: false }), 'DIVERGENCE_DETECTED_HOLD');
});

test('independent bundle detects continuity, rollback, and divergence without restoring', () => {
  const { root, repository, checkpointRoot } = fixture();
  try {
    const first = commit(repository, 'state.txt', 'first\n', 'first');
    const saved = commit(repository, 'state.txt', 'saved\n', 'saved');
    const manifest = createResilientGitCheckpoint({ checkpointRoot, repository,
      createdAt: '2026-09-20T00:00:00.000Z' });
    assert.equal(manifest.headSha, saved);
    assert.equal(inspectResilientGitCheckpoint({ checkpointRoot, repository }).state,
      'CONTINUITY_VERIFIED');

    commit(repository, 'next.txt', 'next\n', 'next');
    assert.equal(inspectResilientGitCheckpoint({ checkpointRoot, repository }).state,
      'CONTINUITY_VERIFIED');

    git(repository, ['reset', '--hard', '--quiet', first]);
    const rollback = inspectResilientGitCheckpoint({ checkpointRoot, repository });
    assert.equal(rollback.state, 'ROLLBACK_DETECTED_HOLD');
    assert.equal(rollback.automaticRecoveryPerformed, false);
    assert.equal(git(repository, ['rev-parse', 'HEAD']), first);

    commit(repository, 'fork.txt', 'fork\n', 'fork');
    const divergence = inspectResilientGitCheckpoint({ checkpointRoot, repository });
    assert.equal(divergence.state, 'DIVERGENCE_DETECTED_HOLD');
    assert.equal(divergence.automaticRecoveryPerformed, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects checkpoint storage inside the repository', () => {
  const { root, repository } = fixture();
  try {
    commit(repository, 'state.txt', 'first\n', 'first');
    assert.throws(() => createResilientGitCheckpoint({
      checkpointRoot: path.join(repository, 'checkpoints'), repository,
      createdAt: '2026-09-20T00:00:00.000Z',
    }), /CHECKPOINT_ISOLATION_REQUIRED/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('creates an independently importable checkpoint from a shallow repository', () => {
  const fixtureData = fixture();
  const { root, repository, checkpointRoot } = fixtureData;
  try {
    commit(repository, 'state.txt', 'first\n', 'first');
    commit(repository, 'state.txt', 'second\n', 'second');
    commit(repository, 'state.txt', 'third\n', 'third');
    const shallow = path.join(root, 'shallow');
    git(root, ['clone', '--quiet', '--depth=2', `file://${repository}`, shallow]);
    git(shallow, ['config', 'user.name', 'Checkpoint Test']);
    git(shallow, ['config', 'user.email', 'checkpoint@example.invalid']);
    createResilientGitCheckpoint({ checkpointRoot, repository: shallow,
      createdAt: '2026-09-20T00:00:00.000Z' });
    assert.equal(inspectResilientGitCheckpoint({ checkpointRoot, repository: shallow }).state,
      'CONTINUITY_VERIFIED');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
