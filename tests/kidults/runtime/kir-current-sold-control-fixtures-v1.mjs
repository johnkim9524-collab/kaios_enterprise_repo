// Synthetic inputs only. No URL is fetched and no real rights are created.
import { rawObservation, sealObservation, receiptRegistryFor, NOW } from '../market/current-sold-test-helpers-v1.mjs';
import { canonicalJsonDigest } from '../../../scripts/kidults/market/current-sold-batch-v1.mjs';
export const TEST_IDENTITY = {repository: 'johnkim9524-collab/kaios_enterprise_repo', source_sha: '1'.repeat(40), run_id: 101, run_attempt: 1, trigger_event: 'pull_request'};
export function controlFixture(identity = TEST_IDENTITY, count = 1) {
  const run = `kir-fixture-${identity.run_id}-${identity.run_attempt}`;
  const observations = Array.from({length: count}, (_, index) => sealObservation(rawObservation({
    canonical_object_id: `kir-fixture:object:${index}`,
    source_id: 'kir-fixture-source', source_event_id: `kir-fixture-event-${index}`,
    source_url: `https://kir-fixture.invalid/results/${index}`,
    source_owner: 'KIR SYNTHETIC FIXTURE', venue: 'SYNTHETIC TEST',
    acquisition_receipt_id: `kir-fixture-acq-${index}`, rights_receipt_id: 'kir-fixture-rights',
    source_sha: identity.source_sha, canonical_run_id: run,
  })));
  const receiptRegistry = receiptRegistryFor(...observations);
  return {mode: 'CONTROL_ONLY_SYNTHETIC', identity: {...identity},
    envelope: {schema_version: 'current-sold-batch-envelope-v1', batch_id: 'kir-fixture-batch', created_at: NOW.toISOString(), source_sha: identity.source_sha, canonical_run_id: run, observations},
    receiptRegistry, expectedReceiptRegistryDigest: canonicalJsonDigest(receiptRegistry), now: new Date(NOW),
  };
}
export function rebindRegistry(input) {
  input.expectedReceiptRegistryDigest = canonicalJsonDigest(input.receiptRegistry);
  return input;
}
export function reseal(input) {
  input.envelope.observations = input.envelope.observations.map(sealObservation);
  input.receiptRegistry = receiptRegistryFor(...input.envelope.observations);
  return rebindRegistry(input);
}
