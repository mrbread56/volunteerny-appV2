/**
 * Prove Firebase Storage actually works, and that its rules actually bite.
 *
 *   npm run check:storage
 *
 * This check exists because Storage was broken in production for as long as it
 * had existed, and nothing caught it. The app was migrated from
 * base64-in-Firestore to real Storage uploads, but Storage had never been
 * enabled on the project — there was no bucket. The SDK retries transport
 * failures with a long backoff, so every upload simply hung: the safety-report
 * dialog spun forever and told the student nothing. Neither tsc, nor the build,
 * nor check:security could see it, because none of them upload a file.
 *
 * So this uploads a real file as a real signed-in student, and then tries the
 * attack the rules are supposed to stop. It talks to the live project, exactly
 * like check:security, and cleans up after itself.
 */
import './env';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import * as admin from 'firebase-admin';

const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const storage = getStorage(app);

const PASSWORD = 'CheckStorage!' + Math.random().toString(36).slice(2, 10);
let passed = 0;
let failed = 0;
const pass = (m: string) => { console.log(`[PASS] ${m}`); passed++; };
const fail = (m: string) => { console.error(`[FAIL] ${m}`); failed++; };

const DENIED = ['permission-denied', 'unauthenticated', 'storage/unauthorized', 'storage/unauthenticated'];
/**
 * A denial has to look like a DENIAL.
 *
 * These were bare `catch { pass(...) }`, so any failure at all counted as proof
 * the rules held — including a TIMEOUT, which is the exact symptom of the
 * "Storage was never enabled and every upload hung forever" outage this file
 * exists to catch. check-security.ts has done it this way all along.
 */
function passIfDenied(err: any, label: string) {
  const code = err?.code || '';
  if (DENIED.includes(code)) pass(label);
  else fail(`${label} — refused, but with an unexpected error: ${code || err?.message || err}`);
}

/** Uploads must not hang. Without this the failure mode is a script that never
 *  exits, which is the same invisible failure the app had. */
function withTimeout<T>(label: string, p: Promise<T>, ms = 30_000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

(async () => {
  const email = `check_storage_${Date.now()}@example.com`;
  const { user } = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  const uid = user.uid;
  // A minimal PDF header. The content type matters: storage.rules only accepts
  // image/* or application/pdf, so a text/plain probe is refused for the right
  // reason and would look exactly like the bucket being broken.
  const body = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
  const TYPE = { contentType: 'application/pdf' };

  try {
    // 1. The thing that was broken: a student uploading their own file.
    const own = ref(storage, `students/${uid}/check-storage.pdf`);
    try {
      await withTimeout('own upload', uploadBytes(own, body, TYPE));
      pass('student uploads to their own folder');
    } catch (e: any) {
      fail(`student CANNOT upload to their own folder — ${e?.code || e?.message}`);
    }

    // 2. A download URL must come back, because that is what gets stored on the
    //    document and rendered later.
    try {
      const url = await withTimeout('download url', getDownloadURL(own));
      if (url.startsWith('https://')) pass('download URL returned');
      else fail(`download URL looks wrong: ${url}`);
    } catch (e: any) {
      fail(`no download URL — ${e?.code || e?.message}`);
    }

    // 3. Report attachments write here. This is the exact path the safety
    //    report dialog uses, and the one that hung.
    const report = ref(storage, `reports/${uid}/check-storage.pdf`);
    try {
      await withTimeout('report upload', uploadBytes(report, body, TYPE));
      pass('student uploads a safety-report attachment');
      await deleteObject(report).catch(() => {});
    } catch (e: any) {
      fail(`safety-report attachment upload failed — ${e?.code || e?.message}`);
    }

    // 4. The attack. Another student's folder must be closed: these files are
    //    resumes and identity documents belonging to minors.
    const victim = ref(storage, `students/someone-elses-uid/stolen.txt`);
    try {
      await withTimeout('cross-user upload', uploadBytes(victim, body, TYPE));
      fail('student WROTE INTO ANOTHER STUDENT\'S FOLDER');
      await deleteObject(victim).catch(() => {});
    } catch (err: any) {
      passIfDenied(err, "student cannot write into another student's folder");
    }

    /*
     * 5. The signed-link generation, which is what replaced getDownloadURL.
     *
     * uploadFileToStorage now stores `storage:<path>` and never mints a
     * permanent token, because a getDownloadURL token bypasses every rule
     * asserted above and never expires. The server signs a five-minute link at
     * read time instead. That machinery had no test: if signing silently
     * failed, every organisation would just see "no resume" and nobody would
     * know why, and if it silently produced a PERMANENT link we would be back
     * where we started with a green suite.
     *
     * So: the signed link must WORK, and the bare object must NOT.
     */
    {
      const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      if (!key) {
        console.log('[WARN] no service account key — signed-link generation not checked');
      } else {
        const a: any = (admin as any).default || admin;
        const signApp = a.initializeApp({ credential: a.credential.cert(JSON.parse(key)) }, 'sign-check');
        const bucket = signApp.storage().bucket(process.env.VITE_FIREBASE_STORAGE_BUCKET!);
        const objectPath = `students/${uid}/signed-probe.pdf`;
        await bucket.file(objectPath).save(Buffer.from('%PDF-1.4 probe'), { contentType: TYPE });

        const [signed] = await bucket.file(objectPath).getSignedUrl({
          action: 'read',
          expires: Date.now() + 5 * 60_000,
        });
        if (!/^https:\/\//.test(signed)) fail('the signed link is not an https URL');

        const okRes = await fetch(signed);
        if (okRes.ok) pass('a five-minute signed link opens the file');
        else fail(`the signed link did NOT open the file (${okRes.status}) — resumes will render as missing`);

        // Same object, no signature. This is what an attacker holding only the
        // stored value can construct, and it must be refused.
        const bare = `https://storage.googleapis.com/${bucket.name}/${objectPath}`;
        const bareRes = await fetch(bare);
        if (bareRes.ok) fail('the object is readable with NO signature — the path itself is public');
        else pass(`the unsigned object URL is refused (${bareRes.status})`);

        await bucket.file(objectPath).delete().catch(() => {});
        await signApp.delete().catch(() => {});
      }
    }

    // 6. Signed out, nobody uploads anything.
    await signOut(auth);
    try {
      await withTimeout('anon upload', uploadBytes(ref(storage, `students/${uid}/anon.pdf`), body, TYPE));
      fail('an ANONYMOUS caller uploaded a file');
    } catch (err: any) {
      passIfDenied(err, 'anonymous upload is refused');
    }
  } finally {
    // Admin cleanup: the account and anything it left behind.
    const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (key) {
      const a: any = (admin as any).default || admin;
      const adminApp = a.initializeApp({ credential: a.credential.cert(JSON.parse(key)) }, 'storage-check');
      await adminApp.storage().bucket(process.env.VITE_FIREBASE_STORAGE_BUCKET!)
        .deleteFiles({ prefix: `students/${uid}/` }).catch(() => {});
      await adminApp.auth().deleteUser(uid).catch(() => {});
      console.log('[INFO] cleaned up the throwaway account and its files');
    } else {
      console.log('[WARN] no service account key — throwaway account left behind');
    }
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
})();
