import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const sourceRoot='apps/kidults-enterprise-staging/public/portal-r001';
const mirrorRoot='apps/kidults-enterprise-staging/public/portal/portal-r001';
const assurancePath='coordination/kidults/portal/portal-launch-assurance-v1.json';
const expectedFiles=[
  'assets/cards/market-map-v4.svg',
  'assets/cards/object-dossier-v4.svg',
  'assets/cards/verticals-v4.svg',
  'assets/hero/portal-r001-roadster-v4.webp',
  'data/negative-state-matrix.json',
  'data/projection-content-contract-v1.json',
  'data/projection-control-fixture.json',
  'index.html',
  'object-intelligence.js',
  'object-redirect.js',
  'object.html',
  'portal-premium-v2.css',
  'portal-premium-v4.css',
  'portal-release-001.js',
  'projection-store.js',
  'proof-product-admission.js',
  'proof-product-schema-validator.js'
].sort();
const errors=[];

function sha256(bytes){
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function inventory(relativeRoot){
  const absoluteRoot=path.join(root,relativeRoot);
  const files=[];
  if(!fs.existsSync(absoluteRoot)){
    errors.push(`missing root ${relativeRoot}`);
    return files;
  }
  if(fs.lstatSync(absoluteRoot).isSymbolicLink()){
    errors.push(`root must not be a symlink: ${relativeRoot}`);
    return files;
  }
  const visit=directory=>{
    for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
      const absolute=path.join(directory,entry.name);
      const relative=path.relative(absoluteRoot,absolute).split(path.sep).join('/');
      if(entry.isSymbolicLink()){
        errors.push(`symlink prohibited: ${relativeRoot}/${relative}`);
      }else if(entry.isDirectory()){
        visit(absolute);
      }else if(entry.isFile()){
        files.push(relative);
      }else{
        errors.push(`non-file entry prohibited: ${relativeRoot}/${relative}`);
      }
    }
  };
  visit(absoluteRoot);
  return files.sort();
}

const sourceFiles=inventory(sourceRoot);
const mirrorFiles=inventory(mirrorRoot);
if(JSON.stringify(sourceFiles)!==JSON.stringify(expectedFiles)){
  errors.push(`canonical file set mismatch: ${JSON.stringify(sourceFiles)}`);
}
if(JSON.stringify(mirrorFiles)!==JSON.stringify(expectedFiles)){
  errors.push(`mirror file set mismatch: ${JSON.stringify(mirrorFiles)}`);
}

let totalBytes=0;
for(const relative of expectedFiles){
  const sourcePath=path.join(root,sourceRoot,relative);
  const mirrorPath=path.join(root,mirrorRoot,relative);
  if(!fs.existsSync(sourcePath)||!fs.existsSync(mirrorPath))continue;
  const source=fs.readFileSync(sourcePath);
  const mirror=fs.readFileSync(mirrorPath);
  totalBytes+=source.length;
  if(source.length!==mirror.length||sha256(source)!==sha256(mirror)){
    errors.push(`byte parity mismatch: ${relative}`);
  }
}

let assurance={};
try{
  assurance=JSON.parse(fs.readFileSync(path.join(root,assurancePath),'utf8'));
}catch(error){
  errors.push(`invalid launch assurance: ${error.message}`);
}
if(assurance?.canonical_surface?.public_root!==sourceRoot){
  errors.push('launch assurance canonical source must remain portal-r001');
}
if(assurance?.canonical_surface?.entrypoint!=='index.html'){
  errors.push('launch assurance canonical entrypoint must remain index.html');
}
if(assurance?.canonical_surface?.legacy_and_variant_directories_deployable!==false){
  errors.push('mirror must not become release authority');
}
if(assurance?.public!=='HOLD'||assurance?.production!=='HOLD'||assurance?.g5!=='HOLD'){
  errors.push('release authority must remain HOLD');
}

const result={
  id:'kidults-cloudflare-pages-portal-r001-mirror-v1',
  state:errors.length?'VERIFIED_FAIL':'VERIFIED_PASS',
  source_root:sourceRoot,
  mirror_root:mirrorRoot,
  adapter_only:true,
  files:expectedFiles.length,
  bytes:totalBytes,
  exact_file_set:true,
  byte_parity:errors.every(error=>!error.startsWith('byte parity mismatch')),
  public:'HOLD',
  production:'HOLD',
  g5:'HOLD',
  errors
};
console.log(JSON.stringify(result,null,2));
if(errors.length)process.exit(1);
