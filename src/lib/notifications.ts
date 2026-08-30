/**
 * Notifications, derived rather than stored.
 *
 * The obvious design is a `notifications` collection that other people write
 * into. That is the wrong shape for this app. Writing a notification to a
 * student means an ORGANIZATION creating a document owned by a STUDENT, and the
 * rule that would authorise it — "is this org allowed to notify this student?"
 * — is a query across applications and opportunities. Firestore rules can only
 * read one document by exact path, so that rule cannot be written; the
 * alternatives are to allow any signed-in account to create documents in
 * another user's feed, or to put every notification behind a server endpoint.
 * The first is a spam and phishing surface aimed at minors. The second is a lot
 * of machinery for something the data already tells us.
 *
 * So there is no new collection and no new write path. A notification here is
 * just a fact already present in a document the reader is ALREADY allowed to
 * read: the status on their own application, the outcome of their own hours
 * request, an application to an opportunity they own. Nothing to secure,
 * nothing to keep in sync, and it cannot drift from the real state because it
 * IS the real state.
 *
 * The only stored thing is a "last opened" timestamp, per account, in
 * localStorage — losing it just means the bell looks unread once.
 */
import { collection, doc, getDoc, getDocs, query, where, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';

export type NotificationKind =
  | 'accepted'
  | 'rejected'
  | 'waitlist'
  | 'reviewed'
  | 'hours'
  | 'applicant'
  /** A developer answered a feedback ticket you filed. */
  | 'feedbackReply'
  /** A safety report you filed was actioned. */
  | 'reportResolved'
  /** An organization wrote you a reference. */
  | 'recommendation'
  /** A student rated your organization. */
  | 'rating'
  /** Your organization's verification was decided. */
  | 'verified'
  /** A student is waiting for you to confirm their hours. */
  | 'hoursPending';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Sort key and unread comparison. */
  at: Date;
  /** Where clicking it should take you. */
  href: string;
}

/** Firestore hands back Timestamp, string, or nothing depending on the writer. */
function toDate(value: any): Date {
  if (!value) return new Date(0);
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

const seenKey = (uid: string) => `vny_notifications_seen_${uid}`;

export function getSeenAt(uid: string): Date {
  try {
    const raw = localStorage.getItem(seenKey(uid));
    if (!raw) return new Date(0);
    const d = new Date(raw);
    // A corrupt or hand-edited value must not produce an Invalid Date that
    // then propagates into arithmetic elsewhere.
    return Number.isFinite(d.getTime()) ? d : new Date(0);
  } catch {
    // Storage can be blocked entirely — see src/lib/storageFallback.ts. Treating
    // that as "never opened" is the harmless direction: the bell shows a count.
    return new Date(0);
  }
}

/**
 * Mark everything currently visible as seen.
 *
 * Takes the notifications being marked rather than just stamping "now",
 * because these timestamps come from Firestore's SERVER clock while `now` is
 * the browser's. When the server ran even slightly ahead, a notification the
 * user had just read still compared as newer than the seen mark and the badge
 * came straight back. Storing a mark at least as recent as the newest item
 * makes it correct under any skew.
 */
export function markAllSeen(uid: string, items: AppNotification[] = []): void {
  /*
   * Nothing to mark means nothing gets marked.
   *
   * The stamp below is Math.max(Date.now(), newest + 1000), so with an EMPTY
   * list this wrote "now" — and countUnread only counts notifications newer
   * than the stamp. So a student whose bell failed to load (a network blip,
   * a permission error) and who then opened it out of curiosity permanently
   * cleared every notification that existed but had not been fetched. Their
   * acceptance from an hour ago never raised a badge again, and nothing
   * anywhere recorded that it had happened.
   *
   * An empty list is also the honest reading: there is nothing here that the
   * reader can be said to have seen.
   */
  if (!items.length) return;
  // Every arithmetic step here is guarded against a bad timestamp. One NaN
  // poisons Math.max, and `new Date(NaN).toISOString()` THROWS RangeError
  // rather than returning something useless — which took down the whole page,
  // because this runs while the bell is mounted on every dashboard route.
  const newest = items.reduce((max, n) => {
    const t = n.at instanceof Date ? n.at.getTime() : NaN;
    return Number.isFinite(t) ? Math.max(max, t) : max;
  }, 0);
  const candidate = Math.max(Date.now(), newest + 1000);
  const mark = new Date(Number.isFinite(candidate) ? candidate : Date.now());
  try {
    localStorage.setItem(seenKey(uid), mark.toISOString());
  } catch {
    /* storage blocked — the badge just reappears next load */
  }
}

export function countUnread(items: AppNotification[], seenAt: Date): number {
  return items.filter((n) => n.at.getTime() > seenAt.getTime()).length;
}

/** What a student is told: what happened to the things they submitted. */
async function studentNotifications(uid: string): Promise<AppNotification[]> {
  const out: AppNotification[] = [];

  // All three reads at once.
  //
  // These were three sequential awaits with a for-loop between each, so the bell
  // cost three stacked round trips before it could render — on school wifi or
  // mobile data that is most of the delay a student notices. They are entirely
  // independent: nothing in one query's result feeds another.
  const [apps, hours, recs] = await Promise.all([
    /*
     * orderBy, because limit() WITHOUT one is not "the newest 50".
     *
     * Firestore falls back to __name__ ordering, so a bare limit returns an
     * arbitrary but stable subset — and these ids are `{uid}_{oppId}`, so the
     * subset is effectively alphabetical by opportunity id. Past 50
     * applications a student's newest decision could sit outside the window and
     * never raise a badge, while a year-old one held its place. The list is
     * sorted by time afterwards, which hides this completely: the order looks
     * right, the contents are wrong.
     *
     * Covered by the existing (studentId, appliedAt DESC) composite index.
     */
    getDocs(query(collection(db, 'applications'), where('studentId', '==', uid), orderBy('appliedAt', 'desc'), limit(50))),
    /*
     * ponytail: bare limit, so this is an arbitrary 50 rather than the newest
     * 50 — same trap as the applications query above. Fixing it needs a
     * (studentId, requestedAt) composite index that does not exist yet, and
     * adding the orderBy before the index is deployed THROWS in production
     * while passing locally. Add the index, deploy it, then add the orderBy.
     * Harmless until a student files more than 50 hours requests.
     */
    getDocs(query(collection(db, 'hoursRequests'), where('studentId', '==', uid), limit(50))),
    getDocs(query(collection(db, 'recommendations'), where('studentId', '==', uid), limit(30))),
  ]);
  for (const d of apps.docs) {
    const a: any = d.data();
    const title = a.opportunityTitle || 'your application';
    // 'pending' is not news — it is what the student themselves just did.
    if (a.status === 'accepted') {
      out.push({
        id: `app-${d.id}-accepted`, kind: 'accepted',
        title: 'Application accepted',
        body: `You were accepted for ${title}. Contact the organization to arrange your first shift.`,
        at: toDate(a.decidedAt ?? a.appliedAt), href: '/student/dashboard?tab=applications',
      });
    } else if (a.status === 'rejected') {
      out.push({
        id: `app-${d.id}-rejected`, kind: 'rejected',
        title: 'Application update',
        body: `Your application for ${title} was not successful this time.`,
        at: toDate(a.decidedAt ?? a.appliedAt), href: '/student/dashboard?tab=applications',
      });
    } else if (a.status === 'waitlist') {
      out.push({
        id: `app-${d.id}-waitlist`, kind: 'waitlist',
        title: 'You are on the waitlist',
        body: `You are on the waitlist for ${title}. We will tell you if a place opens.`,
        at: toDate(a.decidedAt ?? a.appliedAt), href: '/student/dashboard?tab=applications',
      });
    } else if (a.status === 'reviewed') {
      out.push({
        id: `app-${d.id}-reviewed`, kind: 'reviewed',
        title: 'Application reviewed',
        body: `${title} has reviewed your application.`,
        at: toDate(a.decidedAt ?? a.appliedAt), href: '/student/dashboard?tab=applications',
      });
    }
  }

  for (const d of hours.docs) {
    const h: any = d.data();
    if (h.status !== 'approved' && h.status !== 'declined') continue;
    out.push({
      id: `hours-${d.id}`, kind: 'hours',
      title: h.status === 'approved' ? 'Hours approved' : 'Hours request declined',
      body:
        h.status === 'approved'
          ? `${h.hours} hour${h.hours === 1 ? '' : 's'} for ${h.activity} were approved and added to your total.`
          : `Your request for ${h.hours} hour${h.hours === 1 ? '' : 's'} (${h.activity}) was declined.`,
      // The decision, not the submission — see the applications block above.
      at: toDate(h.decidedAt ?? h.declinedAt ?? h.requestedAt), href: '/student/dashboard?tab=hours',
    });
  }

  // A reference an organization wrote about them. Students can read their own
  // recommendations; nobody else's are visible.
  for (const d of recs.docs) {
    const r: any = d.data();
    out.push({
      id: `rec-${d.id}`, kind: 'recommendation',
      title: 'You received a reference',
      body: `${r.orgName || 'An organization'} wrote a reference for your work on ${r.opportunityTitle || 'a placement'}.`,
      at: toDate(r.createdAt), href: '/student/profile',
    });
  }

  out.push(...(await sharedNotifications(uid, '/feedback')));
  return out;
}

/**
 * Events that mean the same thing to a student and an organization: somebody
 * answered something you sent us. Both read only their OWN documents here.
 */
async function sharedNotifications(uid: string, feedbackHref: string): Promise<AppNotification[]> {
  const out: AppNotification[] = [];

  // The example this was built for: you file feedback, a developer replies, and
  // until now nothing told you to go back and look.
  // Both reads at once — they are independent, and this pair sat on the end of
  // whichever role-specific chain ran before it.
  const [feedbacks, reports] = await Promise.all([
    getDocs(query(collection(db, 'feedbacks'), where('userId', '==', uid), limit(30))),
    getDocs(query(collection(db, 'reports'), where('reportingUserId', '==', uid), limit(30))),
  ]);
  for (const d of feedbacks.docs) {
    const f: any = d.data();
    if (!f.developerReply) continue;
    out.push({
      id: `feedback-${d.id}`, kind: 'feedbackReply',
      title: 'Reply to your feedback',
      body: `We answered your message${f.subject ? ` about "${f.subject}"` : ''}. Open it to read the reply.`,
      at: toDate(f.repliedAt || f.createdAt), href: feedbackHref,
    });
  }

  // A safety report is the most serious thing anyone sends through this site,
  // so the person who filed it should be told it was actually looked at.
  for (const d of reports.docs) {
    const r: any = d.data();
    if (r.status !== 'resolved' && r.status !== 'dismissed') continue;
    out.push({
      id: `report-${d.id}`, kind: 'reportResolved',
      title: r.status === 'resolved' ? 'Your safety report was actioned' : 'Your safety report was reviewed',
      body:
        r.status === 'resolved'
          ? 'A moderator reviewed your report and took action. Thank you for telling us.'
          : 'A moderator reviewed your report and did not find a policy breach. Thank you for telling us.',
      // Reports carry no resolvedAt, so this anchors on when it was filed —
      // stable, which matters: a timestamp of "now" would make the item count
      // as unread on every single load.
      at: toDate(r.createdAt), href: feedbackHref,
    });
  }

  return out;
}

/** What an organization is told: who is waiting on them. */
async function organizationNotifications(uid: string, email?: string): Promise<AppNotification[]> {
  const extra: AppNotification[] = [];

  // Verification decision on their own organization document. verifiedAt is
  // written by the developer console alongside the decision, so this has a real
  // timestamp rather than re-alerting forever.
  const orgDoc = await getDoc(doc(db, 'organizations', uid));
  if (orgDoc.exists()) {
    const o: any = orgDoc.data();
    if (o.verificationStatus === 'verified' || o.verificationStatus === 'rejected') {
      extra.push({
        id: `verify-${uid}-${o.verificationStatus}`, kind: 'verified',
        title: o.verificationStatus === 'verified' ? 'Your organization is verified' : 'Verification not approved',
        body:
          o.verificationStatus === 'verified'
            // Not a badge. OpportunityCard removed it deliberately and says
            // so in its own comment; no student-facing surface reads
            // verificationStatus. Approval buys the ability to post.
            ? 'Your listings are live and students can find them.'
            : 'We could not verify your organization from the details provided. Get in touch and we will help.',
        at: toDate(o.verifiedAt), href: '/org/profile',
      });
    }
  }

  /*
   * Students waiting on this coordinator to confirm hours.
   *
   * BY orgId AND BY EMAIL, merged — the same pair OrgDashboard runs, and it has
   * to be the same pair. The drift that caused this was recorded in
   * OrgDashboard as breaking three places: the dashboard, the RULES, and this
   * bell. The first two were fixed and this one was not, which left the worse
   * half of the bug: an organisation whose public contact email differs from
   * its login email (a field the profile page invites them to change) saw the
   * request in the dashboard queue and was never notified it had arrived.
   *
   * orgId is identity and cannot drift. The email query stays for rows written
   * before orgId existed, and for the "Other / Unlisted" branch where there is
   * no account behind the address. Merged by document id so a row matching both
   * is not shown twice.
   *
   * Both are isolated, because the email one can legitimately be denied: its
   * rule requires request.auth.token.email_verified and nothing forces an
   * organisation to click its verification link before using the dashboard.
   * That used to reject the whole fetchNotifications call, so one unclickable
   * link killed every other notification kind. The orgId query carries no such
   * requirement, so the bell now still works for an unverified organisation.
   *
   * Status is filtered in JS rather than a second `where` so no composite index
   * is needed. Lowercased to match how students store the address.
   */
  {
    const seen = new Set<string>();
    const byId = await getDocs(
      query(collection(db, 'hoursRequests'), where('orgId', '==', uid), limit(50)),
    ).catch((err) => {
      console.warn('[notifications] hours requests by orgId unavailable:', err);
      return null;
    });
    const byEmail = email
      ? await getDocs(
          query(collection(db, 'hoursRequests'),
            where('coordinatorContact', '==', email.trim().toLowerCase()), limit(50)),
        ).catch((err) => {
          console.warn('[notifications] hours requests by email unavailable (verify your address):', err);
          return null;
        })
      : null;

    for (const snapshot of [byId, byEmail]) {
      for (const d of snapshot?.docs || []) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        const h: any = d.data();
        if (h.status !== 'pending') continue;
        extra.push({
          id: `hoursreq-${d.id}`, kind: 'hoursPending',
          title: 'Hours waiting for your confirmation',
          body: `${h.studentName || 'A student'} logged ${h.hours} hour${h.hours === 1 ? '' : 's'} for ${h.activity} and needs you to confirm.`,
          at: toDate(h.requestedAt), href: '/org/dashboard?tab=hours',
        });
      }
    }
  }

  // Ratings students left for them. Readable by any signed-in user by design —
  // they are meant to be shown on org profiles.
  // Ratings, the org's own postings, and the shared feedback/report pair are all
  // independent, and ran as three more sequential hops on top of the hours read
  // above. An organization's bell was six round trips deep before the chunked
  // applications loop even started.
  const [ratings, opps, shared] = await Promise.all([
    getDocs(query(collection(db, 'orgRatings'), where('orgId', '==', uid), limit(30))),
    // Same reasoning; covered by the existing (orgId, createdAt DESC) index.
    getDocs(query(collection(db, 'opportunities'), where('orgId', '==', uid), orderBy('createdAt', 'desc'), limit(30))),
    sharedNotifications(uid, '/feedback'),
  ]);
  for (const d of ratings.docs) {
    const r: any = d.data();
    extra.push({
      id: `rating-${d.id}`, kind: 'rating',
      title: 'A student rated your organization',
      body: `${r.stars}/5 for ${r.opportunityTitle || 'a placement'}${r.comment ? ` — "${String(r.comment).slice(0, 80)}"` : ''}.`,
      at: toDate(r.createdAt), href: '/org/profile',
    });
  }

  extra.push(...shared);

  const ids = opps.docs.map((d) => d.id);
  // No opportunities does not mean no notifications — verification, ratings,
  // hours to confirm and feedback replies are all independent of them.
  if (!ids.length) return extra;

  // Chunked by 3, NOT by the Firestore `in` limit of 30.
  //
  // The applications list rule proves ownership with exists() + get() on the
  // opportunity, which costs two document accesses per distinct id against a
  // budget of ten per query. Chunking by 30 made the whole query fail with
  // permission-denied once an org had six opportunities. Same constraint as
  // OrgDashboard — if that ownership check ever changes cost, this moves too.
  const out: AppNotification[] = [];
  // The chunks run together. They were awaited one at a time inside the loop,
  // and with postings capped at 30 that is six serial round trips before the
  // bell can render — the last sequential hop left after the rest of this file
  // was parallelised. Nothing in one chunk's result feeds another.
  const chunks: string[][] = [];
  // Three, not five. The applications `list` rule spends exists() + get() per
  // id in the chunk and now also isNotBanned(); at five that is eleven document
  // accesses and Firestore denies the whole query past ten. See the note on
  // that rule in firestore.rules before raising this.
  for (let i = 0; i < ids.length; i += 3) chunks.push(ids.slice(i, i + 3));
  const results = await Promise.all(
    chunks.map((chunk) =>
      getDocs(query(collection(db, 'applications'), where('opportunityId', 'in', chunk), limit(50))),
    ),
  );
  for (const apps of results) {
    for (const d of apps.docs) {
      const a: any = d.data();
      if (a.status !== 'pending') continue; // only what still needs a decision
      out.push({
        id: `applicant-${d.id}`, kind: 'applicant',
        title: 'New applicant',
        body: `${a.studentName || 'A student'} applied for ${a.opportunityTitle || 'one of your opportunities'}.`,
        at: toDate(a.appliedAt), href: '/org/dashboard?tab=applications',
      });
    }
  }
  return [...extra, ...out];
}

/**
 * Newest first, capped. Throws on failure rather than returning [] — a bell
 * that silently shows nothing when the read failed is the same lie this
 * codebase has been fixing all along.
 */
export async function fetchNotifications(
  uid: string,
  role: string | undefined,
  email?: string,
): Promise<AppNotification[]> {
  let items: AppNotification[] = [];
  if (role === 'student') items = await studentNotifications(uid);
  else if (role === 'organization') items = await organizationNotifications(uid, email);
  else return [];

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 30);
}
