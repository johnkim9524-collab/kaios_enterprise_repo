import fs from 'node:fs/promises';

const contract = JSON.parse(await fs.readFile('coordination/kidults/source-intelligence/strict-current-market-admission-gate-v1.json','utf8'));
const collectaio = JSON.parse(await fs.readFile(contract.current_empirical_binding.source_artifact,'utf8'));

if (contract.scope_boundary !== 'COLLECTIBLES_ONLY') throw new Error('SCOPE_BOUNDARY_INVALID');
if (contract.production !== 'HOLD') throw new Error('PRODUCTION_MUST_HOLD');
if (contract.principle !== 'DATED_OBSERVED_SOLD_TRANSACTION_IS_NOT_CURRENT_PRICE_OR_LIQUIDITY') throw new Error('TRUTH_PRINCIPLE_INVALID');

const dated = contract.claim_classes?.DATED_OBSERVED_SOLD_TRANSACTION;
const current = contract.claim_classes?.CURRENT_PRICE;
const liquidity = contract.claim_classes?.LIQUIDITY_OR_TIME_TO_SALE;
if (!dated || !current || !liquidity) throw new Error('CLAIM_CLASS_CONTRACT_MISSING');
if (dated.allows_current_price_claim !== false || dated.allows_liquidity_claim !== false) throw new Error('DATED_SOLD_OVERCLAIM');
for (const key of ['CLAIM_SPECIFIC_FRESHNESS_THRESHOLD_CALIBRATED','CONDITION_OR_GRADE_SEGMENTATION','MINIMUM_SAMPLE_RULE_CALIBRATED']) if (!(current.required || []).includes(key)) throw new Error(`CURRENT_PRICE_REQUIREMENT_MISSING_${key}`);
for (const key of ['EXPOSURE_DENOMINATOR','SALE_OR_CENSOR_END','FAILED_SALE_OR_CENSOR_HANDLING']) if (!(liquidity.required || []).includes(key)) throw new Error(`LIQUIDITY_REQUIREMENT_MISSING_${key}`);

if (collectaio.status !== 'ADMITTED_SHADOW_INTERNAL_ONLY') throw new Error('COLLECTAIO_SHADOW_ADMISSION_EXPECTED');
if (collectaio.admitted_cell?.admitted_evidence_class !== 'DATED_OBSERVED_SOLD_TRANSACTION') throw new Error('COLLECTAIO_DATED_CLASS_EXPECTED');
if (collectaio.admission_decision?.internal_market_analysis !== 'PASS_FOR_DATED_TRANSACTION_EVENT_ONLY') throw new Error('COLLECTAIO_INTERNAL_DATED_ONLY_EXPECTED');
if (collectaio.admission_decision?.public_or_commercial_projection !== 'HOLD') throw new Error('COLLECTAIO_PUBLIC_PROJECTION_MUST_HOLD');

const blocked = new Set(collectaio.prohibited_claims || []);
for (const claim of ['CURRENT_PRICE','REPRESENTATIVE_PRICE','LIQUIDITY','TIME_TO_SALE','GLOBAL_DEMAND','GLOBAL_REPRESENTATIVENESS','CONDITION_ADJUSTED_VALUE','PUBLIC_OR_COMMERCIAL_PROJECTION']) if (!blocked.has(claim)) throw new Error(`COLLECTAIO_BLOCKED_CLAIM_MISSING_${claim}`);

if (contract.current_empirical_binding.expected_classification !== 'DATED_ONLY_NOT_STRICT_CURRENT') throw new Error('CURRENT_BINDING_CLASSIFICATION_INVALID');
if (contract.current_empirical_binding.strict_current_price_eligible !== false || contract.current_empirical_binding.liquidity_eligible !== false || contract.current_empirical_binding.public_or_commercial_projection_eligible !== false) throw new Error('CURRENT_BINDING_MUST_FAIL_CLOSED');

console.log(JSON.stringify({status:'PASS_FAIL_CLOSED',validator:'KIDULTS_STRICT_CURRENT_MARKET_ADMISSION_GATE_V1',current_empirical_source:collectaio.id,classification:'DATED_ONLY_NOT_STRICT_CURRENT',strict_current_price_eligible:false,liquidity_eligible:false,public_or_commercial_projection_eligible:false,production:'HOLD'},null,2));
