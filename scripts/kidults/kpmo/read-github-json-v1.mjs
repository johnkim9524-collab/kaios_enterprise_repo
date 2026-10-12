// Narrow JSON GET adapter for existing shell consumers; no mutation transport.
import {runtimeGithubRead} from './lib/runtime-github-read-v1.mjs';
const route=process.argv[2],repository='johnkim9524-collab/kaios_enterprise_repo';
if(typeof route!=='string'||!route.startsWith(`/repos/${repository}/`))throw Error('GITHUB_READ_ROUTE_REQUIRED');
const result=await runtimeGithubRead(process.env.GITHUB_TOKEN||process.env.GH_TOKEN)(`https://api.github.com${route}`);
process.stdout.write(JSON.stringify(result)+'\n');
