import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const baseline = fs.readFileSync(path.join(appRoot, 'A13-B24-BASELINE.md'), 'utf8');
const contract = JSON.parse(fs.readFileSync(path.join(dataRoot, 'provider-manual-dispatch.json'), 'utf8'));
const runner = fs.readFileSync(path.join(appRoot, 'scripts', 'run-a13-b24-manual-dispatch-export.mjs'), 'utf8');

test('A13-B24 remains staging-only and production-safe', () => {
  assert.equal(contract.release, 'A13-B24');
  assert.equal(contract.environment, 'staging');
  assert.equal(contract.productionPromotionAuthorized, false);
  assert.match(baseline, /production promotion remains blocked by default/i);
});

test('A13-B24 never sends automatically or stores recipient details', () => {
  assert.equal(contract.dispatchPolicy.automaticSendingAllowed, false);
  assert.equal(contract.dispatchPolicy.storeRecipientAddress, false);
  assert.equal(contract.dispatchPolicy.storePersonalContact, false);
  assert.equal(contract.dispatchPolicy.storeSecrets, false);
  assert.doesNotMatch(runner, /sendMail|smtp|recipientAddress|process\.env/);
});

test('A13-B24 requires explicit operator confirmation before contacted commands', () => {
  assert.equal(contract.dispatchPolicy.explicitOperatorConfirmationRequired, true);
  assert.match(runner, /reviewComplete && confirmation\?\.dispatched === true/);
  assert.match(runner, /run-a13-b22-dispatch-ledger\.mjs contacted/);
});

test('A13-B24 exports provider-specific packets with the full diligence questionnaire', () => {
  assert.equal(contract.requiredEvidence.length, 8);
  assert.match(runner, /manual-dispatch/);
  assert.match(runner, /Required diligence questions/);
  assert.match(runner, /provider-manual-dispatch-status\.json/);
});

test('A13-B24 preserves mobile-safe staging architecture', () => {
  assert.match(baseline, /mobile-safe staging status UI contract/i);
  assert.match(baseline, /staging only/i);
});
