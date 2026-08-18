import fs from 'node:fs'; import process from 'node:process';
const s=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/value-chain-completion-scorecard-v1.json','utf8'));
const errors=[]; const a=(c,m)=>{if(!c)errors.push(m)};
const total=s.dimensions.reduce((n,x)=>n+x.weight,0); const pass=s.dimensions.filter(x=>x.state==='PASS').reduce((n,x)=>n+x.weight,0);
a(total===100,'Weights must total 100.'); a(pass===s.evidenced_pass_weight,'Evidenced PASS weight mismatch.'); a(s.target===100,'Target must remain 100.'); a(s.production==='HOLD','Production must remain HOLD.');
if(errors.length){for(const e of errors)console.error(e);process.exit(1)}
console.log(`Value-chain scorecard: PASS / strict evidenced completion ${pass}% / target 100%`);
