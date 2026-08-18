import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = p => JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const errors=[];
const assert=(condition,message)=>{if(!condition) errors.push(message);};

const assessmentId="assessment-candidate-structural-20260816-r1-v1";
const snapshotId="candidate-structural-20260816-r1";
const assessment=read(`coordination/kidults/registry/assessment/records/${assessmentId}.json`);
const assessmentIndex=read("coordination/kidults/registry/assessment/index.json");
const snapshotIndex=read("coordination/kidults/registry/snapshot/index.json");
const evidenceIndex=read("coordination/kidults/registry/evidence/index.json");
const trackIndex=read("coordination/kidults/registry/track/index.json");
const twin=read("coordination/kidults/registry/digital-twin/records/twin-current-program-state-v1.json");
const portal=read("apps/kidults-enterprise-staging/public/portal/data/registry-view.json");

const assessmentRef=assessmentIndex.records.find(r=>r.id===assessmentId);
const snapshotRef=snapshotIndex.records.find(r=>r.id===snapshotId);
const evidenceRef=evidenceIndex.records.find(r=>r.id===assessment.evidence_package_id);
const trackB=trackIndex.records.find(r=>r.id==="track-b-rankability-validation-gate");

assert(Boolean(assessmentRef),"Historical first Assessment must remain registered.");
assert(assessmentRef?.status==="HISTORICAL_COMPLETED_BLOCKED","Historical Assessment index state must remain HISTORICAL_COMPLETED_BLOCKED.");
assert(Boolean(snapshotRef),"Historical structural Candidate must remain registered.");
assert(snapshotRef?.status==="HISTORICAL_INTERNAL_NOT_CURRENT","Historical Candidate must not be current authority.");
assert(Boolean(evidenceRef),"Historical structural Evidence Package must remain registered.");
assert(evidenceRef?.status==="HISTORICAL_CANDIDATE_EVIDENCE_NOT_CURRENT","Historical Evidence Package must not be current authority.");
assert(assessment.snapshot_id===snapshotId,"Historical Assessment snapshot binding changed.");
assert(assessment.gate_state==="blocked","Historical first Assessment must preserve BLOCKED gate.");
assert(assessment.recommendation==="BLOCKED","Historical first Assessment recommendation changed.");
assert(assessment.overall_rankability===false,"Historical first Assessment must remain non-rankable.");
assert(assessment.publication_eligible===false && assessment.production_eligible===false,"Historical first Assessment must remain non-public/non-Production.");
assert(assessment.immutable===true,"Historical first Assessment must remain immutable.");

assert(snapshotIndex.current_candidate_snapshot_id===null,"Current Candidate authority must remain null before bounded real PoC.");
assert(evidenceIndex.current_evidence_package_id===null,"Current Evidence Package authority must remain null before bounded real PoC.");
assert(assessmentIndex.current_assessment_id===null && assessmentIndex.current_snapshot_id===null,"Current Assessment authority must remain null before new exact package.");
assert(assessmentIndex.status==="WAITING_FOR_SNAPSHOT","Track B current Registry state must wait for a new snapshot.");
assert(trackB?.status==="WAITING_FOR_EXACT_IMMUTABLE_PACKAGE","Track B current operating state mismatch.");
assert(twin.current_candidate_snapshot_id===null && twin.current_assessment_id===null,"Digital Twin must not surface historical Candidate/Assessment as current.");
assert(portal.snapshot?.candidate_id===null && portal.assessment?.current_id===null,"Portal must not surface historical Candidate/Assessment as current.");
assert(portal.freshness?.status==="CURRENT_CANONICAL_BASELINE","Portal must remain on current canonical baseline.");
assert(twin.production_state==="HOLD" && portal.publication?.production==="HOLD","Production must remain HOLD.");

if(errors.length){
 console.error(`Track B historical first Assessment audit: FAIL (${errors.length})`);
 errors.forEach(e=>console.error(`ERROR: ${e}`));
 process.exit(1);
}
console.log("Track B historical first Assessment audit: PASS");
console.log(`Historical Assessment: ${assessmentId} / BLOCKED preserved`);
console.log("Current Candidate / Evidence / Assessment: NONE / NONE / NONE");
console.log("Track B: WAITING_FOR_EXACT_IMMUTABLE_PACKAGE");
console.log("Production: HOLD");
