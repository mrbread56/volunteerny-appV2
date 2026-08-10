/**
 * Deploy firestore.rules to the live named database.
 *
 *   npm run deploy:rules
 *
 * The Firebase CLI is not a dependency of this project, and `firebase deploy`
 * also targets the "(default)" database, which does not exist here — this
 * project only has named databases. This publishes a new ruleset and points
 * the cloud.firestore release for FIREBASE_DATABASE_ID at it, using the service
 * account already in .env.
 *
 * It prints the ruleset it replaced, so a bad deploy can be rolled back with:
 *   npm run deploy:rules -- --rollback <previous-ruleset-name>
 */
import './env';
import * as admin from 'firebase-admin';
import fs from 'node:fs';


const a: any = (admin as any).default || admin;
const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!key) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY is not set.');
  process.exit(1);
}
const sa = JSON.parse(key);
const app = a.initializeApp({ credential: a.credential.cert(sa) });

const PROJECT = sa.project_id;
const DB = process.env.FIREBASE_DATABASE_ID;
if (!DB) {
  console.error('FIREBASE_DATABASE_ID is not set — refusing to guess which database to target.');
  process.exit(1);
}

const rollbackTo = process.argv.includes('--rollback')
  ? process.argv[process.argv.indexOf('--rollback') + 1]
  : null;

(async () => {
  const at = (await (app.options.credential as any).getAccessToken()).access_token;
  const headers = { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' };
  const release = `projects/${PROJECT}/releases/cloud.firestore/${DB}`;

  const before = await fetch(`https://firebaserules.googleapis.com/v1/${release}`, { headers });
  const previous = before.ok ? (await before.json()).rulesetName : '(none)';
  console.log('current ruleset:', previous);

  let rulesetName = rollbackTo;
  if (!rulesetName) {
    const source = fs.readFileSync('firestore.rules', 'utf8');

    // firestore.rules cannot read env vars, so the developer bootstrap
    // allowlist is duplicated there as a literal. Duplicated constants drift,
    // and this one drifts silently in the worst direction: an email in
    // VITE_DEVELOPER_EMAILS but not in the rules gets the entire Control Room
    // UI and permission-denied on every privileged operation. Refuse to ship
    // that rather than let someone discover it in production.
    const inRules = (source.match(/function developerEmails\(\)\s*\{\s*return \[([^\]]*)\]/) || [])[1];
    if (inRules === undefined) {
      console.error('firestore.rules has no developerEmails() function — cannot verify the allowlist.');
      process.exit(1);
    }
    const norm = (list: string[]) => [...new Set(list.map((e) => e.trim().replace(/^['"]|['"]$/g, '').toLowerCase()).filter(Boolean))].sort();
    const rulesList = norm(inRules.split(','));
    const envList = norm((process.env.VITE_DEVELOPER_EMAILS || '').split(','));
    if (JSON.stringify(rulesList) !== JSON.stringify(envList)) {
      console.error('developer allowlist mismatch — refusing to deploy.');
      console.error(`  firestore.rules      : ${rulesList.join(', ') || '(empty)'}`);
      console.error(`  VITE_DEVELOPER_EMAILS: ${envList.join(', ') || '(empty)'}`);
      console.error('  Make them identical, then deploy. Both must list every developer.');
      process.exit(1);
    }

    const created = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: source }] } }),
    });
    const body = await created.json();
    if (!created.ok) {
      // A syntax or compile error comes back here with line numbers.
      console.error('ruleset rejected:\n' + JSON.stringify(body, null, 2));
      process.exit(1);
    }
    rulesetName = body.name;
    console.log('new ruleset  :', rulesetName);
  }

  const updated = await fetch(`https://firebaserules.googleapis.com/v1/${release}?updateMask=rulesetName`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ release: { name: release, rulesetName } }),
  });
  const out = await updated.json();
  if (!updated.ok) {
    console.error('release update failed:\n' + JSON.stringify(out, null, 2));
    process.exit(1);
  }

  console.log(`deployed to  : ${DB}`);
  console.log(`roll back with: npm run deploy:rules -- --rollback ${previous}`);

  // ── Storage rules ──
  //
  // These were never published by anything. `firebase deploy` is not available
  // (the CLI is not a dependency, see the header), so storage.rules sat in the
  // repo being edited and reviewed while the bucket enforced whatever was set
  // when the project was created. That went unnoticed until uploads moved from
  // base64-in-Firestore to real Storage: the app started writing to
  // reports/{uid}/ and students/{uid}/ against rules that had never heard of
  // those paths, and every upload hung.
  //
  // Same two-step as above: create a ruleset, point the release at it. The
  // release name for Storage is the bucket, not the database.
  if (rollbackTo) {
    console.log('\n(storage rules skipped during a rollback — roll them back explicitly if needed)');
    return;
  }

  const bucket = process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucket) {
    console.error('\nVITE_FIREBASE_STORAGE_BUCKET is not set — storage.rules NOT deployed.');
    process.exit(1);
  }
  if (!fs.existsSync('storage.rules')) {
    console.error('\nstorage.rules is missing — nothing to deploy.');
    process.exit(1);
  }

  console.log('\n── storage rules ──');
  const storageRelease = `projects/${PROJECT}/releases/firebase.storage/${bucket}`;
  const sBefore = await fetch(`https://firebaserules.googleapis.com/v1/${storageRelease}`, { headers });
  const sPrevious = sBefore.ok ? (await sBefore.json()).rulesetName : '(none)';
  console.log('current ruleset:', sPrevious);

  const sCreated = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      source: { files: [{ name: 'storage.rules', content: fs.readFileSync('storage.rules', 'utf8') }] },
    }),
  });
  const sBody = await sCreated.json();
  if (!sCreated.ok) {
    console.error('storage ruleset rejected:\n' + JSON.stringify(sBody, null, 2));
    process.exit(1);
  }
  console.log('new ruleset  :', sBody.name);

  // PATCH updates an existing release; it 404s when there has never been one,
  // which is exactly the state a bucket is in if its rules were never
  // published. The first deploy has to CREATE the release instead.
  const firstPublish = sPrevious === '(none)';
  const sUpdated = firstPublish
    ? await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: storageRelease, rulesetName: sBody.name }),
      })
    : await fetch(`https://firebaserules.googleapis.com/v1/${storageRelease}?updateMask=rulesetName`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ release: { name: storageRelease, rulesetName: sBody.name } }),
      });
  const sOut = await sUpdated.json();
  if (!sUpdated.ok) {
    console.error('storage release update failed:\n' + JSON.stringify(sOut, null, 2));
    process.exit(1);
  }
  console.log(`deployed to  : ${bucket}`);
  console.log(`roll back with: (storage) previous ruleset was ${sPrevious}`);
})();
