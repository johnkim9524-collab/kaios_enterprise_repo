import fs from 'node:fs';
import {verifyNativeResumeReuse} from './lib/native-resume-reuse-proof-v1.mjs';
const [first,second,output]=process.argv.slice(2);
if(!first||!second||!output) throw new Error('NATIVE_RESUME_REUSE_ARGUMENTS');
try {
  const result=verifyNativeResumeReuse(JSON.parse(fs.readFileSync(first,'utf8')),JSON.parse(fs.readFileSync(second,'utf8')));
  fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
} catch(error) {
  fs.writeFileSync(output,JSON.stringify({id:'kidults-native-resume-reuse-proof-v1',state:'VERIFIED_FAIL',
    failure_class:String(error.message),retry_authorized:false,production:'HOLD',public:'HOLD',g5:'HOLD'})+'\n',{flag:'wx',mode:0o600});
  throw error;
}
