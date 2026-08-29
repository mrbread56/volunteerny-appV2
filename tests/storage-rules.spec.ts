import { test } from '@playwright/test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

/**
 * storage.rules, tested offline the way firestore.rules already is.
 *
 * These rules guard the most sensitive bytes the platform holds — minors'
 * resumes and the photographic evidence attached to safety reports — and until
 * this file they were proven only by check:storage's five live assertions
 * against the deployed copy. Five assertions cannot cover a rules file with
 * four path scopes, two content-type gates and three size caps, and nothing at
 * all proved the DENIALS: that another student cannot fetch a resume, that an
 * SVG cannot become a public page on our bucket, that an oversized file is
 * refused.
 *
 * Runs against the Storage emulator via `npm run test:storage-rules`. The
 * Firestore emulator boots alongside it because callerRole() does a
 * cross-service firestore.get — but note that the rules name the LIVE database
 * (`/databases/volunteerny/...`) while the emulator hosts `(default)`, so the
 * developer-read branches resolve differently under emulation. The tests that
 * depend on that lookup document what they can and cannot prove rather than
 * pretending.
 */

// Serial, for the same reason student-signup.spec.ts is: the config sets
// fullyParallel, which splits this file across workers — each worker then runs
// beforeAll/afterAll on the SAME emulator, and one worker's cleanup() revokes
// the environment another worker is mid-test on, which surfaces as spurious
// storage/unauthorized on rules that plainly allow the operation.
test.describe.configure({ mode: 'serial' });

const PROJECT_ID = 'vny-storage-rules-test';
let env: RulesTestEnvironment;

const STUDENT = 'stor_student_1';
const STUDENT2 = 'stor_student_2';
const ORG = 'stor_org_1';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]);

const asUser = (uid: string) =>
  env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true }).storage();
const asAnon = () => env.unauthenticatedContext().storage();

test.beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      rules: readFileSync('storage.rules', 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
});

test.afterAll(async () => {
  await env?.cleanup();
});

// ───────────────────────── students/ ─────────────────────────

test.describe('students/{uid} — resumes, the most sensitive files here', () => {
  test('a student can upload their own resume as PDF, and read it back', async () => {
    const mine = asUser(STUDENT);
    await assertSucceeds(uploadBytes(ref(mine, `students/${STUDENT}/resume.pdf`), PDF, {
      contentType: 'application/pdf',
    }));
    await assertSucceeds(getBytes(ref(mine, `students/${STUDENT}/resume.pdf`)));
  });

  test("another STUDENT cannot read it — these carry a minor's identity", async () => {
    await assertFails(getBytes(ref(asUser(STUDENT2), `students/${STUDENT}/resume.pdf`)));
  });

  test('an ORGANIZATION cannot read it either — the role is self-declared and proves nothing', async () => {
    // Whether an org may see a resume depends on whether the student applied
    // to them, which is a query Storage rules cannot run. The server endpoint
    // answers that; the bucket answers no one.
    await assertFails(getBytes(ref(asUser(ORG), `students/${STUDENT}/resume.pdf`)));
  });

  test('a signed-out visitor cannot read it', async () => {
    await assertFails(getBytes(ref(asAnon(), `students/${STUDENT}/resume.pdf`)));
  });

  test("nobody can write into someone ELSE's folder", async () => {
    await assertFails(uploadBytes(ref(asUser(STUDENT2), `students/${STUDENT}/planted.pdf`), PDF, {
      contentType: 'application/pdf',
    }));
  });

  test('an SVG is refused — a document that can carry script, on a serving origin', async () => {
    await assertFails(uploadBytes(ref(asUser(STUDENT), `students/${STUDENT}/avatar.svg`), PNG, {
      contentType: 'image/svg+xml',
    }));
  });

  test('a declared-executable content type is refused outright', async () => {
    await assertFails(uploadBytes(ref(asUser(STUDENT), `students/${STUDENT}/tool.exe`), PDF, {
      contentType: 'application/octet-stream',
    }));
  });

  test('the 5MB cap holds at its boundary', async () => {
    // Mutation testing of firestore.rules taught this: a cap is only tested by
    // the pair either side of it. 5MB exactly passes; one byte over fails.
    const five = new Uint8Array(5 * 1024 * 1024);
    five.set(PDF);
    await assertSucceeds(uploadBytes(ref(asUser(STUDENT), `students/${STUDENT}/at-cap.pdf`), five, {
      contentType: 'application/pdf',
    }));
    const over = new Uint8Array(5 * 1024 * 1024 + 1);
    over.set(PDF);
    await assertFails(uploadBytes(ref(asUser(STUDENT), `students/${STUDENT}/over-cap.pdf`), over, {
      contentType: 'application/pdf',
    }));
  });
});

/*
 * The organizations/ logo tests are gone with the rule they covered.
 *
 * storage.rules granted `allow read: if true` on organizations/{uid}/ for a
 * path NOTHING writes: there is no logo upload anywhere in the app and no logo
 * field on the organisation profile. Three tests proving a world-readable grant
 * behaves correctly, guarding a feature that does not exist, is coverage that
 * makes a standing public grant look intentional. Restore both from git history
 * together if a logo feature is ever built.
 */

// ───────────────────── reports/ and feedbacks/ ─────────────────────

test.describe('reports/ and feedbacks/ — evidence and screenshots', () => {
  test('the reporter can upload and read their own evidence', async () => {
    const mine = asUser(STUDENT);
    await assertSucceeds(uploadBytes(ref(mine, `reports/${STUDENT}/evidence.png`), PNG, {
      contentType: 'image/png',
    }));
    await assertSucceeds(getBytes(ref(mine, `reports/${STUDENT}/evidence.png`)));
  });

  test('no other ordinary account can read report evidence', async () => {
    // The developer-read branch goes through callerRole(), a cross-service
    // firestore.get against the LIVE database name — under emulation that
    // lookup cannot be satisfied, so what this suite can honestly prove is the
    // denial for everyone else. The developer path is covered live by
    // check:storage.
    await assertFails(getBytes(ref(asUser(STUDENT2), `reports/${STUDENT}/evidence.png`)));
    await assertFails(getBytes(ref(asAnon(), `reports/${STUDENT}/evidence.png`)));
  });

  test('feedback screenshots behave the same way', async () => {
    await assertSucceeds(uploadBytes(ref(asUser(STUDENT), `feedbacks/${STUDENT}/shot.png`), PNG, {
      contentType: 'image/png',
    }));
    await assertFails(getBytes(ref(asUser(STUDENT2), `feedbacks/${STUDENT}/shot.png`)));
  });
});

// ───────────────────────── everything else ─────────────────────────

test.describe('the default deny', () => {
  test('a path no rule names is dead, even signed in', async () => {
    await assertFails(uploadBytes(ref(asUser(STUDENT), `uploads/${STUDENT}/anything.png`), PNG, {
      contentType: 'image/png',
    }));
    await assertFails(getBytes(ref(asUser(STUDENT), 'chat_attachments/left-over.png')));
  });
});
