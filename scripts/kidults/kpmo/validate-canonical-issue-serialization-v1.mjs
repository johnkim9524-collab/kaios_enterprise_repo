import fs from 'node:fs';
const p='.github/workflows/kpmo-live-canonical-issue-truth-v1.yml';
const y=fs.readFileSync(p,'utf8');
if(!y.includes("github.event_name == 'issues' && github.sha")) throw new Error('ISSUE_EPOCH_GROUP_MISSING');
if(!y.includes('cancel-in-progress: false')) throw new Error('ISSUE_EPOCH_CANCELLATION_NOT_DISABLED');
if(!y.includes('issues:\n    types: [edited, reopened, closed]')) throw new Error('ISSUE_TRIGGERS_MISSING');
if(!y.includes('Validate live canonical issue truth')) throw new Error('VALIDATION_STEP_MISSING');
if(!y.includes('Upload exact canonical-truth receipt')) throw new Error('RECEIPT_UPLOAD_MISSING');
console.log('CANONICAL_ISSUE_SERIALIZATION_VERIFIED_PASS');
