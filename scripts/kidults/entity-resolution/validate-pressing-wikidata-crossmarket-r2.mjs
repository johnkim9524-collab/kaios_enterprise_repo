import fs from 'node:fs/promises';
const p=process.argv[2]||'/tmp/pressing-wikidata-crossmarket-r2.json';
const x=JSON.parse(await fs.readFile(p,'utf8'));
const hex=/^sha256:[a-f0-9]{64}$/;
if(x.id!=='kidults-er-pressing-wikidata-crossmarket-r2'||x.stratum_id!=='er-stratum-pressing-edition-media') throw new Error('ARTIFACT_INVALID');
if(!['CROSS_MARKET_ALIAS_40_REVIEWER_READY_UNLABELED','COMPLETE_FAIL_CLOSED_INSUFFICIENT_CROSS_MARKET_CAPACITY'].includes(x.status)) throw new Error('STATUS_INVALID');
if(x.case_count!==(x.cases||[]).length||x.case_count>40||x.target_case_count!==40) throw new Error('COUNT_INVALID');
if(x.case_class_counts?.CROSS_MARKET_ALIAS!==x.case_count||x.identity_boundary_counts?.SOURCE_RECORD!==x.case_count) throw new Error('CLASS_OR_BOUNDARY_INVALID');
if(x.discogs_api_requests!==0||x.discogs_payloads_collected!==0) throw new Error('DISCOGS_PROVIDER_ACCESS_FORBIDDEN');
if(x.labels_present!==false||x.model_predictions_present!==false||x.reviewer_a!=='NOT_ASSIGNED'||x.reviewer_b!=='NOT_ASSIGNED') throw new Error('REVIEW_TRUTH_INVALID');
if(x.blind_partition_sealed!==false||x.empirical_pass!==false||x.track_b!=='NOT_STARTED'||x.public_release!=='HOLD'||x.production!=='HOLD') throw new Error('DOWNSTREAM_OVERCLAIM');
const q=new Set(),m=new Set(),d=new Set();
for(const c of x.cases||[]){
 if(c.case_class!=='CROSS_MARKET_ALIAS'||c.identity_boundary!=='SOURCE_RECORD'||c.rights_state!=='ALLOW'||c.wikidata_distribution_format!=='Q178588') throw new Error('CASE_SEMANTICS_INVALID');
 if(!/^Q\d+$/.test(c.wikidata_qid)||!/^[0-9a-f-]{36}$/i.test(c.musicbrainz_release_id)||!/^[1-9][0-9]*$/.test(c.discogs_release_id)) throw new Error('IDENTIFIER_INVALID');
 if(q.has(c.wikidata_qid)||m.has(c.musicbrainz_release_id)||d.has(c.discogs_release_id)) throw new Error('CASE_REUSE');q.add(c.wikidata_qid);m.add(c.musicbrainz_release_id);d.add(c.discogs_release_id);
 if(!hex.test(c.source_a_payload_sha256)||!hex.test(c.source_b_payload_sha256)) throw new Error('DIGEST_INVALID');
 if(!Array.isArray(c.license_evidence_refs)||c.license_evidence_refs.length<2||!Array.isArray(c.provenance_refs)||c.provenance_refs.length<4||!c.provenance_refs.some(v=>String(v).includes(':P437:Q178588'))) throw new Error('RIGHTS_OR_PROVENANCE_INVALID');
 if(!Array.isArray(c.reviewer_prompt_context?.musicbrainz_catalog_numbers)||c.reviewer_prompt_context.musicbrainz_catalog_numbers.length<1||!Array.isArray(c.reviewer_prompt_context?.musicbrainz_media_formats)||!c.reviewer_prompt_context.musicbrainz_media_formats.some(v=>String(v).includes('vinyl'))) throw new Error('PRESSING_GRAMMAR_INVALID');
 if(c.label!==null||c.model_prediction!==null||c.reviewer_assignment!=='PENDING_REAL_REVIEWER') throw new Error('LABEL_OR_REVIEWER_OVERCLAIM');
}
console.log(`KIDULTS_PRESSING_WIKIDATA_CROSSMARKET_R2_PASS_${x.case_count}_UNLABELED`);
