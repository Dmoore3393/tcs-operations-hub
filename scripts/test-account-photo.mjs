import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import sharp from 'sharp';
const source=await fs.readFile('src/app/api/account-photo/route.ts','utf8');
function fixture(role='staff') {
 const writes=[],removes=[];const bucket={list:async()=>({data:[]}),upload:async(path,bytes)=>{writes.push({path,bytes});return{};},remove:async(paths)=>{removes.push(paths);return{};}};
 const principal={user:{id:'own-user'},admin:{storage:{from:()=>bucket}}};
 const deps={'sharp':{default:sharp},'@/lib/server/require-staff':{requireStaff:async()=>{if(role!=='staff')throw new Response('',{status:403});return principal;}},'@/lib/server/require-parent':{requireParent:async()=>{if(role!=='parent')throw new Response('',{status:403});return principal;}}};
 const context={exports:{},require:name=>deps[name],Response,Request,File,Buffer};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 return {...context.exports,writes,removes};
}
async function upload(f,bytes,type='image/png') {const form=new FormData();form.append('file',new File([bytes],'photo',{type}));form.append('userId','other-user');return f.POST(new Request('https://hub.test/api/account-photo',{method:'POST',body:form}));}
test('staff and parents upload only to their own path; image is resized and metadata stripped',async()=>{
 for(const role of ['staff','parent']){const f=fixture(role);const png=await sharp({create:{width:40,height:20,channels:3,background:'#123456'}}).png().toBuffer();assert.equal((await upload(f,png)).status,200);assert.equal(f.writes[0].path,'account-profiles/own-user/profile.jpg');const metadata=await sharp(f.writes[0].bytes).metadata();assert.equal(metadata.width,512);assert.equal(metadata.height,512);assert.equal(metadata.format,'jpeg');assert.equal(metadata.exif,undefined);}
});
test('unauthorized requests cannot read, upload or remove photos',async()=>{const f=fixture('denied');assert.equal((await f.GET(new Request('https://hub.test'))).status,403);assert.equal((await upload(f,'bad')).status,403);assert.equal((await f.DELETE(new Request('https://hub.test'))).status,403);assert.equal(f.writes.length,0);assert.equal(f.removes.length,0);});
test('rejects fake images and unsupported formats without storage writes',async()=>{const f=fixture();assert.equal((await upload(f,'not a png')).status,400);assert.equal((await upload(f,'<svg/>','image/svg+xml')).status,415);assert.equal(f.writes.length,0);});
test('remove ignores requested target and touches only own photo',async()=>{const f=fixture('parent');assert.equal((await f.DELETE(new Request('https://hub.test?userId=other'))).status,200);assert.equal(f.removes[0][0],'account-profiles/own-user/profile.jpg');});
