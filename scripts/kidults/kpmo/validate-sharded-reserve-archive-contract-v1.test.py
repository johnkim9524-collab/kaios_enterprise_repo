#!/usr/bin/env python3
import hashlib, json, os, pathlib, subprocess, sys, tempfile, zipfile

VALIDATOR = pathlib.Path(os.environ.get('VALIDATOR', pathlib.Path(__file__).with_name('validate-sharded-reserve-archive-contract-v1.py')))
SOURCE_SHA = 'a' * 40
ROOT = 'asi-sharded-source-reserve-v1/'

def sha(data): return hashlib.sha256(data).hexdigest()

def make_zip(path, mutation=None):
    shard_rows=[]; contents={}
    for i in range(256):
        sid=f'{i:02x}'; rel=f'shards/{sid}.ndjson'; data=(b'{}\n' if i==0 else b'')
        contents[ROOT+rel]=data
        shard_rows.append({'shard_id':sid,'path':rel,'sha256':sha(data),'candidate_count':1 if i==0 else 0})
    gd='sha256:'+sha('|'.join(f"{r['shard_id']}:{r['sha256']}:{r['candidate_count']}" for r in shard_rows).encode())
    manifest={'id':'kidults-asi-sharded-source-reserve-manifest-v1','status':'SHADOW_SHARDED_DISCOVERY_SOURCE_RESERVE_READY','shard_count':256,'shards':shard_rows,'unique_candidate_count':1,'nonempty_shard_count':1,'global_digest':gd,'cycle_number':7,'production':'HOLD','public_release':'HOLD','acquisition_authorized':False,'content_acquired':False}
    activation={'id':'kidults-asi-sharded-source-reserve-activation-receipt-v1','state':'VERIFIED_PASS','exact_generation_bound':True,'promotion_authority':False,'content_acquisition_authorized':False,'collection_right_created':False,'public_release':'HOLD','production':'HOLD','reserve_cycle':7,'reserve_unique_candidates':1,'reserve_nonempty_shards':1,'discovery_producer_head_sha':SOURCE_SHA}
    contents[ROOT+'asi-sharded-source-reserve-manifest-v1.json']=json.dumps(manifest,separators=(',',':')).encode()
    contents['asi-sharded-source-reserve-activation-receipt-v1.json']=json.dumps(activation,separators=(',',':')).encode()
    if mutation=='missing': contents.pop(ROOT+'shards/ff.ndjson')
    if mutation=='extra': contents[ROOT+'unexpected.txt']=b'x'
    if mutation=='traversal': contents['../escape.txt']=b'x'
    if mutation=='tamper': contents[ROOT+'shards/00.ndjson']=b'{"tampered":true}\n'
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
        for name,data in contents.items(): z.writestr(name,data)

def run(path, expected_ok):
    digest='sha256:'+sha(path.read_bytes())
    receipt=path.with_suffix('.receipt.json')
    p=subprocess.run([sys.executable,str(VALIDATOR),'--archive',str(path),'--expected-digest',digest,'--expected-source-sha',SOURCE_SHA,'--receipt',str(receipt)],capture_output=True,text=True)
    obj=json.loads(receipt.read_text())
    ok=p.returncode==0 and obj['state']=='VERIFIED_PASS'
    if ok!=expected_ok: raise SystemExit(f'CASE_FAILED:{path.name}:rc={p.returncode}:receipt={obj}:stderr={p.stderr}')

with tempfile.TemporaryDirectory() as td:
    td=pathlib.Path(td)
    for mutation,expected in [(None,True),('missing',False),('extra',False),('traversal',False),('tamper',False)]:
        p=(td/(mutation or 'positive')).with_suffix('.zip')
        make_zip(p,mutation); run(p,expected)
print(json.dumps({'suite':'KIDULTS_SHARDED_RESERVE_ARCHIVE_CONTRACT_V1','positive':1,'negative':4,'state':'VERIFIED_PASS'}))
