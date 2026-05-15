#!/usr/bin/env node
// Creates an App Store Connect app record for our bundle ID by calling the
// ASC REST API directly. Required because `eas submit` in non-interactive
// mode bails when no record exists yet ("Set ascAppId in submit profile").
//
// After this script succeeds, write the returned ascAppId into eas.json's
// submit.production.ios.ascAppId and re-run `eas submit`.
//
// Required env vars:
//   EXPO_ASC_API_KEY_PATH — path to .p8
//   EXPO_ASC_KEY_ID       — 10-char Apple key id
//   EXPO_ASC_ISSUER_ID    — issuer UUID
//   USF_APP_NAME          — App name (default: "Urban Super Foodie")
//   USF_BUNDLE_ID         — bundle identifier (default: com.urbansuperfoodie.app)
//   USF_SKU               — SKU; unique per team (default: derived from date)
//   USF_PRIMARY_LOCALE    — App primary locale (default: en-US)

const fs = require('fs');
const crypto = require('crypto');

const KEY_PATH = process.env.EXPO_ASC_API_KEY_PATH;
const KEY_ID = process.env.EXPO_ASC_KEY_ID;
const ISSUER_ID = process.env.EXPO_ASC_ISSUER_ID;
const APP_NAME = process.env.USF_APP_NAME ?? 'Urban Super Foodie';
const BUNDLE_ID = process.env.USF_BUNDLE_ID ?? 'com.urbansuperfoodie.app';
const SKU =
  process.env.USF_SKU ?? `USF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
const PRIMARY_LOCALE = process.env.USF_PRIMARY_LOCALE ?? 'en-US';

if (!KEY_PATH || !KEY_ID || !ISSUER_ID) {
  console.error(
    'Missing EXPO_ASC_API_KEY_PATH / EXPO_ASC_KEY_ID / EXPO_ASC_ISSUER_ID'
  );
  process.exit(2);
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Convert an ASN.1 DER ECDSA signature to the raw R||S format that JWT
// (RFC 7515) requires. P-256 → 64-byte output (32-byte R + 32-byte S).
function derToJoseEs256(der) {
  if (der[0] !== 0x30) throw new Error('Invalid DER signature: missing 0x30');
  let i = 1;
  // SEQUENCE length (one or two bytes)
  if (der[i] & 0x80) i += (der[i] & 0x7f) + 1;
  else i += 1;
  if (der[i] !== 0x02) throw new Error('Invalid DER: missing INTEGER for R');
  i++;
  const rLen = der[i++];
  let r = der.slice(i, i + rLen);
  i += rLen;
  if (der[i] !== 0x02) throw new Error('Invalid DER: missing INTEGER for S');
  i++;
  const sLen = der[i++];
  let s = der.slice(i, i + sLen);
  // Strip leading zero bytes (added by ASN.1 to keep INTEGER positive)
  while (r.length > 32 && r[0] === 0) r = r.slice(1);
  while (s.length > 32 && s[0] === 0) s = s.slice(1);
  if (r.length > 32 || s.length > 32) {
    throw new Error(`Invalid DER: R/S longer than 32 bytes (r=${r.length}, s=${s.length})`);
  }
  const rPad = Buffer.concat([Buffer.alloc(32 - r.length), r]);
  const sPad = Buffer.concat([Buffer.alloc(32 - s.length), s]);
  return Buffer.concat([rPad, sPad]);
}

function makeAscJwt() {
  const p8 = fs.readFileSync(KEY_PATH, 'utf-8');
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: ISSUER_ID,
    iat: now,
    exp: now + 1200, // 20 min (ASC max is 20 min)
    aud: 'appstoreconnect-v1',
  };
  const h = base64UrlEncode(JSON.stringify(header));
  const p = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${h}.${p}`;
  const signer = crypto.createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const derSig = signer.sign(p8);
  const joseSig = derToJoseEs256(derSig);
  return `${signingInput}.${base64UrlEncode(joseSig)}`;
}

async function ascCall(method, path, body) {
  const jwt = makeAscJwt();
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${jwt}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  return { status: res.status, ok: res.ok, json, raw: text };
}

async function findBundleIdResource() {
  // Bundle IDs are managed in the Developer Portal but the ASC API exposes them.
  const r = await ascCall(
    'GET',
    `/v1/bundleIds?filter[identifier]=${encodeURIComponent(BUNDLE_ID)}&limit=200`
  );
  if (!r.ok) {
    throw new Error(`bundleIds query failed: HTTP ${r.status} · ${r.raw.slice(0, 300)}`);
  }
  const match = (r.json?.data ?? []).find(
    (b) => b.attributes?.identifier === BUNDLE_ID
  );
  return match?.id ?? null;
}

async function findExistingApp() {
  const r = await ascCall(
    'GET',
    `/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=1`
  );
  if (!r.ok) {
    throw new Error(`apps query failed: HTTP ${r.status} · ${r.raw.slice(0, 300)}`);
  }
  return r.json?.data?.[0] ?? null;
}

async function main() {
  console.log(
    `Bundle: ${BUNDLE_ID} · Name: "${APP_NAME}" · SKU: ${SKU} · Locale: ${PRIMARY_LOCALE}`
  );

  console.log('1/3 · Check whether an App Store Connect record already exists…');
  const existing = await findExistingApp();
  if (existing) {
    console.log(
      `    ✓ Record already exists. ascAppId=${existing.id} · name="${existing.attributes?.name}"`
    );
    console.log(JSON.stringify({ ascAppId: existing.id }, null, 2));
    return;
  }
  console.log('    (no existing record)');

  console.log('2/3 · Look up the Bundle ID resource in the Developer Portal…');
  const bundleIdResourceId = await findBundleIdResource();
  if (!bundleIdResourceId) {
    throw new Error(
      `Bundle ID "${BUNDLE_ID}" not found in Developer Portal. Did EAS register it during build?`
    );
  }
  console.log(`    ✓ Bundle ID resource id: ${bundleIdResourceId}`);

  console.log('3/3 · Create App Store Connect app record…');
  const body = {
    data: {
      type: 'apps',
      attributes: {
        bundleId: BUNDLE_ID,
        name: APP_NAME,
        primaryLocale: PRIMARY_LOCALE,
        sku: SKU,
      },
      relationships: {
        bundleId: {
          data: { type: 'bundleIds', id: bundleIdResourceId },
        },
      },
    },
  };
  const create = await ascCall('POST', '/v1/apps', body);
  if (!create.ok) {
    throw new Error(
      `apps POST failed: HTTP ${create.status}\n${JSON.stringify(create.json ?? create.raw, null, 2).slice(0, 1500)}`
    );
  }
  const ascAppId = create.json?.data?.id;
  console.log(`    ✓ Created. ascAppId=${ascAppId}`);
  console.log(JSON.stringify({ ascAppId }, null, 2));
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
