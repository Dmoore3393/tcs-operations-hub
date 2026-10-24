import { cp, mkdir, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const nativeRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const repoRoot=resolve(nativeRoot,'../..');
const work=join(repoRoot,'.native-export-work');
const output=join(nativeRoot,'www-native');
// A mobile build needs only the same PUBLIC Supabase configuration as the web UI.
// Server secrets, signing keys, auth state, and private records are never copied.
const publicEnvironment={};
for(const name of ['.env.local','.env.native.local']){
 const path=join(repoRoot,name);if(!existsSync(path))continue;
 const content=await readFile(path,'utf8');
 for(const line of content.split(/\r?\n/)){const match=line.match(/^(NEXT_PUBLIC_SUPABASE_(?:URL|PUBLISHABLE_KEY|ANON_KEY))\s*=\s*["']?([^"'\r\n]+?)["']?\s*$/);if(match)publicEnvironment[match[1]]=match[2];}
}
for(const key of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','NEXT_PUBLIC_SUPABASE_ANON_KEY'])if(process.env[key])publicEnvironment[key]=process.env[key];
if(!publicEnvironment.NEXT_PUBLIC_SUPABASE_URL||!(publicEnvironment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||publicEnvironment.NEXT_PUBLIC_SUPABASE_ANON_KEY))throw Error('Add only the public Supabase URL and publishable key to .env.native.local before preparing the iPhone interface.');
if(publicEnvironment.NEXT_PUBLIC_SUPABASE_URL!=='https://hzxkjtprweodwbdmatoq.supabase.co')throw Error('The native build must use the existing Hub project.');
if(!existsSync(join(repoRoot,'node_modules/next')))throw Error('Run npm ci in the Hub repository first.');
await rm(work,{recursive:true,force:true});await mkdir(work,{recursive:true});
await cp(join(repoRoot,'src'),join(work,'src'),{recursive:true,filter:(path)=>path!==join(repoRoot,'src/app/api')&&path!==join(repoRoot,'src/proxy.ts')});
await cp(join(repoRoot,'public'),join(work,'public'),{recursive:true});
for(const name of ['package.json','tsconfig.json','postcss.config.mjs'])await cp(join(repoRoot,name),join(work,name));
await symlink(join(repoRoot,'node_modules'),join(work,'node_modules'),'dir');
// API handlers stay in Vercel. Only the client screens are statically exported.
await writeFile(join(work,'next.config.mjs'),'export default { output: "export", trailingSlash: true, images: { unoptimized: true } };\n');
// Match the existing /transportation rewrite without requiring a server rewrite.
await writeFile(join(work,'src/app/(portal)/transportation/page.tsx'),'export { default } from "../transportation-v2/page";\n');
await writeFile(join(work,'.env.production'),Object.entries(publicEnvironment).map(([key,value])=>`${key}=${value}`).join('\n')+'\n');
const inheritedEnvironment=Object.fromEntries(Object.entries(process.env).filter(([key])=>!(/^(SUPABASE_|APPLE_|OPENAI_API_KEY$|VERCEL_TOKEN$)/.test(key))));
const env={...inheritedEnvironment,...publicEnvironment,NEXT_TELEMETRY_DISABLED:'1'};
const status=await new Promise((done)=>{const child=spawn(process.execPath,[join(repoRoot,'node_modules/next/dist/bin/next'),'build','--webpack'],{cwd:work,env,stdio:'inherit'});child.on('error',e=>{console.error(e.message);done(1)});child.on('exit',code=>done(code??1));});
if(status!==0)process.exit(status);
await rm(output,{recursive:true,force:true});await cp(join(work,'out'),output,{recursive:true});
await cp(join(nativeRoot,'www/index.html'),join(output,'offline.html'));
console.log('Prepared bundled iPhone screens. Authenticated API calls remain on the existing Vercel application.');
