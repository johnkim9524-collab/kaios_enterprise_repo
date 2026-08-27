import fs from 'node:fs';
const p='.github/workflows/kpmo-live-canonical-issue-truth-v1.yml';
const text=fs.readFileSync(p,'utf8');
if(!text.includes('group: kpmo-live-canonical-issue-truth-')) throw new Error('CANONICAL_TRUTH_CONCURRENCY_GROUP_MISSING');
if(!text.includes('cancel-in-progress: false')) throw new Error('CANONICAL_TRUTH_DEBOUNCE_MUST_SERIALIZE');
if(text.includes('cancel-in-progress: true')) throw new Error('CANONICAL_TRUTH_SUPERSEDE_CANCELLATION_REINTRODUCED');
if(!text.includes("issues:\n    types: [edited, reopened, closed]")) throw new Error('CANONICAL_TRUTH_ISSUE_TRIGGER_MISSING');
if(!text.includes("- 'KPMO Live Canonical Issue Truth V1'")) {
  const assurance=fs.readFileSync('.github/workflows/kidults-platform-continuous-assurance-v1.yml','utf8');
  if(!assurance.includes("- 'KPMO Live Canonical Issue Truth V1'")) throw new Error('ASSURANCE_CANONICAL_TRUTH_WATCH_MISSING');
}
console.log('CANONICAL_TRUTH_DEBOUNCE_SERIALIZATION_VERIFIED_PASS');
