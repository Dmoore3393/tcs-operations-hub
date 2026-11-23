import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {staticRootLayout} from '../native/capacitor/scripts/static-root-layout.mjs';
const source=readFileSync('src/app/layout.tsx','utf8');
test('the actual packaged root renders without request cookies while retaining language controls and branding',()=>{
 const result=staticRootLayout(source);assert.doesNotMatch(result,/next\/headers|cookies\s*\(/);assert.match(result,/const language="en"/);assert.match(result,/<LanguageProvider initialLanguage=\{language\}>/);assert.match(result,/<LanguageSwitch\/>/);assert.match(result,/Geist/);assert.match(result,/children/);
});
test('unexpected new server dependencies fail packaging rather than bypassing them',()=>{
 assert.throws(()=>staticRootLayout(source+'\nconst other = cookies();'),/still depends/);
 assert.throws(()=>staticRootLayout(source.replace('tcs_language','authorization')),/Review the root language/);
});
