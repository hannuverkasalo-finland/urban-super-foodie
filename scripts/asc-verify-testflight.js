#!/usr/bin/env node
// Verify the TestFlight setup end-to-end: build processed, internal tester
// added, build assigned to the group. Runs against Apple's ASC API directly.

const fs = require('fs');
const crypto = require('crypto');

const KEY_PATH = process.env.EXPO_ASC_API_KEY_PATH;
const KEY_ID = process.env.EXPO_ASC_KEY_ID;
const ISSUER_ID = process.env.EXPO_ASC_ISSUER_ID;
const ASC_APP_ID = process.env.USF_ASC_APP_ID ?? '6769724545';
const EXPECTED_TESTER_EMAIL = (
  process.env.USF_TESTER_EMAIL ?? 'merikupiainen@gmail.com'
).toLowerCase();

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

async function asc(path) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    headers: {
      authorization: `Bearer ${jwt()}`,
      'content-type': 'application/json',
    },
  });
  const text = await res.text();
  return {
    status: res.status,
    ok: res.ok,
    json: text ? JSON.parse(text) : null,
  };
}

async function main() {
  console.log(`Verifying TestFlight setup for app ${ASC_APP_ID}\n`);

  // === 1. Builds ===
  console.log('━━━ 1. Build status on App Store Connect ━━━');
  const r1 = await asc(
    `/v1/builds?filter[app]=${ASC_APP_ID}&limit=10&sort=-uploadedDate&fields[builds]=version,uploadedDate,processingState,expirationDate,minOsVersion,usesNonExemptEncryption`
  );
  if (!r1.ok) {
    console.log(`  HTTP ${r1.status} — error`);
    return;
  }
  const builds = r1.json?.data ?? [];
  if (builds.length === 0) {
    console.log('  ⏳ No builds visible yet — Apple may still be processing. Try again in a few minutes.');
  } else {
    for (const b of builds) {
      const state = b.attributes?.processingState;
      const icon = state === 'VALID' ? '✅' : state === 'PROCESSING' ? '⏳' : '⚠️';
      console.log(`  ${icon} Build ${b.attributes?.version} · ${state}`);
      console.log(`     uploaded: ${b.attributes?.uploadedDate}`);
      console.log(`     min iOS: ${b.attributes?.minOsVersion} · expires: ${b.attributes?.expirationDate}`);
      console.log(`     id: ${b.id}`);
    }
  }
  console.log();

  // === 2. Beta groups (internal testing) ===
  console.log('━━━ 2. Beta groups / internal testing ━━━');
  const r2 = await asc(
    `/v1/apps/${ASC_APP_ID}/betaGroups?fields[betaGroups]=name,isInternalGroup,hasAccessToAllBuilds,createdDate`
  );
  if (!r2.ok) {
    console.log(`  HTTP ${r2.status} — error`);
    return;
  }
  const groups = r2.json?.data ?? [];
  if (groups.length === 0) {
    console.log('  ❌ No beta groups configured for this app. You\'d need to create one or rely on built-in App Store Connect Users.');
  } else {
    for (const g of groups) {
      const kind = g.attributes?.isInternalGroup ? 'INTERNAL' : 'EXTERNAL';
      console.log(`  • ${g.attributes?.name} (${kind})`);
      console.log(`    id: ${g.id} · hasAccessToAllBuilds: ${g.attributes?.hasAccessToAllBuilds}`);
    }
  }
  console.log();

  // === 3. Beta testers for each group ===
  console.log('━━━ 3. Testers ━━━');
  let testerFound = false;
  for (const g of groups) {
    const r3 = await asc(
      `/v1/betaGroups/${g.id}/betaTesters?fields[betaTesters]=email,firstName,lastName,inviteType`
    );
    if (!r3.ok) {
      console.log(`  Group ${g.attributes?.name}: HTTP ${r3.status}`);
      continue;
    }
    const testers = r3.json?.data ?? [];
    console.log(`  Group "${g.attributes?.name}" has ${testers.length} tester(s):`);
    for (const t of testers) {
      const email = (t.attributes?.email ?? '').toLowerCase();
      const match = email === EXPECTED_TESTER_EMAIL;
      console.log(
        `    ${match ? '🎯' : '  '} ${t.attributes?.email} · ${t.attributes?.firstName ?? '?'} ${t.attributes?.lastName ?? '?'} · inviteType=${t.attributes?.inviteType ?? '?'}`
      );
      if (match) testerFound = true;
    }
  }
  console.log();

  // === 4. Builds assigned to each group ===
  console.log('━━━ 4. Builds available to each group ━━━');
  for (const g of groups) {
    const r4 = await asc(
      `/v1/betaGroups/${g.id}/builds?fields[builds]=version,processingState`
    );
    if (!r4.ok) {
      console.log(`  Group ${g.attributes?.name}: HTTP ${r4.status}`);
      continue;
    }
    const assignedBuilds = r4.json?.data ?? [];
    if (g.attributes?.hasAccessToAllBuilds) {
      console.log(`  Group "${g.attributes?.name}": has access to ALL builds (auto-distribution)`);
    } else {
      console.log(`  Group "${g.attributes?.name}": ${assignedBuilds.length} build(s) explicitly assigned`);
      for (const b of assignedBuilds) {
        console.log(`    • ${b.attributes?.version} · ${b.attributes?.processingState}`);
      }
    }
  }
  console.log();

  // === Summary ===
  console.log('━━━ Summary ━━━');
  const anyValid = builds.some((b) => b.attributes?.processingState === 'VALID');
  const anyProcessing = builds.some((b) => b.attributes?.processingState === 'PROCESSING');
  console.log(`  Build present:      ${builds.length > 0 ? '✅' : '❌'}`);
  console.log(`  Build processed:    ${anyValid ? '✅' : anyProcessing ? '⏳ still processing' : '❌'}`);
  console.log(`  Internal group:     ${groups.some((g) => g.attributes?.isInternalGroup) ? '✅' : '❌'}`);
  console.log(`  Wife as tester:     ${testerFound ? '✅' : '❌'} (${EXPECTED_TESTER_EMAIL})`);
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
