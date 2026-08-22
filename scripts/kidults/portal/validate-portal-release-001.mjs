import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const base='apps/kidults-enterprise-staging/public/portal-r001';
const errors=[];
const read=relativePath=>{
  const file=path.join(root,relativePath);
  if(!fs.existsSync(file)){errors.push(`missing ${relativePath}`);return ''}
  return fs.readFileSync(file,'utf8');
};
const parseJson=relativePath=>{
  try{return JSON.parse(read(relativePath)||'{}')}catch(error){errors.push(`invalid JSON ${relativePath}: ${error.message}`);return {}}
};
const requireMarkers=(content,markers,label)=>markers.forEach(marker=>{if(!content.includes(marker))errors.push(`${label} missing ${marker}`)});

const routeFiles=['index.html','markets.html','vertical.html','objects.html','object.html','kidult-100.html','research.html','workspace.html','governance.html'];
const routeHtml=Object.fromEntries(routeFiles.map(file=>[file,read(`${base}/${file}`)]));
const html=routeHtml['index.html'];
const objectHtml=routeHtml['object.html'];
const combinedHtml=Object.values(routeHtml).join('\n');
const css=read(`${base}/portal-platform-final.css`);
const js=read(`${base}/portal-release-001.js`);
const store=read(`${base}/projection-store.js`);
const objectJs=read(`${base}/object-intelligence.js`);
const server=read('apps/kidults-enterprise-staging/server.mjs');
const fixture=parseJson(`${base}/data/projection-control-fixture.json`);
const matrix=parseJson(`${base}/data/negative-state-matrix.json`);
const contentContract=parseJson(`${base}/data/projection-content-contract-v1.json`);
const productArchitecture=parseJson(`${base}/data/portal-product-architecture-v1.json`);

requireMarkers(html,[
  'data-release="portal-release-001"','data-state="NO_PROJECTION"','GLOBAL COLLECTIBLES INTELLIGENCE',
  'EIGHT CORE VERTICALS','Read the market.','Know the evidence.','Kidult 100','EVIDENCE & METHODOLOGY',
  'Workspace','Object Intelligence','SAFE AUDIT PROJECTION','data-release-state','data-rights','data-object-state',
  'data-object-identity','data-object-market','data-object-comparables','data-object-evidence','data-object-rights','data-object-limitations',
  'data-projection-freshness','data-research-state','data-research-record','data-content-surface="overview"',
  'class="nav-toggle"','id="primary-nav"','class="platform-footer"'
],'portal HTML');
requireMarkers(objectHtml,['Object Intelligence / Dossier','Identity','Market Observations','Comparables','Evidence','Rights','Known Limitations','data-object-state','portal-release-001.js'],'object detail route');
for(const route of routeFiles)requireMarkers(routeHtml[route],['class="platform-header"','class="primary-nav"','class="platform-footer"','portal-platform-final.css','portal-release-001.js'],`${route} shell`);

for(const legacy of ['data-release="v502"','V6 RC','THE GLOBAL STANDARD FOR COLLECTIBLES INTELLIGENCE']){
  if(html.includes(legacy)||objectHtml.includes(legacy))errors.push(`legacy/customer-facing marker present: ${legacy}`);
}

for(const [route,content] of Object.entries(routeHtml)){
  const styles=[...content.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(match=>match[1]);
  if(styles.length!==1||styles[0]!=='portal-platform-final.css')errors.push(`${route} must load exactly one final design stylesheet; observed ${styles.join(', ')||'none'}`);
}
requireMarkers(css,[
  '--forest:#08251c','--ivory:#f4f0e8','--serif:Georgia,"Times New Roman",serif','--sans:Inter,ui-sans-serif,system-ui','font-size:22px','font-weight:750','letter-spacing:.34em','text-indent:.34em',
  '.footer-wordmark','font-size:16px','letter-spacing:.28em','@media(max-width:900px)','@media(max-width:620px)',
  '.product-grid','.object-dossier','.workspace-board','.audit-ledger','.lens-switch'
],'final platform CSS');
if(/#c9ff39|#c6d96a|lime|neon/i.test(css))errors.push('bright lime/neon accent present');
if(/html\s*,?\s*body[^}]*overflow-x\s*:\s*hidden/i.test(css))errors.push('global overflow-x hiding must not mask responsive defects');
if(/\[data-(?:rights|release-state)\][^}]*display\s*:\s*none/is.test(css))errors.push('critical rights/release state must remain visible');

const fakeMetrics=['50+','250K+','100M+','1,248.7','+3.7%'];
const customerSurface=`${combinedHtml}\n${js}`;
for(const fake of fakeMetrics)if(customerSurface.includes(fake))errors.push(`unsupported customer-facing metric present: ${fake}`);
if(/number\s+seven|racing\s+number|>\s*7\s*</i.test(html))errors.push('removed racing number remains in customer-facing HTML');
if(/class="sign-in[^\"]*search|class="search[^\"]*sign-in|class="sign-in"[^>]*disabled/i.test(html))errors.push('institutional sign-in must not be Projection-gated');

const heroRelative='assets/hero/portal-r001-roadster-final.webp';
const heroPath=path.join(root,base,heroRelative);
if(!html.includes(heroRelative))errors.push('approved roadster hero is not referenced');
if(!fs.existsSync(heroPath)){
  errors.push('approved roadster WebP missing');
}else{
  const bytes=fs.readFileSync(heroPath);
  const riff=bytes.subarray(0,4).toString('ascii');
  const webp=bytes.subarray(8,12).toString('ascii');
  const chunk=bytes.subarray(12,16).toString('ascii');
  if(riff!=='RIFF'||webp!=='WEBP'||chunk!=='VP8 ')errors.push(`hero is not a valid lossy WebP container (${riff}/${webp}/${chunk})`);
  if(bytes.length<30000)errors.push(`hero asset unexpectedly small (${bytes.length} bytes)`);
  if(chunk==='VP8 '&&bytes.length>=30){
    const frameOffset=20;
    const signature=bytes.subarray(frameOffset+3,frameOffset+6).toString('hex');
    const width=bytes.readUInt16LE(frameOffset+6)&0x3fff;
    const height=bytes.readUInt16LE(frameOffset+8)&0x3fff;
    if(signature!=='9d012a'||width<1800||height<800)errors.push(`hero frame invalid or undersized (${signature}, ${width}x${height})`);
    if(!html.includes(`width="${width}"`)||!html.includes(`height="${height}"`))errors.push(`hero intrinsic HTML dimensions do not match ${width}x${height}`);
  }
}
if(!server.includes('".webp": "image/webp"'))errors.push('staging server WebP MIME binding missing');

for(const asset of ['verticals-v4.svg']){
  const relative=`${base}/assets/cards/${asset}`;
  const svg=read(relative);
  if(!svg.includes('<svg')||!svg.includes('viewBox=')||!svg.includes('<title'))errors.push(`premium card asset invalid: ${asset}`);
  if(!css.includes(`assets/cards/${asset}`))errors.push(`premium card asset not referenced: ${asset}`);
}

requireMarkers(store,['portal-read-contract-001','normalizeIntelligenceState','normalizeStructuralState','normalizeReleaseState','live_envelope_requires','content_surfaces','LIVE_RIGHTS','LIVE_FRESHNESS','LIVE_RECOMMENDATIONS','LIVE_CONFIDENCE','LIVE_COVERAGE','LIVE_INDEPENDENCE','LIVE_MAX_AGE_MS','FIXTURE_LIVE_ATTEMPT','validDigest','strictIso','parsedStrictIso','validLiveDate','validDisplayScalar','uniqueNonEmpty','liveContentComplete','auditBound','synthetic===false','overall_rankability===true','raw_provider_payloads:false','credentials:false','track_b_bypass:false'],'projection store');
requireMarkers(js,['readPortalProjection','renderObjectIntelligence','renderVerticals','renderSignals','renderKidult100','renderResearch','renderEvidence','renderAudit','gateWorkspace','initializeNavigation','renderFailure'],'portal runtime');
requireMarkers(objectJs,['renderObjectIntelligence','normalizeIntelligenceState','LIVE_APPROVED','data-object-identity','data-object-market','data-object-comparables','data-object-evidence','data-object-rights','data-object-limitations'],'object runtime');
if(js.includes('tabindex="0"')||objectJs.includes('tabindex="0"'))errors.push('runtime creates artificial non-interactive tab stops');

if(fixture.fixture_type!=='NON_PROMOTABLE_CONTROL')errors.push('fixture must be NON_PROMOTABLE_CONTROL');
if(fixture?.projection?.state!=='NO_PROJECTION')errors.push('fixture must remain NO_PROJECTION');
if(fixture?.projection?.projection_id!==null)errors.push('fixture must not invent projection_id');
if(fixture?.structural?.core_verticals?.state!=='AVAILABLE')errors.push('core vertical structural state must be AVAILABLE');
if(fixture?.release?.state!=='HOLD')errors.push('release state must remain HOLD');
if(!fixture.evidence_methodology||fixture?.evidence_methodology?.rights!=='Fail-closed until admissible')errors.push('fixture evidence/methodology boundary missing');
if(!Array.isArray(fixture.verticals)||fixture.verticals.length!==8||fixture.verticals.some(item=>!item.vertical_id||!item.label||item.structural_state!=='AVAILABLE'))errors.push('fixture must define eight structured core verticals');
const invalidOverview=(fixture.overview||[]).filter(item=>(item.state_type||'intelligence')==='intelligence'&&['STRUCTURAL','HOLD','AVAILABLE'].includes(item.state));
if(invalidOverview.length)errors.push('overview mixes non-intelligence states into intelligence state type');

const expectedStates=['NO_PROJECTION','WAITING','STALE','INVALID','RIGHTS_BLOCKED','NOT_AVAILABLE','LIVE_APPROVED'];
const matrixRows=matrix.states||[];
for(const state of expectedStates){
  const row=matrixRows.find(item=>item.state===state);
  if(!row)errors.push(`negative-state matrix missing ${state}`);
  else if(state!=='LIVE_APPROVED'&&row.workspace!=='BLOCKED')errors.push(`${state} must block workspace`);
}
if(matrix.fixture_type!=='NON_PROMOTABLE_CONTROL_MATRIX')errors.push('negative-state matrix must be non-promotable');
for(const forbidden of ['api_key','credential','raw_token'])if(JSON.stringify(fixture).toLowerCase().includes(forbidden))errors.push(`fixture leaks forbidden field ${forbidden}`);

const expectedSurfaces=['overview','core_verticals','object_intelligence','market_signals','kidult_100','research_archive','evidence_methodology','safe_audit','workspace'];
if(contentContract.id!=='kidults-portal-r001-projection-content-v1'||contentContract.read_boundary!=='GOVERNED_PROJECTION_ONLY')errors.push('projection content contract identity/boundary invalid');
const observedSurfaces=Array.isArray(contentContract.surfaces)?contentContract.surfaces.map(item=>item.id):[];
if(JSON.stringify(observedSurfaces)!==JSON.stringify(expectedSurfaces))errors.push(`projection content surfaces must be exact and ordered: ${expectedSurfaces.join(', ')}`);
for(const id of expectedSurfaces){
  const surface=contentContract.surfaces?.find(item=>item.id===id);
  if(!surface||!Array.isArray(surface.content)||!surface.content.length||!surface.blocked_render)errors.push(`projection content surface incomplete: ${id}`);
}
for(const binding of ['projection_id','assessment_id','replay_id','exact_pair_digest','correlation_id','as_of','freshness','rights_state'])if(!contentContract?.binding?.projection_required?.includes(binding))errors.push(`projection content binding missing ${binding}`);
for(const binding of ['projection_id','assessment_id','replay_id','exact_pair_digest','correlation_id'])if(!contentContract?.binding?.audit_must_match?.includes(binding))errors.push(`audit content binding missing ${binding}`);
if(contentContract?.display_policy?.missing_never_zero!==true||contentContract?.display_policy?.no_synthetic_fallback!==true||contentContract?.display_policy?.no_static_market_trend!==true)errors.push('projection content display policy is not fail-closed');
if(contentContract?.binding?.freshness_max_age_days!==31||contentContract?.binding?.timestamp_format!=='STRICT_UTC_ISO_8601')errors.push('projection freshness/timestamp contract is incomplete');
const vocabulary=contentContract?.binding?.controlled_vocabulary||{};
if(JSON.stringify(vocabulary.confidence)!==JSON.stringify(['HIGH','MEDIUM'])||JSON.stringify(vocabulary.evidence_coverage)!==JSON.stringify(['COMPLETE','SUFFICIENT','BOUNDED'])||JSON.stringify(vocabulary.source_owner_independence)!==JSON.stringify(['VERIFIED','MULTI_SOURCE_VERIFIED','SOURCE_OWNER_INDEPENDENT']))errors.push('projection controlled vocabulary contract is incomplete');
const integrity=contentContract?.binding?.integrity_rules||{};
for(const field of ['vertical_id','signal_id','object_id','research_id','snapshot_id'])if(!integrity.unique_ids?.includes(field))errors.push(`projection uniqueness contract missing ${field}`);
for(const field of ['aliases','evidence_refs','kidult_100.constituents'])if(!integrity.unique_record_arrays?.includes(field))errors.push(`projection record-array uniqueness missing ${field}`);
if(integrity?.nullable_scalars?.['kidult_100.change']!=='NULL_OR_FINITE_NUMBER')errors.push('Kidult 100 change scalar contract missing');
for(const surface of expectedSurfaces){
  if(surface==='research_archive'&&combinedHtml.includes('data-content-surface="evidence_methodology research_archive"'))continue;
  if(!combinedHtml.includes(`data-content-surface="${surface}`))errors.push(`portal surface is not represented in the platform routes: ${surface}`);
}

if(productArchitecture.id!=='kidults-autonomous-global-intelligence-platform-portal-v1'||productArchitecture.experience_baseline!=='V502_EVOLVED')errors.push('final product architecture identity/baseline invalid');
for(const route of routeFiles)if(!productArchitecture.routes?.some(item=>item.path===route))errors.push(`product architecture missing route ${route}`);
for(const audience of ['collector','institutional'])if(!Array.isArray(productArchitecture?.audiences?.[audience])||!productArchitecture.audiences[audience].length)errors.push(`product architecture missing ${audience} lens`);
if(productArchitecture?.card_system?.max_cards_per_desktop_row>3||productArchitecture?.card_system?.minimum_body_px<16||productArchitecture?.card_system?.minimum_metadata_px<12)errors.push('final card/typography policy is below premium minimum');
if(productArchitecture?.truth_boundary?.governed_projection_only!==true||productArchitecture?.truth_boundary?.portal_calculation_allowed!==false||productArchitecture?.truth_boundary?.synthetic_fallback!==false)errors.push('final product architecture truth boundary invalid');

if(errors.length){
  console.error(`Portal Release-001 premium-v4 validation FAIL (${errors.length})`);
  errors.forEach(error=>console.error('ERROR:',error));
  process.exit(1);
}

console.log('Portal Release-001 final-platform validation PASS — V502-evolved multi-route products, sharp roadster hero, collector/institutional market lenses, governed Projection semantics and fail-closed boundaries.');
