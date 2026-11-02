import test from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import ts from 'typescript';import {PGlite} from '@electric-sql/pglite';
const url=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const roles=url(await readFile('src/lib/team-access.ts','utf8')),config=url(await readFile('src/lib/location-config.ts','utf8'));
const {withStaffBackupLocations}=await import(url((await readFile('src/lib/server/staff-location-coverage.ts','utf8')).replace('import "server-only";','').replace('"@/lib/team-access"',JSON.stringify(roles)).replace('"@/lib/location-config"',JSON.stringify(config))));
test('staff backup profile keeps an active main location first and only adds open sites from the same organization',async()=>{
 const locations=[{organization_id:'org',name:'Halcom',is_active:true},{organization_id:'org',name:'Division',is_active:true},{organization_id:'org',name:'21st Street',is_active:false},{organization_id:'other',name:'Foreign',is_active:true}];
 const admin={from(table){assert.equal(table,'locations');const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},then(resolve){return Promise.resolve({data:locations.filter(row=>filters.every(([k,v])=>row[k]===v)),error:null}).then(resolve)}};return q}};
 for(const role of ['Employee','Location Licensee']){const original={organization_id:'org',role,locations:['Halcom'],permissions:['transportation']},before=structuredClone(original);const scoped=await withStaffBackupLocations(admin,original);assert.equal(scoped.primary_location,'Halcom');assert.deepEqual(scoped.locations,['Halcom','Division']);assert.deepEqual(original,before);assert.deepEqual(scoped.permissions,original.permissions);assert.equal(scoped.role,role);}
 const closed=await withStaffBackupLocations(admin,{organization_id:'org',role:'Employee',locations:['21st Street']});assert.equal(closed.primary_location,null);assert.ok(!closed.locations.includes('21st Street'));
 const owner=await withStaffBackupLocations({from(){throw Error('no extra owner read')}},{organization_id:'org',role:'Owner / Admin',locations:['All Locations']});assert.deepEqual(owner.locations,['All Locations']);
});
test('database gives current and future active staff same-program backup sites, preserving main assignments, closures and paused-account restrictions',async()=>{
 const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;const org=id(1),foreign=id(2),main=id(3),backup=id(4),closed=id(5),foreignSite=id(6),lic=id(10),employee=id(11),paused=id(12),foreignStaff=id(13);
 try{await db.exec(`create role anon;create role authenticated;create role service_role;
 create table staff_access(user_id uuid primary key,organization_id uuid,role text,is_active boolean,locations text[]);
 create table locations(id uuid primary key,organization_id uuid,slug text,name text,is_active boolean);
 create table staff_location_assignments(organization_id uuid,user_id uuid,location_id uuid,primary key(user_id,location_id));
 create function is_tcs_owner_role_text(text) returns boolean language sql as $$select $1='Owner / Admin'$$;
 create function tcs_location_slug(text) returns text language sql as $$select lower($1)$$;`);
 await db.query("insert into locations values($1,$2,'halcom','Halcom',true),($3,$2,'division','Division',true),($4,$2,'21st-street','21st Street',false),($5,$6,'foreign','Foreign',true)",[main,org,backup,closed,foreignSite,foreign]);
 for(const [who,organization,role,active,home]of[[lic,org,'Location Licensee',true,'Halcom'],[employee,org,'Employee',true,'Halcom'],[paused,org,'Employee',false,'Halcom'],[foreignStaff,foreign,'Employee',true,'Foreign']])await db.query('insert into staff_access values($1,$2,$3,$4,$5)',[who,organization,role,active,[home]]);
 const folder='supabase/migrations/',name=(await readdir(folder)).find(name=>name.endsWith('_staff_backup_locations.sql'));await db.exec(await readFile(folder+name,'utf8'));
 await db.exec(`create function existing_access_sync() returns trigger language plpgsql security definer set search_path=public as $$begin perform sync_staff_location_assignments_for_user(new.user_id);return new;end$$;create trigger access_sync after insert or update on staff_access for each row execute function existing_access_sync();`);
 for(const who of[lic,employee])assert.deepEqual((await db.query('select location_id from staff_location_assignments where user_id=$1 order by location_id',[who])).rows.map(row=>row.location_id),[main,backup]);
 assert.deepEqual((await db.query('select locations from staff_access where user_id=$1',[lic])).rows[0].locations,['Halcom']);assert.equal((await db.query('select * from staff_location_assignments where user_id=$1',[paused])).rows.length,0);
 assert.deepEqual((await db.query('select location_id from staff_location_assignments where user_id=$1',[foreignStaff])).rows.map(row=>row.location_id),[foreignSite]);
 await db.query("insert into staff_access values($1,$2,'Employee',true,$3)",[id(14),org,['Division']]);assert.equal((await db.query('select * from staff_location_assignments where user_id=$1',[id(14)])).rows.length,2);
 await db.query("insert into locations values($1,$2,'tehachapi','Tehachapi',true)",[id(7),org]);assert.equal((await db.query('select * from staff_location_assignments where user_id=$1',[employee])).rows.length,3);
 await db.query('update staff_access set is_active=false where user_id=$1',[employee]);assert.equal((await db.query('select * from staff_location_assignments where user_id=$1',[employee])).rows.length,0);
 assert.equal((await db.query("select has_function_privilege('authenticated','sync_staff_location_assignments_for_user(uuid)','execute') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
