// The deployment workflow copies this entry beside server.mjs in the immutable
// runtime bundle; keeping the import relative prevents a remote path escape.
import {createKidultsServer} from './server.mjs';

if(process.env.KAIOS_ENVIRONMENT!=='staging')throw new Error('KAIOS_ENVIRONMENT must be staging');
if(process.env.KAIOS_PRODUCTION_PROMOTION_AUTHORIZED!=='false')throw new Error('Production promotion must remain false');
const [publicDir,dataDir]=process.argv.slice(2);
if(!publicDir||!dataDir)throw new Error('runtime entry requires publicDir and dataDir');
const server=createKidultsServer({publicDir,dataDir,secret:null,projectionPath:null,projectionSecret:null});
const host=process.env.HOST||'127.0.0.1';
const port=Number(process.env.PORT||'4173');
server.listen(port,host,()=>console.log(`Kidults staging runtime listening on http://${host}:${port}`));
