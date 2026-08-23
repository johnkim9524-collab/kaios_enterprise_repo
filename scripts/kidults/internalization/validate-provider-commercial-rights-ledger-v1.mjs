import fs from 'node:fs';

const l = JSON.parse(fs.readFileSync('coordination/kidults/internalization/provider-commercial-rights-ledger-v1.json','utf8'));
const errs = [];
if (l.ledger_id !== 'KIDULTS_PROVIDER_COMMERCIAL_RIGHTS_LEDGER_V1') errs.push('invalid ledger id');
if (l.evidence_policy !== 'WRITTEN_OR_OFFICIAL_ONLY_UNKNOWN_NOT_ZERO') errs.push('evidence policy drift');
if (!Array.isArray(l.providers) || l.providers.length < 7) errs.push('expected at least 7 providers');
for (const p of l.providers || []) {
  if (!p.provider_id) errs.push('provider_id required');
  if (!p.evidence_state) errs.push(`${p.provider_id}: evidence_state required`);
  if (!p.commercial) errs.push(`${p.provider_id}: commercial state required`);
  if (!Array.isArray(p.rights_pending)) errs.push(`${p.provider_id}: rights_pending array required`);
  if (!p.activation_state) errs.push(`${p.provider_id}: activation_state required`);
  if (String(p.activation_state).startsWith('HOLD') === false) errs.push(`${p.provider_id}: activation must remain HOLD on current evidence`);
}
const g = l.global_non_bypass || {};
if (g.unknown_rights_may_activate !== false) errs.push('unknown rights activation must be false');
if (g.unknown_price_may_be_zero !== false) errs.push('unknown price cannot be zero');
if (g.email_may_authorize_spend !== false) errs.push('email cannot authorize spend');
if (g.contract_acceptance !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('contract boundary drift');
if (g.credential_activation !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('credential boundary drift');
if (g.production !== 'HOLD') errs.push('production boundary drift');
if (g.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('g5 boundary drift');
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log(JSON.stringify({
  suite:'KIDULTS_PROVIDER_COMMERCIAL_RIGHTS_LEDGER_V1',
  result:'PASS',
  providers:l.providers.length,
  written_provider_records:l.providers.filter(p=>p.evidence_state==='WRITTEN_PROVIDER').length,
  activation:'ALL_HOLD_ON_CURRENT_EVIDENCE',
  production:g.production,
  g5:g.g5
},null,2));
