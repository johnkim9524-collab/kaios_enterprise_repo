import fs from 'node:fs/promises';
import { materializeBase720, validateBase720 } from './er-base720-materializer-v1-lib.mjs';

const [manifestPath,outPath='/tmp/kidults-er-base720-v1.json']=process.argv.slice(2);
if(!manifestPath)throw new Error('Usage: node materialize-er-base720-v1.mjs <manifest.json> [out.json]');
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const manifest=await read(manifestPath);
const samplingPlan=await read('coordination/kidults/entity-resolution/empirical-validation-sampling-plan-r1.json');
if(!Array.isArray(manifest.packet_paths)||manifest.packet_paths.length===0)throw new Error('BASE720_PACKET_PATHS_REQUIRED');
const packets=[];
for(const p of manifest.packet_paths)packets.push(await read(p));
const dataset=materializeBase720({manifest,packets,samplingPlan});
const result=validateBase720(dataset,samplingPlan);
await fs.writeFile(outPath,`${JSON.stringify(dataset,null,2)}\n`);
console.log(JSON.stringify({...result,out_path:outPath,case_set_sha256:dataset.case_set_sha256,dataset_sha256:dataset.dataset_sha256}));
