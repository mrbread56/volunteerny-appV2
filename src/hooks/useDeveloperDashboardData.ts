import { useEffect, useState } from 'react';
import { collection, getDocs, limit, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { reportError } from '../lib/errors';
import { API_BASE_URL } from '../lib/config';

/**
 * Everything the developer console reads.
 *
 * The third and last of the components the review named. This one is an
 * internal admin tool that nobody outside the project opens, so the case for
 * moving it is weaker than for the two user-facing dashboards — but leaving one
 * of three behind means the next person has to learn two conventions instead of
 * one, and the transformation is identical.
 *
 * Both loaders are returned so the page can re-run them after it changes
 * something: approving an organisation or resolving a report has to refresh the
 * list it just acted on, and that trigger belongs to the page.
 */
export interface DeveloperDashboardData {
  students: any[];
  orgs: any[];
  feedbacks: any[];
  reports: any[];
  interestRequests: any[];
  pendingOrgs: any[];
  pendingOrgsLoading: boolean;
  bannedStudents: any[];
  bannedOrgs: any[];
  realStudentCount: number;
  realOrgCount: number;
  realFeedbackCount: number;
  realReportCount: number;
  isLoading: boolean;
  consoleNotice: string | null;
  setConsoleNotice: (message: string | null) => void;
  setStudents: React.Dispatch<React.SetStateAction<any[]>>;
  setOrgs: React.Dispatch<React.SetStateAction<any[]>>;
  setFeedbacks: React.Dispatch<React.SetStateAction<any[]>>;
  setReports: React.Dispatch<React.SetStateAction<any[]>>;
  setPendingOrgs: React.Dispatch<React.SetStateAction<any[]>>;
  /** Re-run after an action that changes what the lists should show. */
  loadData: () => Promise<void>;
  loadPendingOrgs: () => Promise<void>;
}

export function useDeveloperDashboardData(
  /** Needed for the privileged admin endpoints, which take a bearer token. */
  user: { getIdToken: () => Promise<string> } | null | undefined,
  isDemoMode: boolean,
): DeveloperDashboardData {
  const [students, setStudents] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [interestRequests, setInterestRequests] = useState<any[]>([]);
  const [pendingOrgs, setPendingOrgs] = useState<any[]>([]);
  // Queried directly rather than filtered out of the capped lists; see loadData.
  const [bannedStudents, setBannedStudents] = useState<any[]>([]);
  const [bannedOrgs, setBannedOrgs] = useState<any[]>([]);
  // Separate from isLoading, which loadData owns. See loadPendingOrgs.
  const [pendingOrgsLoading, setPendingOrgsLoading] = useState(true);
  const [realStudentCount, setRealStudentCount] = useState(0);
  const [realOrgCount, setRealOrgCount] = useState(0);
  const [realFeedbackCount, setRealFeedbackCount] = useState(0);
  const [realReportCount, setRealReportCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [consoleNotice, setConsoleNotice] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (isDemoMode) {
        // Load demo feedbacks
        const demoFeedbacks = JSON.parse(localStorage.getItem('demo_feedbacks') || '[]');
        if (demoFeedbacks.length === 0) {
          const sample = [
            {
              id: 'fb_sample1',
              userEmail: 'tom.clarke@senecacollege.ca',
              userRole: 'student',
              type: 'bug',
              subject: 'Leaflet Map tile failing to render inside profile container',
              message: 'When I open my org dashboard, sometimes the background tiles of the Leaflet map stay grey until I resize my browser tab. This is quite tricky to deal with.',
              createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
              aiOverview: {
                category: 'bug',
                urgency: 'high',
                summary: 'Map tiles fail to load immediately on modal mount due to Leaflet container size change before initialization.',
                suggestedFix: 'Implement map.invalidateSize() inside a standard useEffect timeout trigger on map mount.'
              }
            },
            {
              id: 'fb_sample2',
              userEmail: 'outreach@nycharity.ca',
              userRole: 'organization',
              type: 'feature',
              subject: 'Needs a certificate generation option for school credit',
              message: 'Adding a feature where we can click a single button to auto-generate a completion certificate PDF containing student hours would save us several hours of administrative work.',
              createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
              aiOverview: {
                category: 'feature',
                urgency: 'medium',
                summary: 'Organization requests automatic PDF certificate generating widget to streamline proof-of-completion signatures.',
                suggestedFix: 'Integrate jsPDF package on frontend to generate custom PDF certificates from application details on high-school templates.'
              }
            }
          ];
          localStorage.setItem('demo_feedbacks', JSON.stringify(sample));
          setFeedbacks(sample);
          setRealFeedbackCount(sample.length);
        } else {
          setFeedbacks(demoFeedbacks);
          setRealFeedbackCount(demoFeedbacks.length);
        }

        // Demo fallback students and orgs
        const sampleStudents = [
          { uid: 'student_1', fullName: 'Armin Karimi', email: 'armin.k@yorkschool.ca', school: 'York Mills Collegiate', grade: '11', neighborhood: 'York Mills', isBanned: false },
          { uid: 'student_2', fullName: 'Sarah Jenkins', email: 's.jenkins@willowdale.ca', school: 'Earl Haig Secondary', grade: '12', neighborhood: 'Willowdale', isBanned: false }
        ];
        const sampleOrgs = [
          { uid: 'org_1', organizationName: 'North York Food Share', contactEmail: 'outreach@nyfoodshare.ca', isBanned: false, organizationType: 'Registered Charity', address: '1700 Sheppard Ave E, North York' },
          { uid: 'org_2', organizationName: 'Yonge Athletics Club', contactEmail: 'info@yongeathletics.ca', isBanned: false, organizationType: 'Sports / Recreational Club', address: '3900 Yonge St, Toronto' }
        ];

        setStudents(sampleStudents);
        setOrgs(sampleOrgs);
        setRealStudentCount(sampleStudents.length);
        setRealOrgCount(sampleOrgs.length);

        // Load demo safety reports
        const demoReports = JSON.parse(localStorage.getItem('demo_reports') || '[]');
        setReports(demoReports);
        setRealReportCount(demoReports.length);

      } else {
        // Fetch from real Firestore
        let fbList: any[] = [];
        try {
          const fbSnap = await getDocs(query(
        collection(db, 'feedbacks'),
        // orderBy, for the same reason the reports query below has it. An
        // unordered limit(200) returns an ARBITRARY stable subset — and
        // feedback ids are 'fb_' + Math.random(), so past 200 tickets Firestore
        // hands back the same arbitrary 200 on every refresh and a new ticket
        // is never fetched at all. Sorting the result afterwards only reorders
        // what arrived.
        orderBy('createdAt', 'desc'),
        limit(200),
      ));
          fbList = fbSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (dbErr) {
          setConsoleNotice(
            reportError('load feedback tickets', dbErr, "Couldn't load feedback tickets from the database."),
          );
        }

        // No localStorage merge here.
        //
        // This is the REAL data branch, and it used to append demo_feedbacks
        // and demo_reports to whatever Firestore returned. Two separate
        // failures came out of that. Invented tickets and invented safety
        // reports appeared in a live developer's queue, indistinguishable from
        // real ones. And because the catches here only console.warn'd, a failed
        // read left the localStorage copies as the ENTIRE list — so the console
        // looked healthy and populated while every real report was invisible.
        // A safety report nobody sees is the worst failure this app has, so
        // both reads now say so out loud and show only what the database
        // actually holds.
        fbList.sort((a: any, b: any) => {
          const tA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime();
          const tB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime();
          return tB - tA;
        });

        setFeedbacks(fbList);
        setRealFeedbackCount(fbList.length);

        // Fetch category interest requests ("Join List")
        try {
          const irSnap = await getDocs(query(
        collection(db, 'interestRequests'),
        // Same as feedbacks above. These students were told they were on a
        // waiting list, so a request that never surfaces is a promise broken
        // silently.
        orderBy('createdAt', 'desc'),
        limit(200),
      ));
          const irList = irSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
          irList.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
          setInterestRequests(irList);
        } catch (dbErr) {
          setConsoleNotice(
            reportError('load interest requests', dbErr, "Couldn't load category interest requests."),
          );
        }

        // Fetch safety reports
        let repList: any[] = [];
        try {
          /*
           * orderBy, because without it the cap picks the WRONG 200.
           *
           * This was query(collection(db,'reports'), limit(200)) with no order,
           * so Firestore returned the first 200 by document id — and report ids
           * are `'report_' + Math.random().toString(36)`. Past 200 reports the
           * console therefore showed the same arbitrary subset on every refresh
           * and a newly filed safety report was simply never fetched: no error,
           * no spinner, no indication. Resolved reports held their slots
           * forever. The client-side sort below only reordered what had already
           * arrived, which made the list look deliberate.
           *
           * createdAt is now required by firestore.rules, so nothing can be
           * filed that this ordering would hide.
           */
          /*
           * PENDING ones first, unbounded, then recent history to fill in.
           *
           * "Newest 200" is not the same queue as "the ones still open". An
           * unactioned report about an adult, filed before 200 newer ones
           * arrived, fell outside every screen in the console — there is no
           * "older", no cursor, and ReportsTab filters this page down to
           * pending afterwards, so the moderator saw an empty queue while the
           * Metrics tab counted the open reports across the whole collection
           * and disagreed with it.
           *
           * Open reports are the work. There is no sensible cap on those, and
           * in practice there are few; the history below it is what gets
           * capped.
           */
          // In its own try: this needs a (status, createdAt) composite index, and
          // an index that has not finished building THROWS. Falling back to the
          // capped list keeps the queue working rather than replacing it with an
          // error, which on the safety queue is the difference between "older
          // ones are hidden" and "nothing loads at all".
          let pendingDocs: any[] = [];
          try {
            const pendingSnap = await getDocs(
              query(collection(db, 'reports'), where('status', '==', 'pending'), orderBy('createdAt', 'desc')),
            );
            pendingDocs = pendingSnap.docs;
          } catch (idxErr) {
            console.error('[reports] open-report query failed, falling back to the capped list:', idxErr);
          }
          const settledSnap = await getDocs(
            query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(200)),
          );
          const byId = new Map<string, any>();
          for (const d of pendingDocs) byId.set(d.id, { id: d.id, ...d.data() });
          for (const d of settledSnap.docs) if (!byId.has(d.id)) byId.set(d.id, { id: d.id, ...d.data() });
          repList = [...byId.values()];
          if (settledSnap.size === 200) {
            // Only the HISTORY is capped now, so say that rather than implying
            // something open might be missing.
            setConsoleNotice(
              `Every open report is listed. Older resolved reports beyond the most recent 200 are not shown.`,
            );
          }
        } catch (dbErr) {
          setConsoleNotice(
            reportError('load safety reports', dbErr, "Couldn't load safety reports from the database."),
          );
        }
        repList.sort((a: any, b: any) => {
          const tA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime();
          const tB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime();
          return tB - tA;
        });
        setReports(repList);
        setRealReportCount(repList.length);

        // Via the server, which returns an allow-listed projection. Reading
        // these documents directly pulled resumeUrl and passportUrl with them —
        // base64 files, up to 400 KB each by the rules — so listing 200
        // students streamed as much as 160 MB of minors' identity documents
        // into this tab to render names and emails.
        const studentToken = await user?.getIdToken();
        const studentRes = await fetch(`${API_BASE_URL}/api/admin/students`, {
          headers: studentToken ? { Authorization: `Bearer ${studentToken}` } : {},
        });
        if (!studentRes.ok) {
          const body = await studentRes.json().catch(() => ({}));
          throw new Error(body.error || `Could not load students (${studentRes.status}).`);
        }
        const { students: studentList } = await studentRes.json();
        setStudents(studentList);
        setRealStudentCount(studentList.length);

        // Ordered, same reasoning as the reports queue above: an unordered
        // limit hides an arbitrary set forever rather than the oldest ones.
        const orgSnap = await getDocs(query(collection(db, 'organizations'), orderBy('organizationName'), limit(200)));
        const orgList = orgSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
        setOrgs(orgList);
        setRealOrgCount(orgList.length);

        /*
         * The suspension registry gets its OWN query.
         *
         * It was `students.filter(s => s.isBanned)` and `orgs.filter(...)` —
         * a filter applied AFTER an unordered limit(200), which is the same
         * shape as the reports bug this file already documents. Firebase uids
         * are random, so past 200 accounts a suspended person can simply be
         * absent from the only screen that can lift the suspension, and the
         * count beside the tab is wrong the same way.
         *
         * Asking the database for the suspended ones makes the registry
         * complete regardless of how many accounts exist.
         */
        const [bannedStuSnap, bannedOrgSnap] = await Promise.all([
          getDocs(query(collection(db, 'students'), where('isBanned', '==', true), limit(200))),
          getDocs(query(collection(db, 'organizations'), where('isBanned', '==', true), limit(200))),
        ]);
        setBannedStudents(bannedStuSnap.docs.map(d => ({ uid: d.id, ...d.data() })));
        setBannedOrgs(bannedOrgSnap.docs.map(d => ({ uid: d.id, ...d.data() })));
      }
    } catch (err) {
      // Was a bare console.error. This catch wraps the WHOLE admin load —
      // students, organizations, the lot — so when it fired the developer got a
      // dashboard of empty tables and no indication anything had gone wrong.
      // An empty list and a failed list looked identical.
      setConsoleNotice(
        reportError(
          'load developer admin lists',
          err,
          "Couldn't load the admin lists. They may be incomplete. Refresh to try again.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ── Org Verification Queue ──
  /*
   * Its own loading flag.
   *
   * `isLoading` is owned entirely by loadData, which never touches this query,
   * so the queue rendered "No organizations pending verification." while its own
   * read was still in flight. That is the one tab in the console that must never
   * look empty by accident: a charity that has been waiting is indistinguishable
   * from nothing to do, and the reviewer closes the page. The catch below
   * already says exactly this about a FAILED read; an in-flight one looked the
   * same and had no message at all.
   */
  const loadPendingOrgs = async () => {
    setPendingOrgsLoading(true);
    try {
      await loadPendingOrgsInner();
    } finally {
      setPendingOrgsLoading(false);
    }
  };

  const loadPendingOrgsInner = async () => {
    if (isDemoMode) {
      setPendingOrgs([
        { uid: 'demo-org-pending-1', organizationName: 'North York Youth Arts', craNumber: '119219814RR0001', contactEmail: 'arts@nyyouth.ca', verificationStatus: 'pending', address: '100 Sheppard Ave W' },
        { uid: 'demo-org-pending-2', organizationName: 'Willowdale Food Bank', craNumber: '118833011RR0001', contactEmail: 'hello@wfoodbank.ca', verificationStatus: 'pending', address: '5000 Yonge St' },
      ]);
      return;
    }
    try {
      /*
       * Both states, not just 'pending'.
       *
       * Signup writes 'pending' when an organisation says it is a CRA
       * registered charity and 'unverified' when it says it is not, and this
       * query asked for 'pending' alone. firestore.rules requires 'verified'
       * to post anything, and nothing anywhere promotes 'unverified' — so
       * every non-charity that ever signed up could join, could never post,
       * and could never be approved, because no reviewer could see them.
       *
       * Found on 28 Aug 2026 when a real clinic signed up on its own, sat
       * invisible, and never came back. The signup form tells these
       * organisations "You can join without one", and it has to be true.
       */
      const q = query(
        collection(db, 'organizations'),
        where('verificationStatus', 'in', ['pending', 'unverified']),
        // Ordered, or the cap hides an arbitrary set of organisations forever
        // rather than showing the queue in a stable, walkable order. This list
        // is the likeliest of all the admin queues to exceed 200: 'unverified'
        // is the default for every non-charity signup and nothing ages an
        // entry out of it except an explicit decision.
        orderBy('__name__'),
        limit(200),
      );
      const snap = await getDocs(q);
      setPendingOrgs(snap.docs.map(d => ({ ...d.data(), uid: d.id } as any)));
    } catch (err) {
      // console.error only meant pendingOrgs stayed empty and the tab read "No
      // organizations pending verification." with no count badge and no
      // spinner — so a failed read looked exactly like an empty queue, and
      // charities waiting on CRA verification stayed invisible and unapproved.
      setConsoleNotice(
        reportError(
          'load pending organizations',
          err,
          "Couldn't load the verification queue. Refresh before assuming it is empty.",
        ),
      );
    }
  };

  useEffect(() => {
    loadData();
    loadPendingOrgs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoMode, user]);

  return {
    students, orgs, feedbacks, reports, interestRequests, pendingOrgs, pendingOrgsLoading,
    bannedStudents, bannedOrgs,
    realStudentCount, realOrgCount, realFeedbackCount, realReportCount,
    isLoading, consoleNotice, setConsoleNotice,
    setStudents, setOrgs, setFeedbacks, setReports, setPendingOrgs,
    loadData, loadPendingOrgs,
  };
}
