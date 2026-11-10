import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const VERSION = '1.0.1';
const BUILD = '6'; // Candidate: verify availability in App Store Connect before upload.
const BUNDLE = 'com.thomasonchildcaresolutions.thehub';
const BASE = '40655ecf8e8222b7978b429002ed5065ed38cba3';
const APP_CONFIGS = ['504EC3171FED79650016851F', '504EC3181FED79650016851F'];

function patchProject(source) {
  let output = source;
  for (const id of APP_CONFIGS) {
    const pattern = new RegExp(`^\\t\\t${id} /\\* (Debug|Release) \\*/ = \\{[\\s\\S]*?^\\t\\t\\};`, 'gm');
    const blocks = [...output.matchAll(pattern)];
    assert.equal(blocks.length, 1, `Expected exactly one app configuration ${id}.`);
    const block = blocks[0][0];
    assert.ok(block.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${BUNDLE};`), 'App identity mismatch.');
    assert.ok(block.includes('DEVELOPMENT_TEAM = 6Y2923TFK5;'), 'Signing team mismatch.');
    const versions = [...block.matchAll(/MARKETING_VERSION = ([^;]+);/g)];
    const builds = [...block.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)];
    assert.equal(versions.length, 1, 'Ambiguous version setting.');
    assert.equal(builds.length, 1, 'Ambiguous build setting.');
    const oldVersion = versions[0][1];
    const oldBuild = builds[0][1];
    assert.ok((oldVersion === '1.0' && oldBuild === '5') || (oldVersion === VERSION && oldBuild === BUILD),
      `Unexpected existing version ${oldVersion} (${oldBuild}); refusing to overwrite or downgrade it.`);
    output = output.replace(block, block.replace(/MARKETING_VERSION = [^;]+;/, `MARKETING_VERSION = ${VERSION};`)
      .replace(/CURRENT_PROJECT_VERSION = [^;]+;/, `CURRENT_PROJECT_VERSION = ${BUILD};`));
  }
  return output;
}

function patchConfig(source) {
  const config = JSON.parse(source);
  assert.equal(config.appId, BUNDLE, 'Capacitor app identity mismatch.');
  assert.equal(config.webDir, 'www-native', 'Unexpected native asset directory.');
  assert.ok(!config.server?.url, 'Refusing to change a remote-hosted native app.');
  assert.ok(['TheHubIOS/1.0 Capacitor', `TheHubIOS/${VERSION} Capacitor`].includes(config.ios?.appendUserAgent),
    'Unexpected user agent; review the native version before applying.');
  config.ios.appendUserAgent = `TheHubIOS/${VERSION} Capacitor`;
  return JSON.stringify(config, null, 2) + '\n';
}

function selfTest() {
  const block = (id, name) => `\t\t${id} /* ${name} */ = {\n\t\t\tbuildSettings = {\n\t\t\t\tCURRENT_PROJECT_VERSION = 5;\n\t\t\t\tMARKETING_VERSION = 1.0;\n\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = ${BUNDLE};\n\t\t\t\tDEVELOPMENT_TEAM = 6Y2923TFK5;\n\t\t\t};\n\t\t};`;
  const fixture = APP_CONFIGS.map((id, i) => block(id, i ? 'Release' : 'Debug')).join('\n') + '\n// Test target: CURRENT_PROJECT_VERSION = 1; MARKETING_VERSION = 1.0;\n';
  const changed = patchProject(fixture);
  assert.equal((changed.match(/MARKETING_VERSION = 1\.0\.1;/g) || []).length, 2);
  assert.equal((changed.match(/CURRENT_PROJECT_VERSION = 6;/g) || []).length, 2);
  assert.ok(changed.includes('// Test target: CURRENT_PROJECT_VERSION = 1; MARKETING_VERSION = 1.0;'));
  assert.equal(patchProject(changed), changed);
  assert.throws(() => patchProject(fixture.replace('CURRENT_PROJECT_VERSION = 5;', 'CURRENT_PROJECT_VERSION = 7;')));
  assert.throws(() => patchProject(fixture.replace(BUNDLE, 'com.example.other')));
  assert.throws(() => patchProject(fixture.replace(APP_CONFIGS[0], '000000000000000000000000')));
  const config = JSON.stringify({appId:BUNDLE,webDir:'www-native',server:{hostname:'localhost'},ios:{appendUserAgent:'TheHubIOS/1.0 Capacitor'}});
  assert.equal(JSON.parse(patchConfig(config)).ios.appendUserAgent, 'TheHubIOS/1.0.1 Capacitor');
  assert.equal(patchConfig(patchConfig(config)), patchConfig(config));
  assert.throws(() => patchConfig(config.replace('"hostname":"localhost"', '"url":"https://example.invalid"')));
  console.log('10 release-preparation assertions passed using synthetic fixtures. No native app or live account was tested.');
}

async function prepare(apply) {
  const nativeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const repoRoot = resolve(nativeRoot, '../..');
  execFileSync('git', ['-C', repoRoot, 'merge-base', '--is-ancestor', BASE, 'HEAD'], {stdio:'pipe'});
  const screen = await readFile(join(repoRoot, 'src/app/(portal)/transportation-v2/page.tsx'), 'utf8');
  const groups = await readFile(join(repoRoot, 'src/components/transportation/SchoolStopGroups.tsx'), 'utf8');
  const exportScript = await readFile(join(nativeRoot, 'scripts/prepare-web.mjs'), 'utf8');
  for (const marker of ['markPickedUp(route)', 'markArrived(route)', 'checkIntoLocation(route)', 'confirmExternalDropoff(route)', 'disabled={!emergencyReady', 'externalEmergencyReview']) {
    assert.ok(screen.includes(marker), `Missing transportation source marker: ${marker}`);
  }
  assert.ok(groups.includes('data-transport-schedule="driver-city"') && groups.includes('thanksgiving'), 'Expected schedule layout is missing.');
  assert.ok(exportScript.includes('../transportation-v2/page'), 'Native transportation route mapping is missing.');
  const plist = await readFile(join(nativeRoot, 'ios/App/App/Info.plist'), 'utf8');
  assert.ok(plist.includes('$(MARKETING_VERSION)') && plist.includes('$(CURRENT_PROJECT_VERSION)'), 'Info.plist must use Xcode version settings.');
  const paths = ['ios/App/App.xcodeproj/project.pbxproj', 'capacitor.config.json'];
  const originals = await Promise.all(paths.map(path => readFile(join(nativeRoot, path), 'utf8')));
  const outputs = [patchProject(originals[0]), patchConfig(originals[1])];
  const changes = paths.map((path, i) => ({path:join(nativeRoot,path), original:originals[i], output:outputs[i]})).filter(file=>file.original!==file.output);
  console.log(`Candidate ${VERSION} (build ${BUILD}): ${changes.length} native metadata files need updating.`);
  console.log('Source markers found for the updated layout, individual custody steps and emergency checks. This is not an end-to-end test.');
  if (!apply || !changes.length) return;
  // Refuse to overwrite local edits; do not inspect credentials or signing files.
  execFileSync('git', ['-C', repoRoot, 'diff', '--quiet', 'HEAD', '--', ...paths.map(path=>`native/capacitor/${path}`)], {stdio:'pipe'});
  const staged = changes.map(file=>({...file, temporary:`${file.path}.release-${process.pid}.tmp`}));
  const written = [];
  try {
    for (const file of staged) await writeFile(file.temporary, file.output, {flag:'wx'});
    for (const file of staged) { await rename(file.temporary, file.path); written.push(file); }
  } catch (error) {
    for (const file of written) await writeFile(file.path, file.original);
    throw error;
  } finally {
    for (const file of staged) await rm(file.temporary, {force:true});
  }
  console.log('Native metadata updated. Rebuild/sync, simulator and device testing, signing, upload and Apple submission are still required.');
}

try {
  const args = process.argv.slice(2);
  assert.equal(args.length, 1, 'Usage: node scripts/prepare-release-1.0.1.mjs --check|--apply|--self-test');
  assert.ok(['--check','--apply','--self-test'].includes(args[0]), 'Choose --check, --apply, or --self-test.');
  if (args[0] === '--self-test') selfTest(); else await prepare(args[0] === '--apply');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
