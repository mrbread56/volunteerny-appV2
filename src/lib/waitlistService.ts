import { db } from '../firebase/config';
import { notifyApplicant } from './emailService';

/**
 * Move the longest-waiting applicant off the waitlist, if a place is genuinely
 * free.
 *
 * Two things this must not do, both of which it used to.
 *
 * It must not promote when nothing was vacated. Callers fire this on any
 * rejection, including rejecting someone who was still `pending` — that frees
 * no place, because a pending applicant never occupied one. An opportunity with
 * two spots and two accepted volunteers would over-fill every time the
 * organization declined an unrelated applicant. So capacity is now checked
 * here, against the live count of accepted applications, rather than assumed by
 * the caller.
 *
 * It must not mail the student from the browser. Resolving the address needs
 * users/{studentId}, which firestore.rules denies to organizations, so the read
 * threw AFTER the promotion write had already landed: the student was silently
 * accepted and never told. The send now goes through the server, which does the
 * lookup itself.
 */
// orgName is no longer needed — the server composes the promotion email now,
// and resolves the organization name itself. Kept in the signature so the two
// call sites do not need touching, and ignored deliberately.
export async function promoteWaitlistedApplicant(opportunityId: string, _orgName?: string) {
  try {
    let oldestApp: any = null;

    if (localStorage.getItem('demo_mode_role')) {
      const storedApps = localStorage.getItem('demo_applications');
      if (storedApps) {
        const appsList = JSON.parse(storedApps);
        const waitlistedMatched = appsList
          .filter((a: any) => a.opportunityId === opportunityId && a.status === 'waitlist')
          .sort((a: any, b: any) => new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime());

        if (waitlistedMatched.length > 0) {
          oldestApp = waitlistedMatched[0];
          const targetIndex = appsList.findIndex((x: any) => x.id === oldestApp.id);
          if (targetIndex !== -1) {
            appsList[targetIndex].status = 'accepted';
            localStorage.setItem('demo_applications', JSON.stringify(appsList));
          }
        }
      }
      return oldestApp;
    }

    const { query, collection, where, getDocs, orderBy, limit, doc, updateDoc, getDoc, serverTimestamp } =
      await import('firebase/firestore');

    // Is there actually a free place? maxVolunteers absent or 0 means uncapped,
    // which is how the create form treats a blank field.
    const oppSnap = await getDoc(doc(db, 'opportunities', opportunityId));
    const maxVolunteers = Number(oppSnap.data()?.maxVolunteers) || 0;
    if (maxVolunteers > 0) {
      const acceptedSnap = await getDocs(query(
        collection(db, 'applications'),
        where('opportunityId', '==', opportunityId),
        where('status', '==', 'accepted'),
      ));
      if (acceptedSnap.size >= maxVolunteers) return null;
    }

    const snap = await getDocs(query(
      collection(db, 'applications'),
      where('opportunityId', '==', opportunityId),
      where('status', '==', 'waitlist'),
      orderBy('appliedAt', 'asc'),
      limit(1),
    ));
    if (snap.empty) return null;

    const oldestDoc = snap.docs[0];
    oldestApp = { id: oldestDoc.id, ...oldestDoc.data() };
    // decidedAt, like every other decision write. Without it the student's bell
    // timestamps this at their APPLY time, which for someone promoted weeks
    // later compares as already-seen and never raises the unread badge — the
    // exact bug the field was introduced to fix.
    await updateDoc(doc(db, 'applications', oldestApp.id), {
      status: 'accepted',
      decidedAt: serverTimestamp(),
    });

    // Announce it. A failure here must not undo the promotion — the student is
    // accepted either way — but it is reported so the caller can surface it.
    const result = await notifyApplicant({ applicationId: oldestApp.id, status: 'waitlist_promoted' });
    if (!result.success) {
      console.error('[Waitlist] promoted, but the student was not emailed:', result.error);
    }
    return { ...oldestApp, emailSent: result.success };
  } catch (err) {
    console.error('[Waitlist Promotion Error]:', err);
  }
  return null;
}
