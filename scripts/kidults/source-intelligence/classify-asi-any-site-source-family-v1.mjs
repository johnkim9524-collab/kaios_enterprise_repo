#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {classifyAnySiteCandidate} from './asi-any-site-source-family-common-v1.mjs';

const input=process.argv[2]||'discovery-out/global-low-risk-discovery.json';
const out=process.argv[3]||'/tmp/asi-any-site-source-family-classification-v1.json';
const x=JSON.parse(fs.readFileSync(input,'utf8'));
const rows=[];const counts={};const roleCounts={};
for(const raw of x.candidates||[]){
  const c=classifyAnySiteCandidate(raw);
  const row={...c,rights_state:'UNASSESSED',admission_state:'NOT_ADMITTED',acquisition_authorized:false,target_site_body_crawled:false,production:'HOLD'};
  rows.push(row);counts[row.source_family_hint]=(counts[row.source_family_hint]||0)+1;for(const r of row.candidate_source_roles)roleCounts[r]=(roleCounts[r]||0)+1;
}
const output={id:'kidults-asi-any-site-source-family-classification-v1',version:'1.1.0',status:'SHADOW_METADATA_ONLY_SOURCE_FAMILY_CLASSIFICATION_COMPLETE',universe_target:'GLOBAL_ANY_SITE_SOURCE_UNIVERSE',universe_restricted_by_classification:false,input_candidate_count:(x.candidates||[]).length,classified_candidate_count:rows.filter(r=>r.source_family_hint!=='UNCLASSIFIED_ANY_SITE_CANDIDATE').length,unclassified_candidate_count:rows.filter(r=>r.source_family_hint==='UNCLASSIFIED_ANY_SITE_CANDIDATE').length,source_family_counts:counts,source_role_counts:roleCounts,candidates:rows,rules:{metadata_only:true,classification_is_candidate_only:true,listing_is_not_sold:true,sold_transaction_requires_terminal_event_assertion:true,unknown_remains_unclassified:true,rights_never_promoted:true,admission_never_promoted:true},acquisition_authorized:false,public_release:'HOLD',production:'HOLD'};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:output.status,input:output.input_candidate_count,classified:output.classified_candidate_count,unclassified:output.unclassified_candidate_count,source_family_counts:counts,production:'HOLD'},null,2));
