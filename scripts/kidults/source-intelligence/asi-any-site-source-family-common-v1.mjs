const norm=v=>String(v||'').toLowerCase();
const has=(t,arr)=>arr.some(k=>t.includes(k));
const museum=['museum','archive','archives','library','institution','heritage','collection database','catalogue raisonne','catalog raisonne'];
const grading=['grading','grader','authentication','authenticate','certification','certified','condition report','appraisal','appraiser'];
const market=['auction','auctioneer','dealer','marketplace','market place','shop','store','buy','sell','resale','consignment'];
const media=['forum','community','news','media','magazine','event','expo','conference','festival','club','society'];
const official=['official','manufacturer','foundation','registry','brand','maker','corporate','company'];
export function classifyAnySiteCandidate(c){
  const t=norm([c.endpoint_url,c.source_name,c.source_owner_hint,c.metadata?.description,c.metadata?.authority_basis,c.metadata?.channel_type,c.metadata?.scope_name].filter(Boolean).join(' '));
  let family='UNCLASSIFIED_ANY_SITE_CANDIDATE',roles=['UNCLASSIFIED_PENDING_RELEVANCE'],confidence='LOW',basis=[];
  const officialGraph=c.discovery_provider==='WIKIDATA_OFFICIAL_WEBSITE_GRAPH';
  if(has(t,museum)){family='MUSEUM_OR_INSTITUTIONAL_CONTEXT';roles=['CATALOG_REFERENCE'];confidence='MEDIUM';basis.push('MUSEUM_OR_INSTITUTIONAL_METADATA_SIGNAL');}
  else if(has(t,grading)){family='GRADING_AUTHENTICATION_OR_CONDITION';roles=['AUTHENTICATION_CONDITION'];confidence='MEDIUM';basis.push('GRADING_OR_AUTHENTICATION_METADATA_SIGNAL');}
  else if(has(t,market)){family='OPEN_MARKETPLACE_OR_DEALER';roles=['LISTING_SUPPLY'];confidence='MEDIUM';basis.push('MARKETPLACE_DEALER_OR_AUCTION_METADATA_SIGNAL');}
  else if(has(t,media)){family='MEDIA_COMMUNITY_OR_EVENT_CONTEXT';roles=['CULTURE_ATTENTION'];confidence='MEDIUM';basis.push('MEDIA_COMMUNITY_OR_EVENT_METADATA_SIGNAL');}
  else if(officialGraph||has(t,official)){family='PRIMARY_OR_OFFICIAL_AUTHORITY';roles=['PRIMARY_AUTHORITY'];confidence=officialGraph?'HIGH':'MEDIUM';basis.push(officialGraph?'WIKIDATA_P856_OFFICIAL_WEBSITE_ASSERTION':'OFFICIAL_AUTHORITY_METADATA_SIGNAL');}
  else basis.push('INSUFFICIENT_METADATA_FOR_CANONICAL_SOURCE_FAMILY');
  const terminal=Boolean(c.terminal_transaction_asserted===true);
  if(!terminal&&roles.includes('SOLD_TRANSACTION'))throw new Error('SOLD_TRANSACTION_WITHOUT_TERMINAL_EVENT');
  return {...c,source_family_hint:family,candidate_source_roles:roles,source_family_classification:{state:family==='UNCLASSIFIED_ANY_SITE_CANDIDATE'?'UNCLASSIFIED_PENDING_MORE_EVIDENCE':'CANDIDATE_CLASSIFIED_METADATA_ONLY',confidence,basis,classification_effect:'CANDIDATE_RELEVANCE_ONLY',rights_effect:'NONE',admission_effect:'NONE',market_claim_effect:'NONE'},terminal_transaction_asserted:terminal};
}
