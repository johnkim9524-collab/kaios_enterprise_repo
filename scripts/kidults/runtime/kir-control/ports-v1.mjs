import { req, requireRecord } from './constants-v1.mjs';

const PORT_KEYS = Object.freeze([
  'evaluateRuntime',
  'buildCurrentSoldBundle',
  'digestJson',
  'digestEvidence',
]);

export function validateControlPorts(ports) {
  requireRecord(ports, PORT_KEYS, 'KIR_BRIDGE_PORTS');
  for (const key of PORT_KEYS) req(typeof ports[key] === 'function', `KIR_BRIDGE_PORT_REQUIRED:${key}`);
  return ports;
}
