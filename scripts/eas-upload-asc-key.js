#!/usr/bin/env node
// Uploads an App Store Connect API key into EAS's credential store via the
// EAS GraphQL API, so subsequent `eas build --non-interactive` can use it.
// This replaces the otherwise-required interactive `eas credentials` flow.
//
// Required env vars:
//   EXPO_TOKEN         — EAS auth token
//   EXPO_ASC_API_KEY_PATH — path to the .p8 file
//   EXPO_ASC_KEY_ID    — 10-char ASC API key ID (e.g. 8W2PU5MLN5)
//   EXPO_ASC_ISSUER_ID — ASC issuer UUID

const fs = require('fs');

const TOKEN = process.env.EXPO_TOKEN;
const KEY_PATH = process.env.EXPO_ASC_API_KEY_PATH;
const KEY_ID = process.env.EXPO_ASC_KEY_ID;
const ISSUER_ID = process.env.EXPO_ASC_ISSUER_ID;

if (!TOKEN || !KEY_PATH || !KEY_ID || !ISSUER_ID) {
  console.error(
    'Missing one of EXPO_TOKEN, EXPO_ASC_API_KEY_PATH, EXPO_ASC_KEY_ID, EXPO_ASC_ISSUER_ID'
  );
  process.exit(2);
}

const ENDPOINT = 'https://api.expo.dev/graphql';

async function gql(query, variables) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2));
    throw new Error(json.errors[0]?.message ?? 'GraphQL error');
  }
  return json.data;
}

async function main() {
  console.log('1/4 · Fetching account info via EAS GraphQL...');
  const meData = await gql(
    `query Me {
       meActor {
         __typename
         ... on UserActor {
           username
           primaryAccount { id name }
         }
         accounts { id name }
       }
     }`
  );
  const me = meData.meActor;
  if (!me) throw new Error('meActor returned null — check EXPO_TOKEN');
  const username = me.username ?? '(robot)';
  const primaryAccount =
    me.primaryAccount ?? me.accounts?.find((a) => a.name === username);
  if (!primaryAccount?.id) {
    console.error('Accounts available:', me.accounts);
    throw new Error('Could not determine accountId for current user');
  }
  console.log(
    `    username=${username} · accountId=${primaryAccount.id} · accountName=${primaryAccount.name}`
  );

  console.log('2/4 · Listing existing ASC API keys for the account...');
  const keysData = await gql(
    `query Keys($accountName: String!) {
       account {
         byName(accountName: $accountName) {
           id
           appStoreConnectApiKeysPaginated(first: 50) {
             edges {
               node {
                 id
                 keyIdentifier
                 issuerIdentifier
                 name
               }
             }
           }
         }
       }
     }`,
    { accountName: primaryAccount.name }
  );
  const existingKeys =
    keysData.account?.byName?.appStoreConnectApiKeysPaginated?.edges?.map(
      (e) => e.node
    ) ?? [];
  console.log(`    Found ${existingKeys.length} existing key(s).`);
  const match = existingKeys.find((k) => k.keyIdentifier === KEY_ID);
  if (match) {
    console.log(
      `    ✓ Key ${KEY_ID} already uploaded (EAS id: ${match.id}). Skipping upload.`
    );
    console.log(JSON.stringify({ keyId: KEY_ID, easId: match.id }, null, 2));
    return;
  }

  console.log('3/4 · Reading .p8 key file from disk...');
  const keyP8 = fs.readFileSync(KEY_PATH, 'utf-8');
  if (!keyP8.includes('BEGIN PRIVATE KEY')) {
    throw new Error(
      `File at ${KEY_PATH} does not look like a PEM private key`
    );
  }
  console.log(`    Read ${keyP8.length} chars.`);

  console.log('4/4 · Uploading via createAppStoreConnectApiKey mutation...');
  const mutData = await gql(
    `mutation CreateAscKey(
       $input: AppStoreConnectApiKeyInput!
       $accountId: ID!
     ) {
       appStoreConnectApiKey {
         createAppStoreConnectApiKey(
           appStoreConnectApiKeyInput: $input
           accountId: $accountId
         ) {
           id
           keyIdentifier
           issuerIdentifier
           name
         }
       }
     }`,
    {
      accountId: primaryAccount.id,
      input: {
        keyIdentifier: KEY_ID,
        issuerIdentifier: ISSUER_ID,
        keyP8,
        name: 'EAS Build (auto-uploaded by script)',
      },
    }
  );
  const created = mutData.appStoreConnectApiKey.createAppStoreConnectApiKey;
  console.log(
    `    ✓ Uploaded. EAS id=${created.id} · keyId=${created.keyIdentifier}`
  );
  console.log(
    JSON.stringify({ keyId: created.keyIdentifier, easId: created.id }, null, 2)
  );
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
