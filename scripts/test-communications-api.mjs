import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const url = (source) => "data:text/javascript;base64," + Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText).toString("base64");
const childId="synthetic-child", rowId="00000000-0000-4000-8000-000000000030", actor="00000000-0000-4000-8000-000000000010", messageId="00000000-0000-4000-8000-000000000050";
let scenario = 0;
async function load(kind, options={}) {
  const calls=[];
  const query={select(){return this},eq(...args){calls.push(["filter",...args]);return this},neq(){return this},async maybeSingle(){return {data:options.noChild?null:{id:rowId},error:null}}};
  const staff={user:{id:actor},profile:{organization_id:"synthetic-org",full_name:"Demo Staff",role:options.employee?"Employee":"Location Licensee"},isOwner:false,isLicensee:!options.employee,userClient:{from:()=>{calls.push(["read"]);return query}},admin:{rpc:async(...args)=>{calls.push(["rpc",...args]);return {data:[],error:null}}}};
  const parent={...staff,email:"demo@example.invalid",children:[{legacyId:childId,rowId,access:{permissions:{messageStaff:!options.noSend,viewMessages:!options.noRead}}}]};
  const requireUser=async()=>{if(options.unauthorized)throw new Response("Sign-in required",{status:401});return kind==="parent"?parent:staff};
  globalThis.__hubCommTest={requireUser,calls};
  let source=await readFile(new URL(`../src/app/api/${kind==="parent"?"parent/messages":"family-communications"}/route.ts`,import.meta.url),"utf8");
  source=source.replace(/^import .*require-(staff|parent).*;$/m,`const require${kind==="parent"?"Parent":"Staff"}=globalThis.__hubCommTest.requireUser; const ${kind==="parent"?"parent":"staff"}ErrorResponse=(error)=>error instanceof Response?error:Response.json({error:String(error)},{status:500});`)
    .replace(/^import .*uuidPattern.*;$/m,`const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;`);
  return {route:await import(url(source + `\n// scenario ${scenario++}`)),calls};
}
const request=(body,method="POST")=>new Request("https://hub.example.invalid/api/messages",{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
test("anonymous and ordinary employee staff requests never reach family data",async()=>{
  for(const options of [{unauthorized:true},{employee:true}]){const {route,calls}=await load("staff",options); const response=await route.POST(request({action:"send",childId,id:messageId,subject:"Synthetic",body:"Synthetic"})); assert.equal(response.status,options.unauthorized?401:403);assert.equal(calls.length,0)}
});
test("staff cannot send to an inaccessible child, and verified actor and direction override client input",async()=>{
  let testCase=await load("staff",{noChild:true});assert.equal((await testCase.route.POST(request({action:"send",childId,id:messageId,subject:"Synthetic",body:"Synthetic"}))).status,403);assert.ok(!testCase.calls.some(c=>c[0]==="rpc"));
  testCase=await load("staff");assert.equal((await testCase.route.POST(request({action:"send",childId,id:messageId,subject:"Synthetic",body:"Synthetic",createdBy:"Forged",p_actor:"other"}))).status,200);
  const rpc=testCase.calls.find(c=>c[0]==="rpc");assert.equal(rpc[2].p_actor,actor);assert.equal(rpc[2].p_child,rowId);assert.equal(rpc[2].p_message.createdBy,"Demo Staff");assert.equal(rpc[2].p_message.direction,"TCS to Family");
});
test("individual guardian message permissions and child links gate both send and read",async()=>{
  for(const [options,method,body] of [[{noSend:true},"POST",{childId}], [{noRead:true},"PATCH",{childId,ids:[messageId]}],[{},"POST",{childId:"unlinked-child"}]]) {const {route,calls}=await load("parent",options);const response=await route[method](request({...body,subject:"Synthetic",body:"Synthetic"},method));assert.equal(response.status,403);assert.equal(calls.length,0)}
});
test("guardian read action cannot mark the staff-facing direction or spoof actor",async()=>{
  const {route,calls}=await load("parent");const response=await route.PATCH(request({childId,ids:[messageId,123],direction:"Family to TCS",actor:"forged"},"PATCH"));assert.equal(response.status,200);assert.equal(calls[0][2].p_actor,actor);assert.equal(calls[0][2].p_read_direction,"TCS to Family");assert.deepEqual(calls[0][2].p_read_ids,[messageId]);
});
test("previous packaged parents may omit retry IDs, while new clients preserve their chosen ID",async()=>{
  for(const supplied of [undefined,messageId]) {const {route,calls}=await load("parent");assert.equal((await route.POST(request({childId,id:supplied,subject:"Synthetic",body:"Synthetic"}))).status,200);assert.match(calls[0][2].p_message.id,/^[0-9a-f-]{36}$/i);if(supplied)assert.equal(calls[0][2].p_message.id,supplied)}
});
test("malformed JSON gets a friendly client error without database work",async()=>{
  const {route,calls}=await load("parent");assert.equal((await route.POST(request(null))).status,400);assert.equal(calls.length,0);
});
