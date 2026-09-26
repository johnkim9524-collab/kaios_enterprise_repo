import fs from 'node:fs';

export const AUTHORITY_CHAIN_TRIGGER_CONTRACT_PATH =
  'coordination/kidults/governance/authority-chain-trigger-compatibility-v1.json';

export function loadAuthorityChainTriggerContract(path = AUTHORITY_CHAIN_TRIGGER_CONTRACT_PATH) {
  const contract = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (contract.id !== 'kidults-authority-chain-trigger-compatibility-v1' || contract.version !== '1.0.0') {
    throw new Error('TRIGGER_COMPATIBILITY_CONTRACT_ID_VERSION');
  }
  if (JSON.stringify(contract.allowed_events) !== JSON.stringify(['workflow_run', 'workflow_dispatch'])) {
    throw new Error('TRIGGER_COMPATIBILITY_ALLOWED_EVENTS_DRIFT');
  }
  return contract;
}

export function validateAuthorityChainTriggerCompatibility({ producerEvent, consumerEvent, exactTriggeringRunBound }, contract = loadAuthorityChainTriggerContract()) {
  const allowed = new Set(contract.allowed_events);
  if (!allowed.has(producerEvent)) throw new Error('TRIGGER_COMPATIBILITY_PRODUCER_EVENT_UNREGISTERED');
  if (!allowed.has(consumerEvent)) throw new Error('TRIGGER_COMPATIBILITY_CONSUMER_EVENT_UNREGISTERED');
  if (producerEvent !== consumerEvent) throw new Error('TRIGGER_COMPATIBILITY_EVENT_MISMATCH');
  if (exactTriggeringRunBound !== true) throw new Error('TRIGGER_COMPATIBILITY_EXACT_BINDING_REQUIRED');
  return true;
}
