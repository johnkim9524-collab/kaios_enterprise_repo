import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { buildMemoryFoundation, buildMemoryRegistryRun } from "./run-memory-foundation.mjs";

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const stable=v=>Array.isArray(v)?`[${v.map(stable).join(",")}]`:v&&typeof v==="object"?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`:JSON.stringify(v);
const errors=[]; const assert=(c,m)=>{if(!c) errors.push(m);};

const fixture=read("coordination/kidults/memory/fixtures/memory-foundation-input-v1.json");
const run=read("coordination/kidults/memory/runs/memory-foundation-run-r1.json");
const registryRun=read("coordination/kidults/registry/memory/records/memory-foundation-run-r1.json");
const memoryIndex=read("coordination/kidults/registry/memory/index.json");
const policy=read("coordination/kidults/registry/memory/records/memory-policy-v1.json");
const snapshot=read("coordination/kidults/registry/snapshot/index.json");
const assessment=read("coordination/kidults/registry/assessment/index.json");
const projection=read("coordination/kidults/registry/projection/records/projection-agci-os-current-v1.json");
const portal=read("apps/kidults-enterprise-staging/public/portal/data/registry-view.json");
const release=read("coordination/kidults/registry/release/index.json");
const universe=read("coordination/kidults/registry/universe/records/universe-global-collectibles-v1.json");

const expected=buildMemoryFoundation(fixture);
const expectedRegistry=buildMemoryRegistryRun(expected);
assert(stable(run)===stable(expected),"Committed Memory run is not deterministic from fixture.");
assert(stable(registryRun)===stable(expectedRegistry),"Memory Registry run does not match deterministic output.");
assert(stable(buildMemoryFoundation(fixture))===stable(buildMemoryFoundation(fixture)),"Same Memory input/cutoff must be deterministic.");
assert(memoryIndex.current_record_id===registryRun.id && memoryIndex.current_policy_id===policy.id,"Memory Registry pointers mismatch.");
assert(memoryIndex.status==="MEMORY_FOUNDATION_PASS","Memory Registry foundation status mismatch.");
assert(policy.storage_model==="APPEND_ONLY_BITEMPORAL" && policy.correction_model?.in_place_overwrite===false,"Memory must remain append-only bitemporal with no overwrite.");
assert(policy.direct_memory_to_portal===false && policy.direct_memory_to_index===false,"Direct Memory consumer paths are prohibited.");
assert(run.status==="MEMORY_FOUNDATION_PASS" && run.deterministic_replay==="PASS" && run.fail_closed===true,"Memory foundation/replay/fail-closed state mismatch.");
assert(run.input_entry_count===11 && run.admitted_entry_count===8 && run.quarantined_entry_count===3,"Memory fixture counts changed.");
assert(run.review_required_count===1 && run.supersession_chain_count===1 && run.replay_snapshot_count===3,"Memory review/supersession/replay counts changed.");
assert(run.provenance_coverage===1 && run.rights_coverage===1 && run.bitemporal_coverage===1,"Memory admitted coverage must remain 100%.");
assert(run.review_required?.[0]?.auto_merge===false,"Identity conflict must not auto-merge.");
assert(run.supersession_chains?.[0]?.overwrite_performed===false && run.supersession_chains?.[0]?.prior_entry_retained===true,"Correction lineage must preserve prior entry.");
assert(run.quarantined_entries?.every(e=>e.index_eligible===false&&e.publication_eligible===false),"Quarantined Memory cannot become Index/public eligible.");
assert(universe.object_count===null && universe.object_count_status==="NOT_VERIFIED","Memory fixture must not inflate Global Universe.");

const histSnapshot=snapshot.records.find(r=>r.id==="candidate-structural-20260816-r1");
const histAssessment=assessment.records.find(r=>r.id==="assessment-candidate-structural-20260816-r1-v1");
assert(histSnapshot?.status==="HISTORICAL_INTERNAL_NOT_CURRENT","Historical structural Candidate must remain registered as history.");
assert(histAssessment?.status==="HISTORICAL_COMPLETED_BLOCKED","Historical first Assessment must remain registered as history.");
assert(snapshot.current_candidate_snapshot_id===null,"Current Candidate must remain null before bounded real PoC.");
assert(assessment.current_assessment_id===null && assessment.current_snapshot_id===null,"Current Assessment authority must remain null.");
assert(assessment.status==="WAITING_FOR_SNAPSHOT","Track B current state must wait for a new snapshot.");

assert(projection.semantic_freshness?.status==="CURRENT_CANONICAL_BASELINE","Projection must be semantically current.");
assert(projection.snapshot?.candidate_id===null && projection.assessment?.current_id===null,"Projection must not promote historical Candidate/Assessment.");
assert(projection.memory?.current_run_id===run.run_id && projection.memory?.deterministic_replay==="PASS","Projection Memory state mismatch.");
assert(projection.memory?.public_projection===false && projection.memory?.indexes_computed===0,"Memory foundation cannot publish or compute Indexes.");
assert(portal.source_projection_id===projection.id && portal.freshness?.status==="CURRENT_CANONICAL_BASELINE","Portal must consume current Projection only.");
assert(portal.memory?.current_run_id===run.run_id && portal.memory?.direct_memory_to_portal===false,"Portal Memory boundary mismatch.");
assert(portal.indexes?.kidult_500?.status==="NOT_COMPUTED" && portal.indexes?.kidult_100?.status==="NOT_COMPUTED","Portal must not compute KIDULT indexes.");
assert(release.status==="HOLD" && portal.publication?.production==="HOLD","Production must remain HOLD.");

if(errors.length){console.error(`AGCI-OS Memory current-authority validation: FAIL (${errors.length})`);errors.forEach(e=>console.error(`ERROR: ${e}`));process.exit(1);}
console.log("AGCI-OS Memory current-authority validation: PASS");
console.log(`Memory: ${run.run_id} / deterministic replay PASS`);
console.log("Historical Candidate/Assessment preserved; current authority NONE.");
console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
console.log("Production: HOLD");
