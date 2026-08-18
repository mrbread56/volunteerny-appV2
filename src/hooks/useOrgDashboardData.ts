import { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { reportError } from '../lib/errors';
import type { Application, Opportunity } from '../types';

/**
 * Everything the organisation dashboard reads.
 *
 * Lifted out of OrgDashboard for the same reason as the student one: a page
 * should decide what happens when someone clicks something, not how three
 * collections are queried. The effect is unchanged apart from the error
 * handling noted inside it.
 *
 * Depends on `user` and `isDemoMode` only. Unlike the student hook nothing here
 * re-reads when a profile field changes, so it needs no load-once guard.
 */
export interface OrgDashboardData {
  opportunities: Opportunity[];
  recentApplications: Application[];
  isLoading: boolean;
  errorMessage: string | null;
  setErrorMessage: (message: string | null) => void;
  setOpportunities: React.Dispatch<React.SetStateAction<Opportunity[]>>;
  setRecentApplications: React.Dispatch<React.SetStateAction<Application[]>>;
}

export function useOrgDashboardData(
  user: { uid: string } | null | undefined,
  isDemoMode: boolean,
): OrgDashboardData {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [recentApplications, setRecentApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      setIsLoading(true);

      if (isDemoMode) {
        // Mock data for demo mode
        const mockOpps: Opportunity[] = [
          {
            id: "demo-opp-1",
            orgId: user.uid,
            title: "Welcome Center Support",
            description: "Help us welcome new community members.",
            location: "5100 Yonge St, North York",
            dateTime: new Date(Date.now() + 86400000 * 5),
            category: "Community Services",
            requirements: "Friendly attitude.",
            maxVolunteers: 10,
            skillsNeeded: ["Communication"],
            timeCommitment: "One-time",
            isVirtual: false,
            createdAt: new Date() as any,
          },
        ];

        const storedApps = localStorage.getItem("demo_applications");
        let apps: Application[] = storedApps
          ? JSON.parse(storedApps)
          : [
              {
                id: "demo-app-1",
                opportunityId: "demo-opp-1",
                opportunityTitle: "Welcome Center Support",
                studentId: "demo-student-1",
                studentName: "Alex Volunteer",
                status: "pending",
                message: "I would love to help out at the welcome center!",
                appliedAt: new Date() as any,
              },
            ];

        setOpportunities(mockOpps);
        setRecentApplications(apps);
        setIsLoading(false);
        return;
      }

      try {
        // Fetch opportunities
        let oppsData: Opportunity[] = [];
        try {
          const oppsQuery = query(
            collection(db, "opportunities"),
            where("orgId", "==", user.uid),
            orderBy("createdAt", "desc"),
          );
          const oppsSnap = await getDocs(oppsQuery);
          oppsData = oppsSnap.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as Opportunity,
          );
        } catch (dbErr) {
          // Say so. This was a console.warn, so oppsData stayed empty and the
          // page rendered "No opportunities posted yet." — then, because the
          // applications query below is skipped when there are no ids, "No
          // applications to review yet." as well. On any dropped connection or
          // permission error an organization was shown two clean empty states
          // and nothing at all indicating a failure.
          setErrorMessage(
            reportError(
              'load opportunities',
              dbErr,
              "We couldn't load your opportunities. Refresh to try again — they have not been deleted.",
            ),
          );
        }

        // The `local_opportunities` localStorage merge that used to be here is
        // gone. NOTHING in this codebase ever wrote that key — it was read-only
        // dead scaffolding — so it never once produced a fallback. It was also
        // actively harmful: any browser still carrying the key from an older
        // build injected opportunity ids that do not exist in Firestore, and the
        // applications `list` rule proves ownership with exists() on each id in
        // the `in` clause. One phantom id failed that check and denied the whole
        // chunk, so every real applicant vanished behind an error.
        const uniqueOpps = oppsData.filter(
          (opp, idx, self) => self.findIndex((o) => o.id === opp.id) === idx,
        );

        setOpportunities(uniqueOpps);

        // Fetch applications for these opportunities
        let appsData: Application[] = [];
        try {
          const oppIds = uniqueOpps.map((o) => o.id);
          if (oppIds.length > 0) {
            // The bound here is the rules document-access budget, NOT the
            // Firestore 'in' limit of 30. The applications `list` rule
            // (firestore.rules) proves ownership with exists() + get() on
            // opportunities/{opportunityId}, and Firestore allows 10 document
            // accesses per query — two per distinct opportunity in the `in`
            // list, so 5 opportunities is the whole budget. At 30 an
            // organization's applicant list died with permission-denied the
            // moment they posted a 6th opportunity, and every applicant
            // vanished. Do not raise this back towards 30: the 'in' limit
            // permits it and the rules do not. If the ownership check in the
            // rules ever costs more or fewer accesses, this number moves with it.
            const chunkSize = 5;
            const chunks: string[][] = [];
            for (let i = 0; i < oppIds.length; i += chunkSize) {
              chunks.push(oppIds.slice(i, i + chunkSize));
            }

            const queryPromises = chunks.map(async (chunk) => {
              const appsQuery = query(
                collection(db, "applications"),
                where("opportunityId", "in", chunk),
                orderBy("appliedAt", "desc"),
              );
              const snap = await getDocs(appsQuery);
              return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Application);
            });

            const results = await Promise.all(queryPromises);
            appsData = results.flat();
            // Re-sort apps by appliedAt desc since chunks were queried independently
            appsData.sort((a, b) => {
              const dateA = a.appliedAt?.seconds ? a.appliedAt.seconds * 1000 : new Date(a.appliedAt || 0).getTime();
              const dateB = b.appliedAt?.seconds ? b.appliedAt.seconds * 1000 : new Date(b.appliedAt || 0).getTime();
              return dateB - dateA;
            });
          }
        } catch (appsErr) {
          // Deliberately no demo-fixture fallback and no silent console.warn.
          // This catch used to swallow the permission-denied above and then
          // merge localStorage demo_applications in, so a failed read looked
          // identical to "nobody has applied" — real applicants went
          // uncontacted while invented ones showed up in a live organization's
          // list. demo_applications belongs to the isDemoMode branch, which
          // returns well before here.
          setErrorMessage(
            reportError(
              'load organization applications',
              appsErr,
              "We couldn't load the applications to your opportunities. Please refresh to try again.",
            ),
          );
          appsData = [];
        }

        setRecentApplications(appsData);
      } catch (error) {
        // Was console.error alone. The inner reads have their own handling, so
        // this only fires on a total failure — which is exactly when a blank
        // dashboard with no explanation is least acceptable.
        setErrorMessage(reportError('load the dashboard', error,
          "We couldn't load your dashboard just now. Please refresh to try again."));
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user, isDemoMode]);

  return {
    opportunities, recentApplications, isLoading, errorMessage,
    setErrorMessage, setOpportunities, setRecentApplications,
  };
}
