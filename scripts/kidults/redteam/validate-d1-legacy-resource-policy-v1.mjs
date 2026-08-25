import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const forbiddenDb=['kidults-main-db','kidults_db'];
const forbiddenSql=[/DELETE\s+FROM\s+signal_scores\b/i,/DELETE\s+FROM\s+kidult_rankings\b/i];
const allowExt=new Set(['.js','.mjs','.cjs','.ts','.tsx','.jsx','.json','.toml','.yml','.yaml','.sql','.md']);
const ignore=new Set(['.git','node_modules','dist','build','.wrangler','.next','coverage']);
const governanceEvidenceAllowlist=new Set([
  'coordination/kidults/redteam/d1-legacy-resource-policy-v1.json',
  'coordination/kidults/redteam/cloudflare-worker-estate-policy-v1.json',
  'scripts/kidults/redteam/validate-d1-legacy-resource-policy-v1.mjs'
]);
const hits=[];
function walk(dir){
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    if(ignore.has(ent.name)) continue;
    const p=path.join(dir,ent.name);
    if(ent.isDirectory()) walk(p);
    else if(allowExt.has(path.extname(ent.name).toLowerCase())){
      let t=''; try{t=fs.readFileSync(p,'utf8')}catch{continue}
      const rel=path.relative(root,p).replaceAll('\\','/');
      if(governanceEvidenceAllowlist.has(rel)) continue;
      for(const db of forbiddenDb) if(t.includes(db)) hits.push(`${rel}: forbidden legacy D1 binding/name ${db}`);
      for(const re of forbiddenSql) if(re.test(t)) hits.push(`${rel}: destructive full-refresh SQL ${re}`);
    }
  }
}
walk(root);
if(hits.length){ console.error(JSON.stringify({suite:'D1_LEGACY_RESOURCE_POLICY_V1',result:'FAIL',hits},null,2)); process.exit(1); }
console.log(JSON.stringify({
  suite:'D1_LEGACY_RESOURCE_POLICY_V1',
  result:'PASS',
  governance_evidence_allowlist:[...governanceEvidenceAllowlist]
},null,2));
