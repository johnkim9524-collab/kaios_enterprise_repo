import {readPortalProjection,normalizeIntelligenceState,normalizeReleaseState} from './projection-store.js';
import {renderObjectIntelligence} from './object-intelligence.js';

const query=(selector,root=document)=>root.querySelector(selector);
const queryAll=(selector,root=document)=>[...root.querySelectorAll(selector)];
const BLOCKING_STATES=new Set(['WAITING','STALE','INVALID','RIGHTS_BLOCKED','NOT_AVAILABLE','NO_PROJECTION']);
const display=value=>value==null||value===''?'—':String(value);
const stateLabel=value=>display(value).replaceAll('_',' ');

function write(selector,value){queryAll(selector).forEach(node=>{node.textContent=value})}

function initializeNavigation(){
  const header=query('[data-site-header]');
  const toggle=query('.nav-toggle');
  if(!header||!toggle)return;
  const close=()=>{header.dataset.open='false';toggle.setAttribute('aria-expanded','false')};
  toggle.addEventListener('click',()=>{
    const open=header.dataset.open!=='true';
    header.dataset.open=String(open);
    toggle.setAttribute('aria-expanded',String(open));
  });
  queryAll('#primary-nav a').forEach(link=>link.addEventListener('click',close));
  document.addEventListener('keydown',event=>{if(event.key==='Escape')close()});
  globalThis.addEventListener('resize',()=>{if(globalThis.innerWidth>900)close()},{passive:true});
}

function initializeAudienceLens(){
  const buttons=queryAll('[data-lens]');
  if(!buttons.length)return;
  const apply=lens=>{
    buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.lens===lens)));
    queryAll('[data-lens-panel]').forEach(panel=>{panel.hidden=panel.dataset.lensPanel!==lens});
    write('[data-lens-title]',lens==='institutional'?'Institutional market structure':'Collector market context');
    write('[data-lens-description]',lens==='institutional'?'Universe coverage, venue depth, turnover, concentration, portfolio exposure and auditability across the collectible market.':'Price direction, activity, liquidity, scarcity and evidence confidence across the collectible universe.');
  };
  buttons.forEach(button=>button.addEventListener('click',()=>apply(button.dataset.lens)));
  apply(buttons.find(button=>button.getAttribute('aria-pressed')==='true')?.dataset.lens||'collector');
}

function bindHero(){
  const image=query('.hero-image');
  if(!image)return;
  image.alt='Deep green vintage roadster in a curated warm stone gallery';
  image.decoding='async';
  image.fetchPriority='high';
}

function gateWorkspace(state){
  const blocked=BLOCKING_STATES.has(state);
  queryAll('.workspace-grid article').forEach(card=>{
    card.dataset.access=blocked?'blocked':'available';
    card.setAttribute('aria-disabled',String(blocked));
  });
}

function renderVerticals(verticals=[]){
  const root=query('[data-vertical-grid]');
  if(!root)return;
  root.replaceChildren(...verticals.slice(0,8).map(vertical=>{
    const tile=document.createElement('a');
    tile.className='vertical-tile';
    tile.href=`vertical.html?id=${encodeURIComponent(vertical&&typeof vertical==='object'?vertical.vertical_id:String(vertical))}`;
    const label=document.createElement('span');
    label.textContent=vertical&&typeof vertical==='object'?display(vertical.label):display(vertical);
    if(vertical&&typeof vertical==='object')tile.dataset.verticalId=vertical.vertical_id;
    tile.append(label);
    return tile;
  }));
}

function renderSignals(signals=[],state){
  const root=query('[data-signal-grid]');
  if(!root)return;
  root.replaceChildren(...signals.slice(0,6).map(signal=>{
    const item=document.createElement('span');
    item.className='signal-item';
    const label=document.createElement('small');
    const status=document.createElement('b');
    const meta=document.createElement('em');
    const structured=signal&&typeof signal==='object';
    label.textContent=structured?display(signal.label):display(signal);
    const signalLive=state==='LIVE_APPROVED'&&structured&&normalizeIntelligenceState(signal.state)==='LIVE_APPROVED';
    status.textContent=signalLive&&signal.value!=null?display(signal.value):signalLive?'Projection-bound':'Not verified';
    const evidenceCount=signalLive&&Array.isArray(signal.evidence_refs)?signal.evidence_refs.length:0;
    meta.textContent=signalLive?`${display(signal.confidence)} · ${evidenceCount} evidence · ${display(signal.as_of)}`:'Evidence required';
    item.append(label,status,meta);
    return item;
  }));
}

function renderKidult100(content={},state){
  const root=query('[data-k100-state]');
  if(!root)return;
  const wrapper=document.createElement('div');
  const label=document.createElement('small');
  const value=document.createElement('strong');
  const note=document.createElement('p');
  label.textContent='Current state';
  const localState=normalizeIntelligenceState(content.state);
  const ready=state==='LIVE_APPROVED'&&localState==='LIVE_APPROVED';
  const effectiveState=ready?'LIVE_APPROVED':state==='LIVE_APPROVED'?localState:state;
  root.dataset.contentState=effectiveState;
  const hasValue=ready&&typeof content.index_value==='number'&&Number.isFinite(content.index_value);
  value.textContent=hasValue?new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(content.index_value):ready?'GOVERNED VIEW READY':stateLabel(effectiveState);
  if(ready){
    const change=typeof content.change==='number'&&Number.isFinite(content.change)?`Change ${content.change>0?'+':''}${content.change}`:'Change not supplied';
    const constituents=Array.isArray(content.constituents)?`${content.constituents.length} constituents`:'Constituents unavailable';
    note.textContent=`${change} · ${constituents} · ${display(content.methodology_version)} · ${display(content.as_of)}`;
  }else note.textContent='Ranking waits for approved evidence.';
  wrapper.append(label,value,note);
  root.replaceChildren(wrapper);
  const chart=query('.index-chart,.index-line');
  if(chart){
    chart.dataset.seriesState=ready?'NOT_SUPPLIED':'WITHHELD';
    chart.setAttribute('aria-label',ready?'Trend series not supplied by approved Projection':'Index display withheld until governed Projection');
  }
}

function renderResearch(archive={},state){
  const localState=normalizeIntelligenceState(archive.state);
  const ready=state==='LIVE_APPROVED'&&localState==='LIVE_APPROVED';
  const count=Array.isArray(archive.items)?archive.items.length:0;
  write('[data-research-state]',ready?`${count} projection-bound record${count===1?'':'s'}`:'Archive waiting');
  const latest=ready&&count?archive.items[0]:null;
  write('[data-research-record]',latest?`${display(latest.title)} · ${display(latest.snapshot_id)} · ${display(latest.published_at)}`:'No approved research record');
}

function renderEvidence(methodology={},legacy=[],state='NO_PROJECTION',projection={}){
  const root=query('[data-evidence-grid]');
  if(!root)return;
  const safeMethodology=state==='LIVE_APPROVED'?methodology:{coverage:stateLabel(state),independence:'NOT VERIFIED',freshness:stateLabel(projection.freshness||'NOT_AVAILABLE'),rights:stateLabel(projection.rights_state||'WAITING'),methodology_version:'WITHHELD',lineage_version:'WITHHELD'};
  const fields=safeMethodology&&typeof safeMethodology==='object'?[
    ['Coverage',safeMethodology.coverage],['Independence',safeMethodology.independence],['Freshness',safeMethodology.freshness],['Rights',safeMethodology.rights],['Methodology',safeMethodology.methodology_version],['Lineage',safeMethodology.lineage_version]
  ]:legacy.map(entry=>[entry.label,entry.value]);
  root.replaceChildren(...fields.map(([field,value])=>{
    const item=document.createElement('span');
    item.className='evidence-item';
    const label=document.createElement('small');
    label.textContent=display(field);
    const content=document.createElement('b');
    content.textContent=display(value);
    item.append(label,content);
    return item;
  }));
}

function renderAudit(audit={}){
  const root=query('[data-audit-safe]');
  if(!root)return;
  const fields=[['Projection',audit.projection_id],['Assessment',audit.assessment_id],['Runtime replay',audit.replay_id],['Exact pair',audit.exact_pair_digest],['Correlation',audit.correlation_id],['Rebuild',audit.rebuild_state],['Replay',audit.replay_state],['Rollback',audit.rollback_state],['Reason',audit.reason_category]];
  root.replaceChildren(...fields.map(([label,value])=>{
    const item=document.createElement('span');
    const name=document.createElement('b');
    name.textContent=label;
    item.append(name,document.createTextNode(display(value)));
    return item;
  }));
  write('[data-audit-pair]',display(audit.exact_pair_digest));
  write('[data-audit-assessment]',display(audit.assessment_id));
  write('[data-audit-replay]',display(audit.replay_id));
  write('[data-audit-projection]',display(audit.projection_id));
}

function render(data){
  const projection=data.projection||{};
  const state=normalizeIntelligenceState(projection.state);
  const release=normalizeReleaseState(data.release?.state);
  document.documentElement.dataset.state=state;
  write('[data-projection-state]',state);
  write('[data-projection-asof]',projection.as_of?`As of ${projection.as_of}`:'As of —');
  write('[data-projection-freshness]',stateLabel(projection.freshness||'NOT_AVAILABLE'));
  write('[data-assessment]',stateLabel(projection.assessment_id||'NOT_STARTED'));
  write('[data-rights]',stateLabel(projection.rights_state||'WAITING'));
  write('[data-release-state]',release);
  renderVerticals(data.verticals||[]);
  renderSignals(data.signals||[],state);
  renderKidult100(data.kidult_100||{},state);
  renderResearch(data.research_archive||{},state);
  renderEvidence(data.evidence_methodology,data.evidence||[],state,projection);
  renderAudit(data.audit||{});
  write('[data-audit-seal]',state==='LIVE_APPROVED'?'TRACE BOUND':'CONTROL BOUNDARY');
  renderObjectIntelligence(data);
  gateWorkspace(state);
  if(data.fixture_type==='NON_PROMOTABLE_CONTROL'){
    const bar=query('.control-bar,.status-strip');
    if(bar){
      bar.dataset.fixture='NON_PROMOTABLE';
      bar.title='Control fixture only — not empirical or live Projection';
      bar.setAttribute('aria-description','Non-promotable control fixture. No live approved Projection exists.');
    }
  }
}

function renderFailure(){
  const fallback={projection:{state:'INVALID',rights_state:'WAITING'},objects:[]};
  document.documentElement.dataset.state='INVALID';
  write('[data-projection-state]','INVALID');
  write('[data-projection-asof]','As of —');
  write('[data-projection-freshness]','NOT AVAILABLE');
  write('[data-assessment]','NOT STARTED');
  write('[data-rights]','WAITING');
  write('[data-release-state]','HOLD');
  renderKidult100({state:'INVALID'},'INVALID');
  renderResearch({state:'INVALID',items:[]},'INVALID');
  renderEvidence({},[],'INVALID',{freshness:'NOT_AVAILABLE',rights_state:'WAITING'});
  write('[data-audit-seal]','CONTROL BOUNDARY');
  renderObjectIntelligence(fallback);
  gateWorkspace('INVALID');
}

initializeNavigation();
initializeAudienceLens();
bindHero();
readPortalProjection().then(data=>{try{render(data)}catch{renderFailure()}}).catch(renderFailure);
