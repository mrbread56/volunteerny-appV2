/**
 * Publish firestore.indexes.json to the live named database.
 *
 *   npm run deploy:indexes
 *
 * Composite indexes are NOT part of rules and are not deployed by
 * `npm run deploy:rules`. They also do not travel with the data: restoring a
 * backup into a fresh database copies every document and none of the indexes.
 * The first query that needs one then fails with `failed-precondition`, which
 * surfaces to a student as an empty applications list — a failed read wearing
 * the costume of "you have not applied to anything".
 *
 * That is exactly what happened migrating to the Toronto database on 14 Aug
 * 2026: rules deployed, data restored, and `check:queries` immediately failed
 * on `applications (mine)`.
 *
 * Creating an index is asynchronous — the API returns an Operation and the
 * index builds in the background. This waits for each to reach READY so the
 * script cannot report success while queries are still failing.
 *
 * Idempotent: an index that already exists comes back 409 ALREADY_EXISTS and is
 * reported as such rather than treated as an error.
 */
import './env';
import fs from 'node:fs';
import adminNs from 'firebase-admin';

const admin: any = (adminNs as any).default ?? adminNs;

const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!key) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY is not set.');
  process.exit(1);
}
const sa = JSON.parse(key);
const databaseId = process.env.FIREBASE_DATABASE_ID;
if (!databaseId) {
  console.error('FIREBASE_DATABASE_ID is not set — refusing to guess which database to index.');
  process.exit(1);
}

const app = admin.initializeApp({ credential: admin.credential.cert(sa) }, 'deploy-indexes');
const BASE = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/${databaseId}`;

type IndexDef = {
  collectionGroup: string;
  queryScope: string;
  fields: { fieldPath: string; order?: string; arrayConfig?: string }[];
};

async function token(): Promise<string> {
  return (await app.options.credential.getAccessToken()).access_token;
}

/** An index is identified by its collection + ordered field list, not by a name. */
const signature = (idx: IndexDef) =>
  `${idx.collectionGroup}:${idx.fields.map((f) => `${f.fieldPath}${f.order || f.arrayConfig || ''}`).join(',')}`;

(async () => {
  const raw = JSON.parse(fs.readFileSync('firestore.indexes.json', 'utf8'));
  const wanted: IndexDef[] = (raw.indexes || []).filter((i: any) => i.collectionGroup);

  console.log(`database : ${databaseId}`);
  console.log(`defined  : ${wanted.length} composite index(es)\n`);

  const tok = await token();
  let created = 0;
  let existing = 0;
  let failed = 0;
  const pending: { name: string; label: string }[] = [];

  for (const idx of wanted) {
    // The '//' comment keys in the JSON are documentation, not API fields.
    const body = {
      queryScope: idx.queryScope || 'COLLECTION',
      fields: idx.fields.map((f) => {
        const out: any = { fieldPath: f.fieldPath };
        if (f.order) out.order = f.order;
        if (f.arrayConfig) out.arrayConfig = f.arrayConfig;
        return out;
      }),
    };
    const label = signature(idx);

    const res = await fetch(`${BASE}/collectionGroups/${idx.collectionGroup}/indexes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const op: any = await res.json();
      console.log(`[CREATE] ${label}`);
      created++;
      if (op?.name) pending.push({ name: op.name, label });
      continue;
    }

    const err: any = await res.json().catch(() => ({}));
    const message = err?.error?.message || `${res.status}`;
    if (res.status === 409 || /already exists/i.test(message)) {
      console.log(`[EXISTS] ${label}`);
      existing++;
    } else {
      console.error(`[FAIL  ] ${label}\n         ${message}`);
      failed++;
    }
  }

  // Building is asynchronous. Reporting success while an index is still
  // building would be reporting something untrue: queries fail until READY.
  if (pending.length) {
    console.log(`\nwaiting for ${pending.length} index(es) to finish building…`);
    const deadline = Date.now() + 10 * 60_000;
    while (pending.length && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000));
      const t = await token();
      for (let i = pending.length - 1; i >= 0; i--) {
        const r = await fetch(`https://firestore.googleapis.com/v1/${pending[i].name}`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        const op: any = await r.json().catch(() => ({}));
        if (op?.done) {
          console.log(`[READY ] ${pending[i].label}`);
          pending.splice(i, 1);
        }
      }
    }
    if (pending.length) {
      console.warn(`\n${pending.length} index(es) still building after 10 minutes.`);
      console.warn('They will finish on their own; queries needing them fail until then.');
    }
  }

  console.log(`\n${created} created, ${existing} already present, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
})();
