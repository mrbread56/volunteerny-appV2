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
    } catch {
      pass("student cannot write into another student's folder");
    }

    // 5. Signed out, nobody uploads anything.
    await signOut(auth);
    try {
      await withTimeout('anon upload', uploadBytes(ref(storage, `students/${uid}/anon.pdf`), body, TYPE));
      fail('an ANONYMOUS caller uploaded a file');
    } catch {
      pass('anonymous upload is refused');
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
