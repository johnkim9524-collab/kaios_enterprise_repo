import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const gatePath = path.join(root, 'coordination/kidults/governance/track-z-money-to-usable-data-gate-v1.json');

export function validateGate(gate) {
  const errors = [];
  const require = (condition, code) => { if (!condition) errors.push(code); };
  const chain = ['PAYMENT', 'ACCESS', 'INPUT', 'DATA', 'RIGHTS', 'PRODUCT'];
  require(gate?.status === 'MANDATORY_FAIL_CLOSED', 'STATUS');
  require(JSON.stringify(gate?.required_chain) === JSON.stringify(chain), 'CHAIN');
  for (const link of chain) require(Array.isArray(gate?.links?.[link]) && gate.links[link].length > 0, `LINK_${link}`);
  require(gate?.prepayment_policy?.all_links_required === true, 'ALL_LINKS');
  require(gate?.prepayment_policy?.unknown_or_ambiguous_fails_closed === true, 'UNKNOWN_FAIL_CLOSED');
  require(gate?.prepayment_policy?.paid_trial_before_gate_pass_forbidden === true, 'PAID_TRIAL');
  require(gate?.prepayment_policy?.auto_converting_trial_before_gate_pass_forbidden === true, 'AUTO_CONVERT');
  require(gate?.prepayment_policy?.consumer_membership_is_data_license === false, 'CONSUMER_LICENSE');
  require(gate?.prepayment_policy?.token_or_http_success_is_usable_data_proof === false, 'TOKEN_PROOF');
  require(gate?.prepayment_policy?.missing_link_state === 'NO_PAY_HOLD', 'MISSING_LINK_STATE');
  require(gate?.ready_for_spend_review_grants_spend_authority === false, 'SPEND_AUTHORITY');
  for (const protectedGate of ['SPEND', 'CONTRACT', 'EXPANDED_CREDENTIAL', 'PUBLIC', 'PRODUCTION', 'G5']) {
    require(gate?.protected_gates?.includes(protectedGate), `PROTECTED_${protectedGate}`);
  }
  require(gate?.production === 'HOLD' && gate?.public_release === 'HOLD' && gate?.g5 === 'HOLD', 'RELEASE_HOLD');
  return errors;
}

export function validateBindings(gate, sourcing, agents, strategy) {
  const errors = [];
  const doc = 'docs/strategy/TRACK_Z_MONEY_TO_USABLE_DATA_GATE_V1.md';
  const machine = 'coordination/kidults/governance/track-z-money-to-usable-data-gate-v1.json';
  if (!sourcing?.mandatory_strategy_addenda?.includes(doc)) errors.push('SOURCING_DOC_BINDING');
  if (!sourcing?.machine_readable_strategy_addenda?.includes(machine)) errors.push('SOURCING_MACHINE_BINDING');
  if (sourcing?.money_to_usable_data_gate?.missing_or_unknown_state !== 'NO_PAY_HOLD') errors.push('SOURCING_FAIL_CLOSED');
  if (!agents.includes(machine) || !agents.includes('NO_PAY_HOLD')) errors.push('AGENT_BOOTSTRAP_BINDING');
  if (!strategy.includes(machine) || !strategy.includes('PAYMENT -> ACCESS -> INPUT -> DATA -> RIGHTS -> PRODUCT')) errors.push('STRATEGY_BINDING');
  if (gate?.control_incident?.rights_expansion_authorized !== false || gate?.control_incident?.additional_spend_authorized !== false) errors.push('PSA_INCIDENT_BOUNDARY');
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const gate = JSON.parse(fs.readFileSync(gatePath, 'utf8'));
  const sourcing = JSON.parse(fs.readFileSync(path.join(root, 'coordination/kidults/governance/ih-group-provider-sourcing-contract-v1.json'), 'utf8'));
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  const strategy = fs.readFileSync(path.join(root, 'docs/strategy/IH_GROUP_GLOBAL_PROVIDER_STRATEGY_V6.md'), 'utf8');
  const errors = [...validateGate(gate), ...validateBindings(gate, sourcing, agents, strategy)];
  if (errors.length) {
    console.error(JSON.stringify({ state: 'VERIFIED_FAIL', errors }));
    process.exit(1);
  }
  console.log(JSON.stringify({ state: 'VERIFIED_PASS', gate: gate.id, chain: gate.required_chain }));
}
