import { FIXTURE_PREFIX, req } from './constants-v1.mjs';
import { jsonSnapshot, snapshotAndValidatePayload, validateControlOptions } from './input-v1.mjs';
import { buildControlReceipt } from './receipt-v1.mjs';
import { validateControlPorts } from './ports-v1.mjs';

export function executeKirCurrentSoldControl(options, ports) {
  validateControlPorts(ports);
  validateControlOptions(options);
  const identity = jsonSnapshot(options.identity);
  // Re-evaluate the exact on-disk KIR contract; detached receipts are not inputs.
  const runtime = ports.evaluateRuntime(identity);
  req(runtime.state === 'CONTROL_VALIDATED_EMPIRICAL_BLOCKED', 'KIR_BRIDGE_KIR_CONTROL_STATE');
  const { envelope, registry, now } = snapshotAndValidatePayload(options, identity, ports.digestJson);
  const run = `${FIXTURE_PREFIX}${identity.run_id}-${identity.run_attempt}`;
  const bundle = ports.buildCurrentSoldBundle(envelope, registry, {
    now,
    expectedReceiptRegistryDigest: options.expectedReceiptRegistryDigest,
  });
  req(bundle.receipt.source_sha === identity.source_sha && bundle.receipt.canonical_run_id === run,
    'KIR_BRIDGE_ENGINE_BINDING');
  req(bundle.receipt.receipt_registry_digest === options.expectedReceiptRegistryDigest,
    'KIR_BRIDGE_ENGINE_REGISTRY_DIGEST');
  req(bundle.receipt.evidence_digest === ports.digestEvidence(bundle.evidence),
    'KIR_BRIDGE_EVIDENCE_DIGEST');
  req(bundle.receipt.event_versions_digest === ports.digestJson(bundle.event_versions),
    'KIR_BRIDGE_EVENT_DIGEST');
  const pass = bundle.admission.status === 'PASS';
  if (!pass) {
    req(bundle.admission.admitted_count === 0 && bundle.evidence.length === 0
      && bundle.event_versions.length === 0, 'KIR_BRIDGE_PARTIAL_OUTPUT_ESCAPE');
  }
  for (const evidence of bundle.evidence) {
    req(evidence.lineage.source_sha === identity.source_sha
      && evidence.lineage.canonical_run_id === run, 'KIR_BRIDGE_EVIDENCE_BINDING');
  }
  return buildControlReceipt({
    identity,
    runtime,
    bundle,
    registryDigest: options.expectedReceiptRegistryDigest,
    digests: {
      syntheticTestClock: now.toISOString(),
      kirReceipt: ports.digestJson(runtime),
      bundleReceipt: ports.digestJson(bundle.receipt),
    },
  });
}
