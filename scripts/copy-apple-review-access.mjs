// One-time release operation. Never logs, saves, or changes reviewer passwords.
// Use only with an explicitly authorized temporary App Store Connect API key.
import {readFileSync, statSync} from 'node:fs';
import {sign} from 'node:crypto';

const [keyPath, keyId, issuerId, operation = 'inspect'] = process.argv.slice(2);
if (!keyPath || !keyId || !issuerId || !['inspect', 'copy'].includes(operation)) {
  throw new Error('Usage: node scripts/copy-apple-review-access.mjs KEY_PATH KEY_ID ISSUER_ID inspect|copy');
}
if ((statSync(keyPath).mode & 0o077) !== 0) throw new Error('Private key must have owner-only permissions.');
const oldApp = '6817598608', publicApp = '6838407438';
const expectedUser = 'f38bea87-fffb-4c92-b226-ed819fe4e6a9';
const expectedOrg = '7024880e-865a-4148-ad75-723099f83ff0';
const apiOrigin = 'https://api.appstoreconnect.apple.com';
const encode = (data) => Buffer.from(JSON.stringify(data)).toString('base64url');
const privateKey = readFileSync(keyPath);
async function apple(path, method = 'GET', body) {
  const url = new URL(path, apiOrigin);
  if (url.origin !== apiOrigin || !url.pathname.startsWith('/v1/')) throw new Error('Unexpected Apple API destination.');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({alg: 'ES256', kid: keyId, typ: 'JWT'})}.${encode({iss: issuerId, iat: now, exp: now + 120, aud: 'appstoreconnect-v1', ...(method === 'GET' ? {scope: [`GET ${url.pathname}${url.search}`]} : {})})}`;
  const token = `${unsigned}.${sign('sha256', Buffer.from(unsigned), {key: privateKey, dsaEncoding: 'ieee-p1363'}).toString('base64url')}`;
  const response = await fetch(url, {method, headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000)});
  const data = await response.json();
  if (!response.ok) throw new Error(`Apple API ${response.status}: ${(data.errors ?? []).map(e => e.code).join(',')}`);
  return data;
}
async function review(app, versionString) {
  const versions = await apple(`/v1/apps/${app}/appStoreVersions?filter[platform]=IOS&limit=50`);
  const version = versions.data.find(v => v.attributes.versionString === versionString);
  if (!version) throw new Error('Expected app version missing.');
  const details = await apple(`/v1/appStoreVersions/${version.id}/appStoreReviewDetail`);
  return {version, details: details.data};
}
const source = await review(oldApp, '1.0.1');
const target = await review(publicApp, '1.0.0');
const name = source.details.attributes.demoAccountName;
const password = source.details.attributes.demoAccountPassword;
const hasSavedAccess = typeof name === 'string' && !!name && typeof password === 'string' && !!password && !/^\*+$/.test(password);
console.log(JSON.stringify({sourceApp: oldApp, targetApp: publicApp, targetVersion: target.version.id, targetState: target.version.attributes.appStoreState, savedReviewAccessAvailable: hasSavedAccess}));
if (operation === 'copy') {
  if (!hasSavedAccess) throw new Error('Apple did not return reusable saved review access.');
  if (target.version.attributes.appStoreState !== 'PREPARE_FOR_SUBMISSION') throw new Error('Target version is no longer a draft.');
  const publicKey = process.env.TCS_SUPABASE_PUBLISHABLE_KEY;
  if (!publicKey) throw new Error('Public Supabase client key is required to verify the isolated reviewer.');
  const login = await fetch('https://hzxkjtprweodwbdmatoq.supabase.co/auth/v1/token?grant_type=password', {method: 'POST', headers: {apikey: publicKey, 'Content-Type': 'application/json'}, body: JSON.stringify({email: name, password}), signal: AbortSignal.timeout(30000)});
  const session = await login.json();
  if (!login.ok || !session.access_token) throw new Error('Existing review access could not be authenticated.');
  try {
    if (session.user?.id !== expectedUser) throw new Error('Existing review access is not the designated synthetic reviewer.');
    const currentName = target.details.attributes.demoAccountName;
    if (currentName && currentName !== name) throw new Error('The target already has different review access; refusing to overwrite it.');
    const profileResponse = await fetch('https://tcs-operations-hub.vercel.app/api/auth/profile', {method: 'POST', headers: {Authorization: `Bearer ${session.access_token}`}, signal: AbortSignal.timeout(30000)});
    const profile = await profileResponse.json();
    if (!profileResponse.ok || profile.profile?.organization_id !== expectedOrg || profile.profile?.user_id !== expectedUser || profile.bootstrapped) throw new Error('Reviewer is not isolated to the expected synthetic organization.');
    await apple(`/v1/appStoreReviewDetails/${target.details.id}`, 'PATCH', {data: {type: 'appStoreReviewDetails', id: target.details.id, attributes: {demoAccountRequired: true, demoAccountName: name, demoAccountPassword: password}}});
    const verified = await apple(`/v1/appStoreReviewDetails/${target.details.id}`);
    if (verified.data.attributes.demoAccountName !== name || !verified.data.attributes.demoAccountRequired) throw new Error('Review details did not persist as expected.');
    console.log(JSON.stringify({reviewAccessSaved: true, syntheticReviewerVerified: true, passwordsChanged: false}));
  } finally {
    await fetch('https://hzxkjtprweodwbdmatoq.supabase.co/auth/v1/logout?scope=local', {method: 'POST', headers: {apikey: publicKey, Authorization: `Bearer ${session.access_token}`}, signal: AbortSignal.timeout(15000)}).catch(() => undefined);
  }
}
