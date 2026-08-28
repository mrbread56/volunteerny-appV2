import { useEffect, useRef, useState } from 'react';
import {
  collection, getDocs, limit, orderBy, query, where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { getMatchScore as scoreOpportunity } from '../lib/matchScore';
import { isVisibleToStudents } from '../lib/visibleToStudents';
import { reportError } from '../lib/errors';
import { DEMO_OPPORTUNITIES } from '../pages/studentDashboard/demoOpportunities';
import type { Application, Opportunity, SavedOpportunity, StudentProfile } from '../types';

/**
 * Everything the student dashboard needs to read, in one place.
 *
 * Lifted verbatim out of StudentDashboard, where a 264-line effect sat in the
 * middle of a 2,167-line component and touched seven collections. The page now
 * orchestrates: it says what it wants and renders it, and the question of HOW
 * any of it is fetched lives here.
 *
 * Two things in here look like they could be tidied and must not be.
 *
 * `hasLoadedOnce` is not a nicety. This effect depends on `studentProfile`, and
 * every settings toggle calls refreshProfile(), which yields a new object
 * identity — so flipping "Participate in Rankings" re-ran the fetch, set
 * loading true, and replaced the whole dashboard with a loading state for the
 * duration of six Firestore queries. A toggle should move, not blank the page.
 *
 * The dependency array is `[user, isDemoMode, studentProfile]` and deliberately
 * nothing else. Anything this effect WRITES must stay out of it, or the effect
 * retriggers itself forever.
 *
 * Returned as one object rather than a tuple so a caller can destructure only
 * what it needs, and so adding a field later is not a breaking change.
 */
export interface StudentDashboardData {
  applications: Application[];
  savedOpportunities: Opportunity[];
  recommended: Opportunity[];
  hoursRequests: any[];
  allOrganizations: any[];
  isLoading: boolean;
  errorMessage: string | null;
  /** Lets the page clear a banner the user has read. */
  setErrorMessage: (message: string | null) => void;
  /** Optimistic local updates — the page owns the interactions, this owns the reads. */
  setApplications: React.Dispatch<React.SetStateAction<Application[]>>;
  setSavedOpportunities: React.Dispatch<React.SetStateAction<Opportunity[]>>;
  setHoursRequests: React.Dispatch<React.SetStateAction<any[]>>;
  /**
   * The organisation picker on the log-hours form loads lazily, driven by UI
   * state that belongs to the page. The page owns WHEN; this owns the value.
   */
  setAllOrganizations: React.Dispatch<React.SetStateAction<any[]>>;
}

export function useStudentDashboardData(
  user: { uid: string } | null | undefined,
  studentProfile: Partial<StudentProfile> | null | undefined,
  isDemoMode: boolean,
): StudentDashboardData {
  const [applications, setApplications] = useState<Application[]>([]);
  const [savedOpportunities, setSavedOpportunities] = useState<Opportunity[]>([]);
  const [recommended, setRecommended] = useState<Opportunity[]>([]);
  const [hoursRequests, setHoursRequests] = useState<any[]>([]);
  const [allOrganizations, setAllOrganizations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // hasLoadedOnce: the full-page loader is for the FIRST load only.
  //
  // This effect depends on studentProfile, and every settings toggle calls
  // refreshProfile(), which yields a new object identity — so flipping
  // "Participate in Rankings" re-ran the fetch, set isLoading true, and replaced
  // the entire dashboard (sidebar, tabs, and the switch just touched) with
  // "Loading your dashboard..." for the duration of six Firestore queries. A
  // toggle should move, not blank the page. Refetches after the first now happen
  // quietly in the background.
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      if (!hasLoadedOnce.current) setIsLoading(true);

      // Demo-mode fixtures only — see src/pages/studentDashboard/demoOpportunities.ts
      // for why this must never reach the real signed-in path.
      const pool: Opportunity[] = DEMO_OPPORTUNITIES;

      // Ranking lives in src/lib/matchScore.ts. It was redefined inside this
      // effect on every run and closed over the profile; as a free function it
      // can be read and tested without rendering this component.
      const myInterests = studentProfile?.interests || [];
      const mySkills = studentProfile?.skills || [];
      const getMatchScore = (opp: Opportunity) => scoreOpportunity(opp, myInterests, mySkills);

      if (isDemoMode) {
        // Mock data for demo mode synced via local storage
        const storedApps = localStorage.getItem("demo_applications");
        let mockApplications: Application[] = [];
        if (storedApps) {
          // Filter to include applications belonging to the current demo student user (Alex Volunteer has id 'demo-student-1')
          mockApplications = JSON.parse(storedApps).filter(
            (app: any) =>
              app.studentId === "demo-student-1" || app.studentId === user.uid,
          );
        } else {
          mockApplications = [
            {
              id: "demo-app-1",
              opportunityId: "demo-opp-1",
              opportunityTitle: "Welcome Center Support",
              studentId: "demo-student-1",
              studentName: "Alex Volunteer",
              status: "pending",
              message: "I would love to help out at the welcome center!",
              appliedAt: new Date().toISOString(),
            },
          ];
          localStorage.setItem(
            "demo_applications",
            JSON.stringify(mockApplications),
          );
        }
        const mockSaved: Opportunity[] = [
          {
            id: "demo-opp-1",
            orgId: "org-1",
            title: "Math Tutor for Grade 9 Students",
            description: "Help with math homework.",
            location: "5100 Yonge St, North York",
            dateTime: new Date() as any,
            category: "Tutoring",
            requirements: "None",
            maxVolunteers: 5,
            skillsNeeded: ["Teaching"],
            timeCommitment: "Short-term",
            isVirtual: false,
            createdAt: new Date() as any,
          },
        ];

        // Apply dynamic ranking for recommendations in Demo Mode
        const scoredPool = pool.map(opp => ({ opp, score: getMatchScore(opp) }));
        scoredPool.sort((a, b) => b.score - a.score || new Date(b.opp.createdAt).getTime() - new Date(a.opp.createdAt).getTime());
        const mockRec = scoredPool.slice(0, 3).map(item => item.opp);

        const savedReqs = JSON.parse(localStorage.getItem("demo_hours_requests") || "[]");
        const studentReqs = savedReqs.filter(
          (r: any) => r.studentId === "demo-student-1" || r.studentId === user.uid
        );

        setAllOrganizations([
          { id: "demo-org-1", organizationName: "North York Help Feed Foodbank", contactEmail: "feedbox@northyorkfeed.org", contactName: "Sarah Jenkins" },
          { id: "demo-org-2", organizationName: "Lee Lifeson Park Restoration Group", contactEmail: "greenery@yorknature.org", contactName: "David Suzuki Jr" },
          { id: "demo-org-3", organizationName: "Huron Senior Technical Tutoring Hub", contactEmail: "seniors@techhelpyork.org", contactName: "Alan Turing" },
          { id: "demo-org-4", organizationName: "Toronto Youth Shelter Initiative", contactEmail: "shelter@torontoyouth.org", contactName: "John Connor" },
          { id: "demo-org-5", organizationName: "York Region Multicultural Society", contactEmail: "contact@yorkmulti.org", contactName: "Amara Singh" },
        ]);

        setTimeout(() => {
          setApplications(mockApplications);
          setSavedOpportunities(mockSaved);
          setRecommended(mockRec);
          setHoursRequests(studentReqs);
          setIsLoading(false);
        }, 600);
        return;
      }

      try {
        // Fetch applications with a generous limit to see past roles
        const appsQuery = query(
          collection(db, "applications"),
          where("studentId", "==", user.uid),
          orderBy("appliedAt", "desc"),
          limit(50),
        );
        const appsSnap = await getDocs(appsQuery);
        const appsData = appsSnap.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as Application,
        );
        setApplications(appsData);

        // The organization list is NOT loaded here — see the effect below. It
        // feeds one dropdown on the hours form, and reading up to 200 documents
        // on every dashboard visit to populate a control most students never
        // open is most of this screen's cost for none of its value.

        // Fetch hours requests
        try {
          const hoursQuery = query(
            collection(db, "hoursRequests"),
            where("studentId", "==", user.uid),
            // Bounded. This grew forever with use; a student who volunteers
            // weekly for three years would read every row on every visit.
            limit(300)
          );
          const hoursSnap = await getDocs(hoursQuery);
          const hoursList = hoursSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setHoursRequests(hoursList);
        } catch (hoursErr) {
          // No localStorage fallback here, on purpose. This used to fall back
          // to the demo fixture on any query failure, so a real student whose
          // read failed was shown a list of hour claims that were not in the
          // database at all. These are graduation records; showing invented
          // ones is worse than showing none. Say what happened instead.
          setErrorMessage(
            reportError(
              'load hours requests',
              hoursErr,
              "We couldn't load your submitted hours just now. Please refresh to try again.",
            ),
          );
          setHoursRequests([]);
        }

        // Fetch saved opportunities with robust fallback
        let savedIds: string[] = [];
        try {
          // orderBy savedAt: without it Firestore returns an arbitrary five,
          // so a student who bookmarked six opportunities could not see the one
          // they just saved. firestore.indexes.json already provisions exactly
          // this composite index, described as "this student's most recent
          // saves" — the query simply never asked for the ordering.
          const savedQuery = query(
            collection(db, "savedOpportunities"),
            where("studentId", "==", user.uid),
            orderBy("savedAt", "desc"),
            limit(5),
          );
          const savedSnap = await getDocs(savedQuery);
          savedIds = savedSnap.docs.map(
            (doc) => (doc.data() as SavedOpportunity).opportunityId,
          );
        } catch (savedErr) {
          setErrorMessage(
            reportError(
              'load saved opportunities',
              savedErr,
              "We couldn't load your saved opportunities. Please refresh to try again.",
            ),
          );
        }

        // NO demo_saved_ids merge here. This is the real, signed-in path, and
        // that key is a demo fixture: merging it meant ids from any earlier
        // demo session on this browser appeared in a real student's saved list,
        // and a failed Firestore read looked like a successful one with
        // invented contents. Firestore is the record.
        savedIds = savedIds.slice(0, 10);

        if (savedIds.length > 0) {
          try {
            const oppsQuery = query(
              collection(db, "opportunities"),
              where("__name__", "in", savedIds),
            );
            const oppsSnap = await getDocs(oppsQuery);
            setSavedOpportunities(
              oppsSnap.docs.map(
                (doc) => ({ id: doc.id, ...doc.data() }) as Opportunity,
              ),
            );
          } catch (oppsErr) {
            // No demo_opportunities fallback. Substituting invented listings
            // for a failed read showed a real student opportunities that do not
            // exist, at organizations that do not exist, and looked identical
            // to a working page.
            setSavedOpportunities([]);
            setErrorMessage(
              reportError(
                'load saved opportunity details',
                oppsErr,
                "We couldn't load the details of your saved opportunities. Please refresh to try again.",
              ),
            );
          }
        }

        // Fetch up to 50 latest opportunities and rank them
        let fetchedOpps: Opportunity[] = [];
        try {
          const recQuery = query(
            collection(db, "opportunities"),
            orderBy("createdAt", "desc"),
            limit(50),
          );
          const recSnap = await getDocs(recQuery);
          // Dropped here, not in the query: Firestore omits documents missing
          // the field, so a where() clause would have hidden every opportunity
          // created before it existed. Shared with the browse page so the two
          // lists cannot disagree about what a student may see.
          fetchedOpps = recSnap.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }) as Opportunity)
            .filter(isVisibleToStudents);
        } catch (dbErr) {
          // Same as above: an empty list plus an honest message, never invented
          // listings. This is the recommendations feed — the most prominent
          // thing on the dashboard, and the worst place to show fiction.
          fetchedOpps = [];
          setErrorMessage(
            reportError(
              'load recommended opportunities',
              dbErr,
              "We couldn't load opportunities right now. Please refresh to try again.",
            ),
          );
        }

        // NO fallback to `pool` here. This is the real, signed-in path, and
        // `pool` is fabricated demo content — invented titles, invented
        // addresses, invented organizations ("Alan Turing", "David Suzuki Jr").
        //
        // With an empty opportunities collection, which is exactly the state on
        // launch day, every real student was shown three volunteer placements
        // that do not exist. Worse, /student/opportunities renders a correct
        // empty state, so the dashboard and the browse page flatly contradicted
        // each other: three listings on one screen, "nothing available" on the
        // next.
        //
        // An honest empty state is the right answer. `pool` is still used by
        // the demo-mode branch above, which is what it was written for.

        // Apply dynamic scoring and sorting in Production Mode
        const scoredOpps = fetchedOpps.map(opp => ({ opp, score: getMatchScore(opp) }));
        scoredOpps.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          const dateA = a.opp.createdAt ? new Date(a.opp.createdAt).getTime() : 0;
          const dateB = b.opp.createdAt ? new Date(b.opp.createdAt).getTime() : 0;
          return dateB - dateA;
        });

        const finalRecs = scoredOpps.slice(0, 3).map(item => item.opp);
        setRecommended(finalRecs);
      } catch (error: any) {
        console.error("Error fetching dashboard data:", error);
        setErrorMessage(error.message || "Failed to load dashboard data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    hasLoadedOnce.current = true;
  }, [user, isDemoMode, studentProfile]);

  return {
    applications, savedOpportunities, recommended, hoursRequests, allOrganizations,
    isLoading, errorMessage, setErrorMessage,
    setApplications, setSavedOpportunities, setHoursRequests, setAllOrganizations,
  };
}
