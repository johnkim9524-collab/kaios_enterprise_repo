import fs from 'node:fs/promises';

const [corpusPath,outPath='/tmp/variant-observed-corpus-capacity-r3.json']=process.argv.slice(2);
if(!corpusPath) throw new Error('usage: probe-variant-observed-corpus-capacity-r3 <pressing-corpus> [out]');
const corpus=JSON.parse(await fs.readFile(corpusPath,'utf8'));
if(corpus.id!=='kidults-er-pressing-source-corpus-r1'||corpus.record_count!==240||corpus.data_rights_state!=='ALLOW') throw new Error('PROVEN_240_RECORD_CORPUS_REQUIRED');
const rows=(corpus.records||[]).map(r=>({
  id:r.source_record_id,
  ref:r.source_reference,
  digest:r.source_payload_sha256,
  group:r.payload?.release_group?.release_group_mbid,
  barcode:String(r.payload?.barcode||''),
  catalogs:(r.payload?.label_catalog_numbers||[]).map(x=>`${x.label_mbid}:${x.catalog_number}`).sort(),
  country:String(r.payload?.country||''),date:String(r.payload?.release_date||''),
  media:(r.payload?.media||[]).map(x=>`${x.format}:${x.track_count}`).sort(),
  rights:r.rights_state,
  license:r.license_evidence_refs,
  provenance:r.provenance_refs
})).filter(x=>x.id&&x.group&&x.ref&&x.digest&&x.rights==='ALLOW');
const byGroup=new Map();for(const r of rows){if(!byGroup.has(r.group))byGroup.set(r.group,[]);byGroup.get(r.group).push(r);}
const signature=r=>JSON.stringify({barcode:r.barcode,catalogs:r.catalogs,country:r.country,date:r.date,media:r.media});
const raw=[];for(const [group,rs] of [...byGroup.entries()].sort()){const u=[...new Map(rs.map(x=>[x.id,x])).values()].sort((a,b)=>a.id.localeCompare(b.id));for(let i=0;i<u.length;i++)for(let j=i+1;j<u.length;j++){if(signature(u[i])===signature(u[j]))continue;raw.push({group,left:u[i],right:u[j]});}}
raw.sort((a,b)=>`${a.group}:${a.left.id}:${a.right.id}`.localeCompare(`${b.group}:${b.left.id}:${b.right.id}`));
const used=new Set(),hard=[];for(const p of raw){if(used.has(p.left.id)||used.has(p.right.id))continue;hard.push(p);used.add(p.left.id);used.add(p.right.id);if(hard.length===40)break;}
const normalization=[];for(const r of rows.sort((a,b)=>a.id.localeCompare(b.id))){if(used.has(r.id))continue;normalization.push(r);used.add(r.id);if(normalization.length===40)break;}
const normCandidates=normalization.map((r,i)=>({candidate_id:`variant-r3-normalization-${String(i+1).padStart(3,'0')}`,case_class:'SAME_OBJECT_NORMALIZATION',identity_boundary:'SOURCE_RECORD',source_record_ids:[r.id],source_reference:r.ref,source_payload_sha256:r.digest,release_group_mbid:r.group,rights_state:'ALLOW',license_evidence_refs:r.license,provenance_refs:r.provenance}));
const hardCandidates=hard.map((p,i)=>({candidate_id:`variant-r3-hard-${String(i+1).padStart(3,'0')}`,case_class:'HARD_NEGATIVE',identity_boundary:'PHYSICAL_OBJECT',source_record_ids:[p.left.id,p.right.id],left_reference:p.left.ref,right_reference:p.right.ref,left_payload_sha256:p.left.digest,right_payload_sha256:p.right.digest,release_group_mbid:p.group,left_variant_signature:signature(p.left),right_variant_signature:signature(p.right),rights_state:'ALLOW',license_evidence_refs:[...new Set([...(p.left.license||[]),...(p.right.license||[])])],provenance_refs:[...new Set([...(p.left.provenance||[]),...(p.right.provenance||[])])]}));
const metrics={observed_corpus_records:rows.length,distinct_release_groups:byGroup.size,repeated_release_groups:[...byGroup.values()].filter(x=>new Set(x.map(r=>r.id)).size>=2).length,raw_same_group_variant_pairs:raw.length,hard_negative_source_disjoint_capacity:hardCandidates.length,same_object_normalization_source_disjoint_capacity:normCandidates.length,cross_market_alias_capacity:0,conservative_reviewer_ready_capacity:hardCandidates.length+normCandidates.length,full_120_ready:false};
const blockers=[];if(normCandidates.length<40)blockers.push(`SAME_OBJECT_NORMALIZATION_${normCandidates.length}_OF_40`);if(hardCandidates.length<40)blockers.push(`HARD_NEGATIVE_${hardCandidates.length}_OF_40`);blockers.push('CROSS_MARKET_ALIAS_0_OF_40_INDEPENDENT_AUTHORITY_REQUIRED');
const artifact={id:'kidults-er-variant-observed-corpus-capacity-r3',version:'3.0.0',status:'COMPLETE_FAIL_CLOSED_PARTIAL_CAPACITY',parent_issue:641,stratum_id:'er-stratum-variant-release-heavy',source_id:'musicbrainz-core-catalog',source_corpus_sha256:corpus.source_corpus_sha256,rights_state:'ALLOW',acquisition_transport_state:corpus.acquisition_transport_state,candidate_pools:{SAME_OBJECT_NORMALIZATION:normCandidates,HARD_NEGATIVE:hardCandidates,CROSS_MARKET_ALIAS:[]},metrics,blockers,labels_present:false,reviewers_assigned:0,empirical_cases_created:0,blind_partition_sealed:false,track_b:'NOT_STARTED',public_release:'HOLD',production:'HOLD',truth_boundary:'R3 measures variant capacity only from the already-proven 240-record MusicBrainz corpus. Same release-group distinct releases with different retained release-level signatures support HARD_NEGATIVE material; normalization uses distinct source records not consumed by hard negatives. CROSS_MARKET_ALIAS remains zero without independent authority. No labels, empirical PASS, Track B, publication or Production are created.'};
await fs.writeFile(outPath,JSON.stringify(artifact,null,2)+'\n');
console.log(JSON.stringify({status:artifact.status,metrics,blockers,production:'HOLD'},null,2));
