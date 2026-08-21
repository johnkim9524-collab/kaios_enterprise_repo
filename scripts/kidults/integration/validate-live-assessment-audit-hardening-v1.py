#!/usr/bin/env python3
import hashlib, json, subprocess, sys, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
contract=json.loads((ROOT/'coordination/kidults/integration/exact-pair-arrival-orchestrator-v1.json').read_text())
envelope=json.loads((ROOT/'coordination/kidults/schemas/live-rankability-assessment-envelope-v1.schema.json').read_text())
canonical=json.loads((ROOT/'coordination/kidults/schemas/rankability-assessment.schema.json').read_text())
evaluator=(ROOT/'scripts/kidults/integration/evaluate-exact-pair-arrival-v1.py').read_text()
errors=[]
need=lambda cond,msg: errors.append(msg) if not cond else None

need(contract.get('version')=='1.1.0','orchestrator version must be 1.1.0')
need(contract.get('hardening_issue')==918,'hardening issue must be 918')
need(envelope.get('additionalProperties') is False,'live envelope must reject unknown fields')
need(envelope.get('properties',{}).get('assessment',{}).get('$ref')=='rankability-assessment.schema.json','live envelope must wrap canonical assessment schema')
for f in ['exact_pair_digest','correlation_id','synthetic','promotable','assessment']:
    need(f in envelope.get('required',[]),f'envelope missing required {f}')
need(envelope['properties']['synthetic'].get('const') is False,'synthetic must be false')
need(envelope['properties']['promotable'].get('const') is True,'promotable must be true')
need(canonical.get('additionalProperties') is False,'historical canonical schema must remain closed')
for f in ['exact_pair_digest','correlation_id','synthetic','promotable']:
    need(f not in canonical.get('properties',{}),f'historical canonical schema unexpectedly changed with {f}')
need(contract['assessment_binding']['staging_replay_pass_recommendations']==['PUBLISHABLE_INTERNAL','PUBLISHABLE_PUBLIC'],'STAGING replay recommendations too weak or changed')
for shortcut in ['TRACK_B_BLOCKED_TO_RUNTIME','TRACK_B_CONDITIONAL_TO_RUNTIME','RUNTIME_BEFORE_TRACK_B_PASS']:
    need(shortcut in contract.get('forbidden_shortcuts',[]),f'missing shortcut guard {shortcut}')
for token in ["live_rankability_assessment_envelope","TRACK_B_BLOCKED","PASS_FOR_INTERNAL_STAGING","ASSESSMENT_PRODUCTION_PREAUTH_FORBIDDEN"]:
    need(token in evaluator,f'evaluator missing {token}')

if errors:
    print(json.dumps({'suite':'LIVE_ASSESSMENT_AUDIT_HARDENING_V1','result':'FAIL','errors':errors},indent=2))
    sys.exit(1)

with tempfile.TemporaryDirectory() as td:
    state=Path(td)/'state.json'
    audit=Path(td)/'audit.json'
    subprocess.run([sys.executable,str(ROOT/'scripts/kidults/integration/evaluate-exact-pair-arrival-v1.py'),str(state)],cwd=ROOT,check=True)
    subprocess.run([sys.executable,str(ROOT/'scripts/kidults/integration/build-live-chain-audit-v1.py'),str(state),str(audit)],cwd=ROOT,check=True)
    s=json.loads(state.read_text())
    a=json.loads(audit.read_text())
    need(s['result']=='PASS','arrival evaluator did not pass')
    need(s['production']=='HOLD' and s['public_intelligence']=='HOLD','arrival boundaries changed')
    need(a['append_only_semantics'] is True and a['safe_fields_only'] is True,'audit safety flags missing')
    need(a['raw_provider_payloads'] is False and a['credentials'] is False and a['secrets'] is False,'audit leaked unsafe surfaces')
    prev=None
    for e in a['events']:
        need(e['previous_event_digest']==prev,'audit previous digest chain broken')
        body=dict(e); body.pop('event_digest'); body.pop('event_id')
        raw=json.dumps(body,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
        expected='sha256:'+hashlib.sha256(raw).hexdigest()
        need(e['event_digest']==expected,'audit event digest invalid')
        prev=e['event_digest']
    need(a['tail_event_digest']==prev,'audit tail mismatch')

if errors:
    print(json.dumps({'suite':'LIVE_ASSESSMENT_AUDIT_HARDENING_V1','result':'FAIL','errors':errors},indent=2))
    sys.exit(1)
print(json.dumps({'suite':'LIVE_ASSESSMENT_AUDIT_HARDENING_V1','result':'PASS','assessment_envelope':'COMPATIBLE','track_b_blocked_to_runtime':'PROHIBITED','audit_digest_chain':'PASS','production':'HOLD','public_intelligence':'HOLD','g5':'HOLD'},indent=2))
