#!/usr/bin/env node
// Links an already-uploaded ASC API key (in EAS's credential store) to a
// project's iOS app credentials for the SUBMISSION_SERVICE purpose. This is
// the step that EAS's interactive `eas submit` does when first encountering
// an app — and the step it refuses to do in --non-interactive mode.
//
// Required env vars:
//   EXPO_TOKEN     — EAS auth token
//   EXPO_ASC_KEY_ID — 10-char ASC API key Apple identifier (e.g. 8W2PU5MLN5)
//
// Optional env vars:
//   USF_ACCOUNT_NAME     — EAS account name (default: hverkasalo)
//   USF_PROJECT_FULLNAME — EAS project full name (default: @hverkasalo/urban-super-foodie)
//   USF_BUNDLE_ID        — bundle identifier (default: com.urbansuperfoodie.app)

const TOKEN = process.env.EXPO_TOKEN;
const KEY_ID = process.env.EXPO_ASC_KEY_ID;
const ACCOUNT_NAME = process.env.USF_ACCOUNT_NAME ?? 'hverkasalo';
const PROJECT_FULL_NAME =
  process.env.USF_PROJECT_FULLNAME ?? '@hverkasalo/urban-super-foodie';
const BUNDLE_ID = process.env.USF_BUNDLE_ID ?? 'com.urbansuperfoodie.app';

if (!TOKEN || !KEY_ID) {
  console.error('Missing EXPO_TOKEN or EXPO_ASC_KEY_ID');
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
  console.log(
    `Project: ${PROJECT_FULL_NAME} · Bundle: ${BUNDLE_ID} · ASC Key (Apple id): ${KEY_ID}`
  );

  console.log('1/5 · Resolve our ASC API key EAS id…');
  const keysData = await gql(
    `query Keys($accountName: String!) {
       account {
         byName(accountName: $accountName) {
           id
           appStoreConnectApiKeysPaginated(first: 50) {
             edges { node { id keyIdentifier issuerIdentifier name } }
           }
         }
       }
     }`,
    { accountName: ACCOUNT_NAME }
  );
  const keys =
    keysData.account.byName.appStoreConnectApiKeysPaginated.edges.map(
      (e) => e.node
    );
  const ascApiKey = keys.find((k) => k.keyIdentifier === KEY_ID);
  if (!ascApiKey) {
    throw new Error(
      `ASC API key with Apple id ${KEY_ID} not found in EAS — run eas-upload-asc-key.js first.`
    );
  }
  console.log(`    ✓ EAS asc-key id: ${ascApiKey.id}`);

  console.log('2/5 · Resolve AppleAppIdentifier for bundle id…');
  const aiData = await gql(
    `query Aai($accountName: String!, $bundleIdentifier: String!) {
       account {
         byName(accountName: $accountName) {
           appleAppIdentifiers(bundleIdentifier: $bundleIdentifier) {
             id
             bundleIdentifier
           }
         }
       }
     }`,
    { accountName: ACCOUNT_NAME, bundleIdentifier: BUNDLE_ID }
  );
  const appleAppIdentifier = aiData.account.byName.appleAppIdentifiers[0];
  if (!appleAppIdentifier) {
    throw new Error(`No AppleAppIdentifier registered for ${BUNDLE_ID}`);
  }
  console.log(`    ✓ AppleAppIdentifier id: ${appleAppIdentifier.id}`);

  console.log('3/5 · Look up project IosAppCredentials for that bundle…');
  const appData = await gql(
    `query ProjectCreds($fullName: String!, $aaiId: String!) {
       app {
         byFullName(fullName: $fullName) {
           id
           iosAppCredentials(filter: { appleAppIdentifierId: $aaiId }) {
             id
             appStoreConnectApiKeyForSubmissions { id keyIdentifier }
           }
         }
       }
     }`,
    { fullName: PROJECT_FULL_NAME, aaiId: appleAppIdentifier.id }
  );
  const appId = appData.app.byFullName?.id;
  if (!appId) throw new Error(`Project ${PROJECT_FULL_NAME} not found`);
  let iosAppCreds = appData.app.byFullName.iosAppCredentials?.[0];
  console.log(
    `    app.id=${appId} · iosAppCredentials.id=${iosAppCreds?.id ?? '(none yet)'}`
  );

  if (iosAppCreds?.appStoreConnectApiKeyForSubmissions?.id) {
    console.log(
      `    ✓ Already linked to ASC key Apple id ${iosAppCreds.appStoreConnectApiKeyForSubmissions.keyIdentifier}`
    );
    if (
      iosAppCreds.appStoreConnectApiKeyForSubmissions.keyIdentifier === KEY_ID
    ) {
      console.log('    Nothing to do.');
      console.log(JSON.stringify({ iosAppCredentialsId: iosAppCreds.id }, null, 2));
      return;
    }
    console.log('    Different key linked — re-pointing to ours…');
  }

  if (!iosAppCreds) {
    console.log('4/5 · Create IosAppCredentials record for this app+bundle…');
    const created = await gql(
      `mutation CreateCreds(
         $appId: ID!
         $appleAppIdentifierId: ID!
         $input: IosAppCredentialsInput!
       ) {
         iosAppCredentials {
           createIosAppCredentials(
             iosAppCredentialsInput: $input
             appId: $appId
             appleAppIdentifierId: $appleAppIdentifierId
           ) {
             id
           }
         }
       }`,
      {
        appId,
        appleAppIdentifierId: appleAppIdentifier.id,
        input: {},
      }
    );
    iosAppCreds = created.iosAppCredentials.createIosAppCredentials;
    console.log(`    ✓ Created IosAppCredentials id: ${iosAppCreds.id}`);
  } else {
    console.log('4/5 · IosAppCredentials already exists, skipping create.');
  }

  console.log(
    '5/5 · Assign ASC API key to app for SUBMISSION_SERVICE purpose…'
  );
  const linkData = await gql(
    `mutation Link($iosAppCredentialsId: ID!, $ascApiKeyId: ID!) {
       iosAppCredentials {
         setAppStoreConnectApiKeyForSubmissions(
           id: $iosAppCredentialsId
           ascApiKeyId: $ascApiKeyId
         ) {
           id
           appStoreConnectApiKeyForSubmissions { id keyIdentifier }
         }
       }
     }`,
    {
      iosAppCredentialsId: iosAppCreds.id,
      ascApiKeyId: ascApiKey.id,
    }
  );
  const linked = linkData.iosAppCredentials.setAppStoreConnectApiKeyForSubmissions;
  console.log(
    `    ✓ Linked. iosAppCredentialsId=${linked.id} · asc-key.keyIdentifier=${linked.appStoreConnectApiKeyForSubmissions.keyIdentifier}`
  );
  console.log(JSON.stringify({ iosAppCredentialsId: linked.id }, null, 2));
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
