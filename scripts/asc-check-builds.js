#!/usr/bin/env node
// Check App Store Connect for builds of our app — to diagnose whether the
// EAS submission actually reached Apple or failed in transit.

const fs = require('fs');
const crypto = require('crypto');

const KEY_PATH = process.env.EXPO_ASC_API_KEY_PATH;
const KEY_ID = process.env.EXPO_ASC_KEY_ID;
const ISSUER_ID = process.env.EXPO_ASC_ISSUER_ID;
const ASC_APP_ID = process.env.USF_ASC_APP_ID ?? '6769724545';

if (!KEY_PATH || !KEY_ID || !ISSUER_ID) {
  console.error('Missing EXPO_ASC_API_KEY_PATH / EXPO_ASC_KEY_ID / EXPO_ASC_ISSUER_ID');
  process.exit(2);
}

function b64u(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function derToJose(der) {
  if (der[0] !== 0x30) throw new Error('Invalid DER');
  let i = 1;
  if (der[i] & 0x80) i += (der[i] & 0x7f) + 1;
  else i += 1;
  if (der[i] !== 0x02) throw new Error('Invalid DER R');
  i++;
  const rLen = der[i++];
  let r = der.slice(i, i + rLen);
  i += rLen;
  if (der[i] !== 0x02) throw new Error('Invalid DER S');
  i++;
  const sLen = der[i++];
  let s = der.slice(i, i + sLen);
  while (r.length > 32 && r[0] === 0) r = r.slice(1);
  while (s.length > 32 && s[0] === 0) s = s.slice(1);
  return Buffer.concat([Buffer.alloc(32 - r.length), r, Buffer.alloc(32 - s.length), s]);
}

function jwt() {
  const p8 = fs.readFileSync(KEY_PATH, 'utf-8');
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: ISSUER_ID, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' };
  const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  const signer = crypto.createSign('SHA256');
  signer.update(input);
  signer.end();
  return `${input}.${b64u(derToJose(signer.sign(p8)))}`;
}

async function asc(method, path) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${jwt()}`,
      'content-type': 'application/json',
    },
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, text };
}

async function main() {
  console.log(`Querying App Store Connect for builds of app ${ASC_APP_ID}…\n`);

  // Builds belonging to the app
  const r1 = await asc('GET', `/v1/builds?filter[app]=${ASC_APP_ID}&limit=10&sort=-uploadedDate&fields[builds]=version,uploadedDate,processingState,expirationDate,minOsVersion`);
  console.log('--- /v1/builds ---');
  console.log(`HTTP ${r1.status}`);
  if (r1.ok) {
    try {
      const j = JSON.parse(r1.text);
      const builds = j.data ?? [];
      console.log(`${builds.length} build(s) found:`);
      for (const b of builds) {
        console.log(`  · id=${b.id}`);
        console.log(`    version=${b.attributes?.version}`);
        console.log(`    uploadedDate=${b.attributes?.uploadedDate}`);
        console.log(`    processingState=${b.attributes?.processingState}`);
        console.log(`    expirationDate=${b.attributes?.expirationDate}`);
        console.log(`    minOsVersion=${b.attributes?.minOsVersion}`);
      }
    } catch (e) {
      console.log(r1.text.slice(0, 500));
    }
  } else {
    console.log(r1.text.slice(0, 500));
  }

  // PreReleaseVersions
  console.log('\n--- /v1/preReleaseVersions ---');
  const r2 = await asc('GET', `/v1/preReleaseVersions?filter[app]=${ASC_APP_ID}&limit=10`);
  console.log(`HTTP ${r2.status}`);
  if (r2.ok) {
    try {
      const j = JSON.parse(r2.text);
      console.log(`${j.data?.length ?? 0} prerelease version(s)`);
      for (const v of j.data ?? []) {
        console.log(`  · ${v.attributes?.version} (${v.attributes?.platform})`);
      }
    } catch (e) {
      console.log(r2.text.slice(0, 500));
    }
  } else {
    console.log(r2.text.slice(0, 500));
  }

  // App info
  console.log('\n--- /v1/apps/{id} ---');
  const r3 = await asc('GET', `/v1/apps/${ASC_APP_ID}`);
  console.log(`HTTP ${r3.status}`);
  if (r3.ok) {
    try {
      const j = JSON.parse(r3.text);
      const a = j.data;
      console.log(`  name="${a.attributes?.name}"`);
      console.log(`  bundleId=${a.attributes?.bundleId}`);
      console.log(`  primaryLocale=${a.attributes?.primaryLocale}`);
      console.log(`  sku=${a.attributes?.sku}`);
    } catch (e) {
      console.log(r3.text.slice(0, 500));
    }
  } else {
    console.log(r3.text.slice(0, 500));
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
