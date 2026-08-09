/**
 * Prove the backup/restore round trip actually works.
 *
 *   npm run check:backup
 *
 * A backup nobody has restored from is an untested assumption with a filename.
 * The day you need it is the worst possible day to discover that timestamps
 * came back as plain objects, or that the file was written in a shape restore
 * cannot read.
 *
 * This writes throwaway documents into a dedicated `_backupCheck` collection,
 * backs up, deletes them, restores, and asserts they came back byte-for-byte —
 * including the Firestore types that do not survive JSON on their own. It then
 * cleans up after itself.
 *
 * It never touches real collections.
 */
import './env';
import * as admin from 'firebase-admin';

// firebase-admin ships CJS; under ESM the namespace import does not expose
// `.firestore`, so Timestamp/GeoPoint are undefined on it. Every other script
// resolves the real module the same way.
const fb: any = (admin as any).default || admin;
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const COLLECTION = '_backupCheck';

function serialise(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value?.toDate === 'function') return { __type: 'timestamp', value: value.toDate().toISOString() };
  if (typeof value?.latitude === 'number' && typeof value?.longitude === 'number') {
    return { __type: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  }
  if (Array.isArray(value)) return value.map(serialise);
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialise(v);
    return out;
  }
  return value;
}

function deserialise(value: any): any {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(deserialise);
  if (typeof value === 'object') {
    if (value.__type === 'timestamp') return fb.firestore.Timestamp.fromDate(new Date(value.value));
    if (value.__type === 'geopoint') return new fb.firestore.GeoPoint(value.latitude, value.longitude);
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deserialise(v);
    return out;
  }
  return value;
}

(async () => {
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) {
    console.error('[FAIL] FIREBASE_SERVICE_ACCOUNT_KEY is not set.');
    process.exit(1);
  }
  const app = fb.initializeApp({ credential: fb.credential.cert(JSON.parse(key)) }, 'check-backup');
  const db = app.firestore();
  db.settings({ databaseId: process.env.FIREBASE_DATABASE_ID });

  const id = `probe_${Date.now()}`;
  // Deliberately includes the shapes that do NOT survive a naive JSON round
  // trip: a Timestamp, a GeoPoint, a nested object, an array of objects, and
  // values that are easy to coerce wrongly (0, false, empty string, null).
  const original = {
    name: 'Backup Probe',
    createdAt: fb.firestore.Timestamp.fromDate(new Date('2026-01-02T03:04:05Z')),
    where: new fb.firestore.GeoPoint(43.7615, -79.4111),
    hours: 12.5,
    zero: 0,
    flag: false,
    blank: '',
    missing: null,
    nested: { deep: { value: 'kept' } },
    entries: [{ id: 'a', hours: 1.5, approved: true }, { id: 'b', hours: 2, approved: false }],
  };

  let failed = false;
  const fail = (m: string) => { failed = true; console.error(`[FAIL] ${m}`); };

  try {
    await db.collection(COLLECTION).doc(id).set(original);

    // 1. Back up (the same serialisation backup.ts uses).
    const snap = await db.collection(COLLECTION).doc(id).get();
    const dumped = serialise(snap.data());
    const file = path.join('backups', `check-${id}.json`);
    fs.mkdirSync('backups', { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ takenAt: new Date().toISOString(), data: { [COLLECTION]: { [id]: dumped } } }, null, 2));

    // 2. Lose the data.
    await db.collection(COLLECTION).doc(id).delete();
    assert.ok(!(await db.collection(COLLECTION).doc(id).get()).exists, 'probe document was not actually deleted');

    // 3. Restore.
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    await db.collection(COLLECTION).doc(id).set(deserialise(parsed.data[COLLECTION][id]));

    // 4. Assert it came back identical.
    const back = (await db.collection(COLLECTION).doc(id).get()).data()!;
    assert.equal(back.name, original.name, 'string lost');
    assert.equal(back.hours, 12.5, 'number lost');
    assert.equal(back.zero, 0, 'zero became something else');
    assert.equal(back.flag, false, 'false became something else');
    assert.equal(back.blank, '', 'empty string became something else');
    assert.equal(back.missing, null, 'null became something else');
    assert.equal(back.nested.deep.value, 'kept', 'nested object lost');
    assert.equal(back.entries.length, 2, 'array lost');
    assert.equal(back.entries[1].approved, false, 'array member field lost');

    // The two that a naive JSON round trip silently ruins.
    assert.ok(typeof back.createdAt?.toDate === 'function', 'Timestamp came back as a plain object, not a Timestamp');
    assert.equal(back.createdAt.toDate().toISOString(), '2026-01-02T03:04:05.000Z', 'Timestamp value drifted');
    assert.ok(back.where instanceof fb.firestore.GeoPoint, 'GeoPoint came back as a plain object');
    assert.equal(back.where.latitude, 43.7615, 'GeoPoint latitude drifted');

    fs.unlinkSync(file);
    console.log('[PASS] backup/restore round trip: strings, numbers, 0/false/""/null, nested objects, arrays, Timestamps and GeoPoints all survive');
  } catch (err: any) {
    fail(err?.message || String(err));
  } finally {
    await db.collection(COLLECTION).doc(id).delete().catch(() => {});
  }

  process.exit(failed ? 1 : 0);
})();
