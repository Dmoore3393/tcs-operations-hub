import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source=await fs.readFile('src/lib/staff-password-recovery.ts','utf8');
const context={exports:{},URLSearchParams};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const {readRecoveryProof,verifyRecoveryProof,requestStaffPasswordReset}=context.exports;
test('requests exactly one supported email reset with the live redirect and propagates delivery failures',async()=>{
 const calls=[];let failure=null;
 const client={auth:{resetPasswordForEmail:async(...args)=>{calls.push(args);return{error:failure}}}};
 await requestStaffPasswordReset(client,' Staff@example.com ');
 assert.equal(calls.length,1);assert.equal(calls[0][0],'staff@example.com');
 assert.equal(calls[0][1].redirectTo,'https://tcs-operations-hub.vercel.app/password-recovery');
 await assert.rejects(requestStaffPasswordReset(client,'bad'));assert.equal(calls.length,1);
 failure=new Error('Email rate limit');await assert.rejects(requestStaffPasswordReset(client,'staff@example.com'),/Email rate limit/);assert.equal(calls.length,2);
});
test('private links and email recovery sessions verify only in the supplied isolated client',async()=>{
 const calls=[];const result={data:{user:{id:'existing-user'},session:{access_token:'synthetic'}},error:null};
 const client={auth:{verifyOtp:async v=>{calls.push(['otp',v]);return result},setSession:async v=>{calls.push(['session',v]);return result}}};
 await verifyRecoveryProof(client,readRecoveryProof('#type=recovery&token_hash='+'a'.repeat(32)));
 await verifyRecoveryProof(client,readRecoveryProof('#type=recovery&access_token=synthetic-access&refresh_token=synthetic-refresh'));
 assert.equal(calls[0][0],'otp');assert.equal(calls[0][1].type,'recovery');assert.equal(calls[1][0],'session');assert.equal(calls[1][1].access_token,'synthetic-access');
 for(const fragment of ['', '#type=invite&access_token=a&refresh_token=b','#type=recovery&access_token=a','#error=access_denied&type=recovery&token_hash='+'a'.repeat(32)]){
  const proof=readRecoveryProof(fragment);assert.equal(proof.kind,'invalid');await assert.rejects(verifyRecoveryProof(client,proof));
 }
 assert.equal(calls.length,2);
 result.error=new Error('Expired');await assert.rejects(verifyRecoveryProof(client,readRecoveryProof('#type=recovery&token_hash='+'b'.repeat(32))),/Expired/);
});
