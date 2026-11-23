import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('src/components/providers/AuthProvider.tsx','utf8');
const start=source.indexOf('supabase.auth.onAuthStateChange(')+'supabase.auth.onAuthStateChange('.length;
const callback=source.slice(start,source.indexOf('\n    });',start)+6);
function fixture(verified='same',fail=false) {
 const loading=[],profiles=[],checks=[],tasks=[];
 const context={signingOutRef:{current:false},verifiedStaffUserRef:{current:verified},setIsPasswordRecovery(){},setSession(){},setProfile:p=>profiles.push(p),setLoading:v=>loading.push(v),setAccessError(){},clearImportDrafts(){},window:{sessionStorage:{},setTimeout:fn=>tasks.push(fn)},loadProfile:async s=>{checks.push(s.user.id);if(fail)throw Error('Access revoked');}};
 const onChange=vm.runInNewContext('('+callback+')',context);
 return {context,loading,profiles,checks,async run(event,id='same'){onChange(event,id?{user:{id}}:null);for(const fn of tasks.splice(0))fn();await new Promise(setImmediate);}};
}
test('focus sign-ins and token renewals recheck access without replacing the current workspace',async()=>{
 for(const event of ['SIGNED_IN','TOKEN_REFRESHED','INITIAL_SESSION']){const f=fixture();await f.run(event);assert.deepEqual(f.checks,['same']);assert.equal(f.loading.includes(true),false);}
});
test('new accounts and password recovery still block until checked',async()=>{
 for(const [verified,event,id] of [[null,'SIGNED_IN','same'],['same','SIGNED_IN','different'],['same','PASSWORD_RECOVERY','same']]){const f=fixture(verified);await f.run(event,id);assert.equal(f.loading[0],true);assert.equal(f.checks.length,1);}
});
test('background access failure clears the verified account and profile',async()=>{
 const f=fixture('same',true);await f.run('TOKEN_REFRESHED');assert.equal(f.context.verifiedStaffUserRef.current,null);assert.deepEqual(f.profiles,[null]);
});
test('sign out clears verified access immediately',async()=>{
 const f=fixture();await f.run('SIGNED_OUT',null);assert.equal(f.context.verifiedStaffUserRef.current,null);assert.deepEqual(f.profiles,[null]);assert.equal(f.checks.length,0);
});
