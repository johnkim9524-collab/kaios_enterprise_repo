import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const fail=(code)=>{throw new Error(code);};

export function canonicalPreloadUrl(value,{windows=process.platform==='win32',mustExist=true}={}){
  if(typeof value!=='string'||value.length===0)fail('PRELOAD_PATH_REQUIRED');
  let filePath;
  const pathApi=windows?path.win32:path.posix;
  if(pathApi.isAbsolute(value)){
    filePath=value;
  }else{
    let url;
    try{url=new URL(value);}catch{fail('PRELOAD_PATH_NOT_ABSOLUTE');}
    if(url.protocol!=='file:')fail('PRELOAD_URL_SCHEME_INVALID');
    try{filePath=fileURLToPath(url,{windows});}catch{fail('PRELOAD_FILE_URL_INVALID');}
  }
  if(mustExist){
    let stat;
    try{stat=fs.lstatSync(filePath);}catch{fail('PRELOAD_FILE_MISSING');}
    if(!stat.isFile()||stat.isSymbolicLink())fail('PRELOAD_FILE_NOT_REGULAR');
  }
  return pathToFileURL(filePath,{windows}).href;
}
