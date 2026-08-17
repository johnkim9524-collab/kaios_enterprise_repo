#!/usr/bin/env node
import fs from 'node:fs';
const p='coordination/kidults/source-intelligence/asi-v2-1-official-preflight-observation-v1.json';
const d=JSON.parse(fs.readFileSync(p,'utf8'));
const fail=x=>{throw new Error(x)};
if(d.observations?.length!==2)fail('expected 2 official preflight observations');
if(d.summary?.source_qualified!==0)fail('preflight must not self-qualify Source');
if(d.summary?.acquisition_authorized!==0)fail('preflight must not authorize acquisition');
if(d.summary?.unknown_promoted_as_trusted!==0)fail('unknown trust shortcut');
const wd=d.observations.find(x=>x.candidate_id==='BMW_R90S_WIKIDATA');
const ze=d.observations.find(x=>x.candidate_id==='STADIUM_EVENTS_ZENODO_DATACITE');
if(wd?.primary_authority!==false||wd?.qualification_state!=='PREFLIGHT_PASS_METADATA_ONLY_NOT_SOURCE_QUALIFIED')fail('Wikidata role/qualification boundary regression');
if(ze?.qualification_state!=='HOLD_CONTENT_RIGHTS_AND_LINEAGE_REVIEW_REQUIRED')fail('Zenodo content rights must remain HOLD');
if(d.production!=='HOLD')fail('production boundary regression');
console.log(JSON.stringify({status:'PASS',preflighted:2,metadata_only_pass:1,content_rights_hold:1,source_qualified:0,production:d.production},null,2));
