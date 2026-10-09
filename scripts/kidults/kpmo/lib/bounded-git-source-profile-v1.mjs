import {createHash} from 'node:crypto';

// This validates an installed read profile, not approval of its activation.
// Candidate policy is never a grant for changing protected main or this registry.
export const SOURCE_PROFILE_PATHS=Object.freeze([
  'scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs',
  'scripts/kidults/kpmo/lib/bounded-git-source-reader-v1.mjs',
  'scripts/kidults/kpmo/lib/bounded-git-pack-decoder-v1.mjs',
  'scripts/kidults/kpmo/lib/bounded-git-public-transport-v1.mjs',
  'scripts/kidults/kpmo/lib/bounded-git-source-profile-v1.mjs',
  'scripts/kidults/kpmo/lib/semantic-capability-delta-v1.mjs',
  'scripts/kidults/kpmo/lib/independent-capability-verifier-v1.mjs',
]);
export const SOURCE_PROFILE_LIMITS=Object.freeze({maximum_requests:256,quota_reserve:100,transport_requests:2,sources:209,objects:10000,
  pack_bytes:67108864,inflated_bytes:134217728,raw_bytes:134217728,object_bytes:16777216,tree_entries:100000,
  stream_chunks:65536,packet_count:100000,delta_depth:64,preparation_milliseconds:60000,job_timeout_minutes:10});
const canonical=value=>JSON.stringify(value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])):value);
export function isBoundedGitSourceProfileEnabled(policy,readSource) {
  const profile=policy?.immutable_source_read_profile;if(profile===undefined)return false;
  const fail=()=>{throw Object.assign(new Error('SOURCE_BATCH_PROTECTED_PROFILE_INVALID'),{code:'SOURCE_BATCH_PROTECTED_PROFILE_INVALID',global:true});};
  const fixed={id:'kidults-bounded-public-git-source-profile-v1',version:'1.0.0',mode:'BOUNDED_PUBLIC_GIT_PACK_V1',
    repository:'johnkim9524-collab/kaios_enterprise_repo',policy_activation_requires_exact_head_owner_decision:true,
    candidate_policy_authority:false,authorization_created:false,production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD',limits:SOURCE_PROFILE_LIMITS};
  if(!profile||typeof profile!=='object'||Array.isArray(profile)||typeof readSource!=='function')fail();
  const {source_sha256,...metadata}=profile;if(canonical(metadata)!==canonical(fixed)||!source_sha256||typeof source_sha256!=='object'
    ||Object.keys(source_sha256).sort().join('\n')!==SOURCE_PROFILE_PATHS.slice().sort().join('\n'))fail();
  for(const path of SOURCE_PROFILE_PATHS){if(!/^sha256:[0-9a-f]{64}$/.test(source_sha256[path]))fail();let bytes;try{bytes=readSource(path);}catch{fail();}
    if(!Buffer.isBuffer(bytes)||bytes.length>2*1024*1024||'sha256:'+createHash('sha256').update(bytes).digest('hex')!==source_sha256[path])fail();}
  return true;
}
