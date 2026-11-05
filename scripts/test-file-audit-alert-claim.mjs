import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile("src/lib/server/notification-state-store.ts","utf8");
const exports = {};
new Function("exports",ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);

test("simultaneous scans push an audit once, and changed paperwork still alerts",async()=>{
  let row = null;
  const db = { from() {
    let update, version, key;
    return {
      select(){return this}, eq(column,value){if(column==="updated_at") version=value;return this},
      not(column,op,value){assert.equal(column,"inbox");assert.equal(op,"cs");key=JSON.parse(value)[0].eventKey;return this},
      update(values){update=values;return this},
      async insert(values){if(row)return {error:{code:"23505"}};row=values;return {}},
      async maybeSingle(){
        if (!update) return {data:structuredClone(row)};
        if(row.updated_at!==version||row.inbox.some(i=>i.eventKey===key))return {data:null};
        row={...row,...update};return {data:{user_id:"staff"}};
      }
    };
  }};
  const claim=key=>exports.claimFileAuditAlert(db,{id:"staff"},{id:key,eventKey:key},[],{enabled:true});
  for(const key of ["child-file-audit:synthetic:missing:1","child-file-audit:synthetic:missing:1-2"]){
    const results=await Promise.all(Array.from({length:5},()=>claim(key)));
    assert.equal(results.filter(Boolean).length,1);
  }
  assert.equal(row.inbox.length,2);
});
