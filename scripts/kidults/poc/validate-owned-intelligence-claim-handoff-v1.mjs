import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ownedIntelligenceProofIneligibility} from '../source-intelligence/factor-eligibility-v1-lib.mjs';

const evidencePath=process.argv[2];
const outputPath=process.argv[3]||'/tmp/owned-intelligence-claim-handoff-v1.json';
if(!evidencePath) throw new Error('Usage: node validate-owned-intelligence-claim-handoff-v1.mjs <evidence-package.json> [output.json]');

const DERIVED_TYPES=new Set(['VALUATION','LIQUIDITY','SCARCITY','MARKET_DEPTH','MARKET_MATURITY','DEMAND','CONFIDENCE','SOURCE_RELIABILITY','PRICE_INDEX','MARKET_SIGNAL']);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const sha=v=>`sha256:${createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')}`;
const nonempty=v=>typeof v==='string'&&Boolean(v.trim());
const isDerived=claim=>claim?.derivation_origin==='KIDULTS_OWNED_INTELLIGENCE'||DERIVED_TYPES.has(String(claim?.claim_type||'').toUpperCase())||String(claim?.claim_type||'').toUpperCase().startsWith('DERIVED_');
const claimPayload=claim=>Object.fromEntries(Object.entries(claim||{}).filter(([k])=>k!=='hardening_binding'));

const evidence=JSON.parse(await fs.readFile(evidencePath,'utf8'));
const blockers=[];
const derived=[];
for(const claim of evidence.claims||[]){
  if(!isDerived(claim)) continue;
  const id=nonempty(claim.claim_id)?claim.claim_id:'UNNAMED_DERIVED_CLAIM';
  const binding=claim.hardening_binding;
  const payloadDigest=sha(claimPayload(claim));
  const reasons=[];
  if(!nonempty(claim.methodology_ref)) reasons.push('METHODOLOGY_REF_MISSING');
  if(!binding||typeof binding!=='object') reasons.push('HARDENING_BINDING_MISSING');
  else {
    if(binding.claim_id!==id) reasons.push('HARDENING_CLAIM_ID_MISMATCH');
    if(binding.claim_payload_sha256!==payloadDigest) reasons.push('HARDENING_CLAIM_DIGEST_MISMATCH');
    reasons.push(...ownedIntelligenceProofIneligibility(binding.proof));
  }
  if(reasons.length) blockers.push(...reasons.map(r=>`OWNED_INTELLIGENCE_CLAIM_NOT_HARDENED:${id}:${r}`));
  derived.push({claim_id:id,claim_type:claim.claim_type??null,claim_payload_sha256:payloadDigest,state:reasons.length?'HOLD':'PASS',reasons});
}
const result={id:'owned-intelligence-claim-handoff-v1',state:blockers.length?'BLOCKED':'PASS',derived_claim_count:derived.length,blocker_count:blockers.length,blockers:[...new Set(blockers)].sort(),derived_claims:derived,truth_boundary:'Derived KIDULTS-owned intelligence claims require claim-content-bound registered hardening proof before Candidate/Evidence handoff. Raw external facts are not reclassified as derived intelligence by this gate.',production:'HOLD',public:'HOLD',g5:'HOLD'};
await fs.writeFile(outputPath,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({state:result.state,derived_claim_count:result.derived_claim_count,blocker_count:result.blocker_count}));
if(process.env.KAIOS_REQUIRE_OWNED_CLAIM_HARDENED==='1'&&blockers.length) process.exitCode=2;
