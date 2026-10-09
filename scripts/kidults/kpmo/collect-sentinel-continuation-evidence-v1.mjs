import fs from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {verifyAuthenticatedSentinelContinuation} from './lib/authenticated-sentinel-continuation-v1.mjs';
const [indexPath,sourceSha,repository,outputPath]=process.argv.slice(2);
const deadline=Date.now()+210000;
const remaining=cap=>{const left=deadline-Date.now();if(left<=0)throw new Error('SENTINEL_CONTINUATION_TIME_BOUND');return Math.min(cap,left);};
const api=route=>JSON.parse(execFileSync('gh',['api','-H','Accept: application/vnd.github+json',route],{encoding:'utf8',timeout:remaining(20000),maxBuffer:8*1024*1024}));
const index=JSON.parse(fs.readFileSync(indexPath,'utf8'));
const runs=index.workflow_runs.filter(r=>r.event==='workflow_dispatch'&&r.head_sha===sourceSha&&r.head_branch==='main');
if(runs.length>50)throw new Error('SENTINEL_CONTINUATION_PROCESSING_BOUND');
const evidence=[];
for(const run of runs){
  const native=api(`/repos/${repository}/actions/runs/${run.id}`);
  for(const key of ['id','run_attempt','event','path','head_sha','head_branch','status','conclusion','created_at'])
    if(native[key]!==run[key])throw new Error('SENTINEL_CONTINUATION_INDEX_NATIVE_DRIFT');
  const artifacts=api(`/repos/${repository}/actions/runs/${run.id}/artifacts?per_page=100`);
  if(!Array.isArray(artifacts.artifacts)||artifacts.total_count!==artifacts.artifacts.length)throw new Error('SENTINEL_CONTINUATION_ARTIFACT_INDEX');
  const rows=artifacts.artifacts.filter(a=>a.name===`kpmo-continuous-assurance-sentinel-health-v1-${sourceSha}-${run.id}-1`);
  if(rows.length>1)throw new Error('SENTINEL_CONTINUATION_ARTIFACT_CARDINALITY');
  if(rows.length===0){
    // Until a nonterminal dispatch has emitted its authenticated archive, its
    // continuation class is unknown. Never let that gap select an older PASS.
    if(native.status!=='completed')throw new Error('SENTINEL_CONTINUATION_PENDING_CLASSIFICATION');
    // Authenticated continuation steps cannot disappear behind an older PASS.
    const jobs=api(`/repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`);
    if(!Array.isArray(jobs.jobs)||jobs.total_count!==jobs.jobs.length)throw new Error('SENTINEL_CONTINUATION_JOBS_INDEX');
    if(jobs.jobs.some(j=>j.steps?.some(s=>s.name==='Verify exact Coverage chain continuation'&&s.conclusion==='success')))
      throw new Error('SENTINEL_CONTINUATION_AUTHENTICATED_ARCHIVE_NOT_READY');
    continue;
  }
  const artifact=rows[0];
  const bytes=execFileSync('gh',['api','-H','Accept: application/vnd.github+json',`/repos/${repository}/actions/artifacts/${artifact.id}/zip`],{timeout:remaining(30000),maxBuffer:8*1024*1024});
  const read=spawnSync('python3',['scripts/kidults/kpmo/read-sentinel-artifact-v1.py',artifact.digest],{input:bytes,encoding:'utf8',timeout:remaining(20000),maxBuffer:40*1024*1024});
  if(read.status!==0)throw new Error('SENTINEL_CONTINUATION_ARCHIVE_INVALID');
  const archivePacket=JSON.parse(read.stdout);
  const item={run,artifact,archivePacket};
  // Check the fresh native head repository too; keep index run for exact selector matching.
  verifyAuthenticatedSentinelContinuation({...item,run:native,sourceSha,repository});
  if(verifyAuthenticatedSentinelContinuation({...item,sourceSha,repository}))evidence.push(item);
}
fs.writeFileSync(outputPath,JSON.stringify(evidence)+'\n');
