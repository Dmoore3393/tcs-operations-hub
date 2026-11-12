import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
const root=await readFile('src/app/(portal)/child-file-audits/page.tsx','utf8');
const panel=await readFile('src/components/files/LocationFilesPanel.tsx','utf8');
const history=await readFile('src/app/(portal)/child-file-audits/history/page.tsx','utf8');
const api=await readFile('src/app/api/location-files/route.ts','utf8');

test('audits and files share one person/location file editor rather than the primary-location audit path',()=>{
 assert.match(root,/<LocationFilesPanel childAudits/);
 assert.doesNotMatch(root,/templateForChildLocation\(child\.location\)|child\.location\.toLowerCase|action:\s*["']save["']/);
 assert.match(root,/isSystemOwner\|\|isLocationLicensee/);
 assert.match(panel,/locationId:chosenSite\.id,personId,type:kind/);
 assert.match(panel,/id:file\.id,expectedUpdatedAt:file\.updated_at,file:draft/);
 assert.match(api,/\.from\("location_person_files"\)\.update\(changes\)/);
});
test('all-locations mode requires a target; the cross-site child picker is not filtered to primary enrollment',()=>{
 assert.match(panel,/activeLocation === "All Locations" \? undefined/);
 assert.match(panel,/kind==="Child"\?data\.children\.map/);
 assert.doesNotMatch(panel,/data\.children\.filter|child\.location===chosenSite/);
 assert.match(panel,/Child.*Staff/);
 assert.match(panel,/f\.location_id===chosenSite\.id&&f\.child_id===child\.id/);
 assert.match(panel,/if\(existing\)\{setAdding\(false\);setEditing\(existing\);return;\}/);
});
test('legacy audit history is read-only and remains reachable',()=>{
 assert.match(root,/href="\/child-file-audits\/history"/);
 assert.match(history,/fetch\("\/api\/children"/);
 assert.doesNotMatch(history,/method:\s*["'](?:POST|PATCH|PUT|DELETE)["']|<form|setChildren/);
 assert.match(history,/audit\.notes/);assert.match(history,/audit\.items\.map/);
});
test('site-named saves and unsaved-close protection are retained',()=>{
 assert.match(panel,/Save \$\{site\?\.name\|\|"this location"\} file audit/);
 assert.match(panel,/window\.confirm\(`Discard unsaved changes/);
 assert.match(panel,/beforeunload/);
 assert.match(panel,/key=\{profile\.user_id\}/);
});
