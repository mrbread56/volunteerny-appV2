import React, { useState, useEffect, useRef } from 'react';
import { reportError } from '../lib/errors';
import { describeEligibility } from '../lib/eligibility';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db } from '../firebase/config';
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { Opportunity, OrganizationProfile } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { MapPin, Calendar, Clock, ArrowLeft, Building2, Share2, Bookmark, CheckCircle2, Users, X, Mail, Phone, ShieldAlert } from 'lucide-react';
import { formatDate, cn, copyToClipboard, formatCalendarDate } from '../lib/utils';
import { fetchAcceptedCount } from '../lib/opportunityCapacity';
import ReportModal from '../components/ReportModal';
import { sendTransactionalEmail } from '../lib/emailService';
import { useDialog } from '../hooks/useDialog';

export default function StudentOpportunityDetail() {
  const { id } = useParams();
  const { user, isDemoMode, studentProfile } = useAuth();
  const navigate = useNavigate();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  // One in-page banner for bookmark and share feedback. These were alert()s,
  // which block the page and are silent to screen readers.
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [organization, setOrganization] = useState<OrganizationProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [hasApplied, setHasApplied] = useState(false);
  const [applicationMessage, setApplicationMessage] = useState('');
  const [showApplyModal, setShowApplyModal] = useState(false);
  // useCallback so the identity is stable: useDialog depends on onClose, and a
  // new closure every render would tear down and re-add the key handler
  // (and re-steal focus) on each keystroke in the form.
  const closeApplyModal = React.useCallback(() => setShowApplyModal(false), []);
  const applyDialogRef = useDialog(showApplyModal, closeApplyModal);
  const [isSaved, setIsSaved] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  // null until the count is known, so the sidebar never claims "0 left" while
  // the request is still in flight.
  const [acceptedCount, setAcceptedCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setIsLoading(true);

      if (isDemoMode) {
        // Mock data for demo mode
        const localSaves = JSON.parse(localStorage.getItem('demo_saved_ids') || '[]');
        setIsSaved(localSaves.includes(id || ''));
        const mockOpp: Opportunity = {
          id: id,
          orgId: 'demo-org-1',
          title: id === 'demo-opp-1' ? 'Math Tutor for Grade 9 Students' : 
                 id === 'demo-opp-2' ? 'Community Garden Cleanup' : 'Technical Support Volunteer',
          description: 'This is a demo description of the volunteering opportunity. It includes details about what you will be doing, who you will be helping, and the impact you will make in North York.',
          location: '5100 Yonge St, North York',
          dateTime: new Date(Date.now() + 86400000 * 5) as any,
          category: 'Tutoring',
          requirements: 'Must be patient and have a basic understanding of the subject.',
          maxVolunteers: 10,
          skillsNeeded: ['Communication', 'Leadership'],
          timeCommitment: 'Short-term',
          isVirtual: false,
          createdAt: new Date() as any,
          coordinates: { lat: 43.7615, lng: -79.4111 }
        };
        setOpportunity(mockOpp);
        setOrganization({
           uid: 'demo-org-1',
           organizationName: 'North York Community Hub',
           contactEmail: 'contact@nycommunityhub.org',
           phone: '(416) 555-0199',
           address: '5100 Yonge St, North York',
           mission: 'Helping North York bloom.',
           northYorkConfirmed: true,
           websiteUrl: 'https://nycommunityhub.org'
        });
        setIsLoading(false);
        return;
      }

      try {
        const docRef = doc(db, 'opportunities', id);
        const snap = await getDoc(docRef);
        
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as Opportunity;
          setOpportunity(data);
          
          // Fetch organization.
          //
          // Deliberately non-fatal: the opportunity is already rendered by this
          // point and the page is useful without the organization record. But
          // it must not be SILENT — a missing or unreadable org document used
          // to leave `organization` null with no trace, and the safety-report
          // modal was gated on that state, so the only symptom was a button
          // that did nothing. The modal no longer depends on it; this says so
          // when it happens.
          try {
            const orgSnap = await getDoc(doc(db, 'organizations', data.orgId));
            if (orgSnap.exists()) {
              setOrganization({ uid: orgSnap.id, ...orgSnap.data() } as OrganizationProfile);
            } else {
              reportError(
                'load organization for opportunity',
                new Error(`organizations/${data.orgId} does not exist (opportunity ${snap.id})`),
              );
            }
          } catch (orgErr) {
            reportError('load organization for opportunity', orgErr);
          }

          // How many places are already taken. Counting other students'
          // applications is something the rules correctly refuse a client, so
          // this goes through the endpoint built for exactly that and returns
          // only an integer.
          if (user) {
            fetchAcceptedCount(id)
              .then((n) => setAcceptedCount(typeof n === 'number' ? n : null))
              .catch(() => setAcceptedCount(null));
          }

          // Check if already applied
          if (user) {
            const appQuery = query(
              collection(db, 'applications'), 
              where('opportunityId', '==', id), 
              where('studentId', '==', user.uid)
            );
            const appSnap = await getDocs(appQuery);
            /*
             * Only statuses that still OCCUPY the application block re-applying.
             *
             * This counted an application at ANY status, and the Withdraw button
             * on the dashboard is offered only for pending, reviewed and
             * waitlist — so a rejected or terminated application could never be
             * removed, this page said "You've Applied!" forever, and the Apply
             * button never came back. A student told "try again next term", or
             * who becomes eligible later, had no route at all. Withdrawal
             * already works by DELETING the document rather than tombstoning it,
             * for exactly this reason; rejection was never followed through.
             */
            const BLOCKS_REAPPLY = ['pending', 'reviewed', 'accepted', 'waitlist'];
            setHasApplied(appSnap.docs.some((d) => BLOCKS_REAPPLY.includes(String(d.data()?.status || ''))));

            // Check if bookmarked
            try {
              const savedQuery = query(
                collection(db, 'savedOpportunities'),
                where('studentId', '==', user.uid),
                where('opportunityId', '==', id)
              );
              const savedSnap = await getDocs(savedQuery);
              setIsSaved(!savedSnap.empty);
            } catch (savedErr) {
              // Non-fatal: the page works without knowing the bookmark state.
              // But it must not be silent — showing an unbookmarked star for a
              // read that FAILED means the student re-saves something already
              // saved, and console.error alone told nobody.
              setIsSaved(false);
              reportError('check saved state', savedErr);
            }
          }
        } else {
          navigate('/student/opportunities');
        }
      } catch (err) {
        console.error('Error fetching opportunity:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id, user, navigate]);

  // See handleToggleSave: this is what stops a double-click writing two rows.
  const savingRef = useRef(false);

  const handleToggleSave = async () => {
    if (!user || !id) return;
    /*
     * One at a time.
     *
     * isSaved is only flipped AFTER the await, and the button carries no
     * disabled state, so a double-click had both handlers read isSaved === false
     * and run addDoc twice: two savedOpportunities rows for the same student and
     * opportunity. The dashboard lists bookmarks with orderBy(savedAt) limit(5),
     * so the duplicate eats a slot and the student sees four of their five most
     * recent saves.
     *
     * A ref rather than state because it has to be true before the next click
     * can be handled, and a state update is not.
     */
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      const localSaves = JSON.parse(localStorage.getItem('demo_saved_ids') || '[]');
      if (isSaved) {
        // Unsave
        if (isDemoMode) {
          const updated = localSaves.filter((sid: string) => sid !== id);
          localStorage.setItem('demo_saved_ids', JSON.stringify(updated));
        } else {
          const q = query(collection(db, 'savedOpportunities'), where('studentId', '==', user.uid), where('opportunityId', '==', id));
          const snap = await getDocs(q);
          await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
          // No demo_saved_ids write here. A real student's bookmarks were being
          // mirrored into the demo fixture key, so their genuine saved list
          // leaked into any later demo session on the same browser — and demo
          // ids leaked back the other way while the dashboard still merged them.
        }
        setIsSaved(false);
        setNotice({ kind: 'success', text: 'Removed from your saved opportunities.' });
      } else {
        // Save
        if (isDemoMode) {
          localSaves.push(id);
          localStorage.setItem('demo_saved_ids', JSON.stringify(localSaves));
        } else {
          await addDoc(collection(db, 'savedOpportunities'), {
            studentId: user.uid,
            opportunityId: id,
            savedAt: serverTimestamp()
          });
          // Same as the unsave branch above: demo_saved_ids is a demo fixture
          // and a real save does not belong in it.
        }
        setIsSaved(true);
        setNotice({ kind: 'success', text: 'Saved! Find it under Saved on your dashboard.' });
      }
    } catch (err: any) {
      // permission-denied here usually means the account's profile/role record
      // is incomplete (rules require a completed student profile to bookmark),
      // which "check your connection" would misdescribe entirely.
      const message =
        err?.code === 'permission-denied'
          ? "Your account can't save opportunities yet. Make sure your student profile is complete. Sign out and back in to finish setup if you're prompted."
          : 'Could not update your bookmark. Please check your connection and try again.';
      setNotice({ kind: 'error', text: reportError('toggle bookmark', err, message) });
    } finally {
      savingRef.current = false;
    }
  };

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const handleShare = async () => {
    // Native share sheet first (mobile), clipboard fallback (desktop). The old
    // version only attempted the clipboard, which needs a secure context and a
    // user gesture; where it was unavailable the button simply did nothing.
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (typeof nav.share === 'function') {
      try {
        await nav.share({
          title: opportunity?.title || 'Volunteer opportunity',
          text: `Check out this volunteer opportunity on Volunteer North York: ${opportunity?.title || ''}`,
          url: window.location.href,
        });
        return; // The sheet reports its own outcome; no extra banner needed.
      } catch (err: any) {
        // AbortError = the student dismissed the sheet. That is a cancel, not
        // a failure — fall through silently rather than showing an error.
        if (err?.name === 'AbortError') return;
      }
    }
    const ok = await copyToClipboard(window.location.href);
    setNotice(ok
      ? { kind: 'success', text: 'Link copied to your clipboard.' }
      : { kind: 'error', text: "Couldn't copy the link. You can copy it from the address bar instead." });
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !id || !opportunity) return;

    // Closed postings take no new applications. Checked against the document
    // read at mount AND re-read below, because an organization can close the
    // opportunity while a student has this page open.
    if (opportunity.status === 'closed') {
      setApplyError('This opportunity has closed and is no longer accepting applications.');
      return;
    }

    setIsApplying(true);
    setApplyError("");

    try {
      // Re-read rather than trusting the copy captured at mount. Without this,
      // a student who loaded the page before it closed could still apply.
      const liveOpp = await getDoc(doc(db, 'opportunities', id));
      if (!liveOpp.exists()) {
        setApplyError('This opportunity is no longer available.');
        setIsApplying(false);
        return;
      }
      if (liveOpp.data()?.status === 'closed') {
        setOpportunity((prev) => (prev ? { ...prev, status: 'closed' } : prev));
        setApplyError('This opportunity has just closed and is no longer accepting applications.');
        setIsApplying(false);
        return;
      }
    } catch {
      // A failed re-read must not block a legitimate application; the rules and
      // the capacity check below still apply.
    }

    let determinedStatus = 'pending';
    let currentAcceptedCount = 0;
    // 0 means uncapped, the same reading the sidebar and waitlistService use.
    // This was `|| 10`, so a posting with no limit silently waitlisted the
    // eleventh applicant while the sidebar called it Full from the first.
    const maxVolunteers = Number(opportunity.maxVolunteers) || 0;

    if (isDemoMode) {
      setTimeout(() => {
        const storedApps2 = localStorage.getItem('demo_applications');
        const appsList2 = storedApps2 ? JSON.parse(storedApps2) : [];
        currentAcceptedCount = appsList2.filter((a: any) => a.opportunityId === id && a.status === 'accepted').length;
        if (maxVolunteers > 0 && currentAcceptedCount >= maxVolunteers) {
          determinedStatus = 'waitlist';
        }

        const newApp = {
          id: 'demo-app-' + Date.now(),
          opportunityId: id,
          opportunityTitle: opportunity.title,
          orgId: opportunity.orgId,
          studentId: user?.uid || 'demo-student-1',
          studentName: studentProfile?.fullName || 'Alex Volunteer',
          status: determinedStatus,
          message: applicationMessage,
          appliedAt: new Date().toISOString(),
          // The resume is NOT copied here. It is a base64 blob of up to 400 KB,
          // so a student applying to twenty opportunities stored twenty copies —
          // and every copy went stale the moment they updated it. The review
          // dialog already falls back to the profile copy via
          // /api/students/:id/review-profile, so the organization sees the
          // current resume rather than a snapshot.
        };
        appsList2.push(newApp);
        localStorage.setItem('demo_applications', JSON.stringify(appsList2));

        setHasApplied(true);
        setShowApplyModal(false);
        setIsApplying(false);
      }, 800);
      return;
    }

    try {
      // Capacity comes from the server, not from a client query.
      //
      // Counting accepted applications means reading OTHER students'
      // application documents, which the security rules correctly deny. That
      // query used to live here, inside this same try, so the permission-denied
      // it always threw skipped the addDoc below entirely — nobody could apply
      // to anything. The endpoint returns just an integer.
      //
      // A failed capacity read must not block the application: fall back to
      // 'pending' and let the organization triage. Losing the auto-waitlist is
      // far cheaper than losing the application.
      try {
        currentAcceptedCount = await fetchAcceptedCount(id);
        if (maxVolunteers > 0 && currentAcceptedCount >= maxVolunteers) {
          determinedStatus = 'waitlist';
        }
      } catch (capacityErr) {
        console.warn('Could not read opportunity capacity, applying as pending:', capacityErr);
      }

      // Deterministic id: one application per student per opportunity.
      //
      // This was addDoc, which mints a random id every time, and the only guard
      // against applying twice was the hasApplied flag read once at page load.
      // Two tabs — or a phone and a laptop — opened before applying produced two
      // application documents for the same student: the organization saw them
      // listed twice, and both counted toward maxVolunteers, so an opportunity
      // could fill with duplicates. Keying the document by the pair makes a
      // second application impossible rather than merely unlikely: Firestore
      // then treats it as an update, and the update rule pins appliedAt, so it
      // is refused cleanly instead of silently duplicating.
      /*
       * A finished application is CLEARED before re-applying.
       *
       * The id is the {uid}_{oppId} pair, so a rejected or terminated document
       * still occupies it — and Firestore then treats the write below as an
       * UPDATE, which the student branch of the update rule refuses (it pins
       * appliedAt and permits three keys). Letting the Apply button come back
       * after a rejection without this would have replaced a permanent
       * "You've Applied!" with a button that always errors, which is worse.
       *
       * Deleting rather than reusing, for the same reason withdrawal deletes:
       * the record belongs to the student, a fresh application deserves a fresh
       * appliedAt, and the organisation should not see a resurrected row
       * carrying an old decision on it.
       */
      const priorRef = doc(db, 'applications', `${user.uid}_${id}`);
      /*
       * WRITE FIRST, delete only if the write is refused.
       *
       * Clearing the old document up front is destructive before an operation
       * that can fail: `allow delete` needs only ownership, while `create`
       * needs isVerifiedStudent() (ban + MFA) and dereferences the parent
       * opportunity — so a suspended student, or one whose posting was deleted
       * between page load and Apply, would have lost their record and gained
       * nothing. Trying the write first means the only path that deletes is one
       * where the write has already proved it will be accepted once the id is
       * free.
       */
      const applicationPayload = {
        opportunityId: id,
        // Who the student actually volunteered for. Without this, "Rate this
        // organization" on the student dashboard built its rating document
        // with orgId: undefined — which the Firestore SDK rejects outright, so
        // the rating was silently discarded.
        orgId: opportunity.orgId,
        studentId: user.uid,
        status: determinedStatus,
        appliedAt: serverTimestamp(),
        message: applicationMessage,
        opportunityTitle: opportunity.title,
        studentName: studentProfile?.fullName || user.displayName || 'Student',
        previousExperience: studentProfile?.previousExperience || '',
        /*
         * The resume is NOT copied onto the application any more.
         *
         * It used to be duplicated here, which meant every organisation a
         * student ever applied to held its own copy of the reference in a
         * document that outlives the relationship: it survived rejection,
         * withdrawal and the organisation being suspended. One student
         * applying to eight postings created eight copies to keep track of.
         *
         * The resume now lives in exactly one place, students/{uid}, which
         * firestore.rules restricts to the owner. Organisations read it through
         * GET /api/students/:id/review-profile, which checks a CURRENT
         * relationship and approval status and returns a five-minute signed
         * link. ApplicationReviewDialog already prefers that value.
         */
      };

      try {
        await setDoc(priorRef, applicationPayload);
      } catch (writeErr: any) {
        // A finished application still occupies the {student, opportunity} id,
        // so Firestore treats this as an update and the student branch of the
        // update rule refuses it. Clear that one and try once more; anything
        // else is a real failure and is rethrown to the catch below.
        if (writeErr?.code !== 'permission-denied') throw writeErr;
        const prior = await getDoc(priorRef);
        const priorStatus = prior.exists() ? String(prior.data()?.status || '') : '';
        if (priorStatus !== 'rejected' && priorStatus !== 'terminated') throw writeErr;
        await deleteDoc(priorRef);
        await setDoc(priorRef, applicationPayload);
      }

      setHasApplied(true);
      setShowApplyModal(false);

      // Tell the organization someone applied.
      //
      // Nothing did. The `new_applicant` template has existed all along, the
      // send endpoint accepts it, and its ONLY caller was a dropdown in the
      // developer console's test-email form — so a coordinator found out a
      // student had applied only if they happened to log in and notice the
      // bell. For a small nonprofit checking the site once a fortnight, an
      // application could sit for two weeks before anyone saw it.
      //
      // Fire and forget, after the write: the application is saved either way,
      // and a mail failure must not tell the student their application failed.
      /*
       * The address is re-read here if the page load did not get it.
       *
       * This was gated on `organization?.contactEmail` alone, and `organization`
       * is set by a read whose two failure paths both only call reportError and
       * carry on. So whenever that read failed, the guard was false, no message
       * was composed at all, and the organisation was never told anyone had
       * applied — silently, on the one notification that matters most for a
       * small charity that checks the site fortnightly. One extra getDoc on the
       * apply path is cheaper than that.
       */
      let orgContact = organization?.contactEmail || '';
      let orgDisplayName = organization?.organizationName || opportunity.orgName || 'your organization';
      if (!isDemoMode && !orgContact && opportunity.orgId) {
        try {
          const freshOrg = await getDoc(doc(db, 'organizations', opportunity.orgId));
          if (freshOrg.exists()) {
            orgContact = String(freshOrg.data()?.contactEmail || '');
            orgDisplayName = String(freshOrg.data()?.organizationName || orgDisplayName);
          }
        } catch (retryErr) {
          reportError('re-read organization to notify it of an applicant', retryErr);
        }
      }
      if (!isDemoMode && !orgContact) {
        // Loud rather than silent: the application IS saved, but nobody has been
        // told, and only an operator can notice that.
        reportError(
          'notify organization of a new applicant',
          new Error(`no contactEmail for organizations/${opportunity.orgId} (opportunity ${id})`),
        );
      }

      if (!isDemoMode && orgContact) {
        sendTransactionalEmail({
          to: orgContact,
          subject: `New applicant for "${opportunity.title}"`,
          templateName: 'new_applicant',
          templateData: {
            applicantName: studentProfile?.fullName || user.displayName || 'A student',
            oppTitle: opportunity.title,
            orgName: orgDisplayName,
            message: applicationMessage || '',
            actionLabel: 'Review the application',
            actionUrl: `${window.location.origin}/org/opportunities/${id}/applicants`,
          },
        }).catch((err) => console.error('Could not email the organization about a new applicant:', err));
      }
    } catch (err: any) {
      // Previously this called handleFirestoreError, which logs and then THROWS
      // a new error from inside the catch block. That escaped unhandled, so a
      // failed application left the modal open with no message at all - the
      // student had no idea whether they had applied. Log and tell them.
      console.error('Failed to submit application:', err);
      // permission-denied here almost always means the deterministic id already
      // exists — i.e. this student already applied, probably in another tab.
      // "Check your connection" would be actively misleading.
      if (err?.code === 'permission-denied') {
        setHasApplied(true);
        setApplyError('You have already applied to this opportunity.');
      } else {
        setApplyError(
          "We couldn't submit your application. Please check your connection and try again."
        );
      }
    } finally {
      setIsApplying(false);
    }
  };

  if (isLoading) return <div className="p-20 text-center">Loading details...</div>;
  if (!opportunity)
    return (
      <div className="max-w-3xl mx-auto px-4 py-20">
        <div role="alert" className="bg-red-50 text-red-700 p-4 text-sm border border-red-200 text-center">
          We couldn't load this opportunity. It may have been removed, or your connection dropped.
        </div>
      </div>
    );

  // Derived once, after the guards, so both the sidebar and the confirmation
  // read the same values rather than recomputing the same condition twice.
  const capacity = Number(opportunity.maxVolunteers) || 0;
  const isFull = capacity > 0 && acceptedCount !== null && acceptedCount >= capacity;
  const eligibilityNote = describeEligibility(opportunity, studentProfile?.grade);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Bookmark/share feedback banner. This was previously rendered only inside
          the "opportunity not found" branch above — i.e. the one state where
          Save and Share cannot be clicked — so on the real page both buttons
          gave zero feedback and appeared completely dead. */}
      {notice && (
        <div role="status" aria-live="polite" className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 text-xs border ${notice.kind === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-blue-dark/5 border-blue-dark/20 text-blue-dark'}`}>
          {notice.text}
        </div>
      )}
      {/* A real route, not navigate(-1). The product pushes sharing hard, so
          arriving by a shared link is a designed-for case — and history-back
          then sent the visitor out of the app entirely, under a label that
          promised results. */}
      <Link
        to="/student/opportunities"
        className="flex items-center gap-2 text-ink-muted hover:text-blue-dark font-medium transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to results
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-8">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
               <Badge variant="info" className="px-3 py-1 font-bold text-xs tracking-widest uppercase">
                  {opportunity.category}
               </Badge>
               {opportunity.exclusives?.map(exc => (
                  <Badge key={exc} variant="info" className="px-3 py-1 font-bold text-xs tracking-widest uppercase bg-amber/10 text-amber-700 border-amber-100">
                     {exc}
                  </Badge>
               ))}
            </div>
            <h1 className="text-4xl font-bold text-ink tracking-tight leading-[1.1]">{opportunity.title}</h1>
            <div className="flex flex-wrap items-center gap-6 pt-4 border-y border-line-light py-6">
               <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-dark/5 rounded-lg flex items-center justify-center">
                    <Building2 className="text-blue-dark w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-ink-muted uppercase tracking-widest mb-0.5">Organization</p>
                    {/* Was `organization?.organizationName || 'Loading...'`.
                        By the time this renders, loading is already finished —
                        isLoading gates the whole page above. So when the
                        organization document was missing or unreadable this
                        said "Loading..." forever, and the page looked hung when
                        it was simply done and empty. Fall back to the name the
                        opportunity itself carries, and say so plainly if there
                        is none. */}
                    <p className="font-bold text-ink">
                      {organization?.organizationName || opportunity?.orgName || 'Organization details unavailable'}
                    </p>
                  </div>
               </div>
               {organization?.contactEmail && (
                 <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-paper-3 rounded-lg flex items-center justify-center">
                      <Mail className="text-ink-muted w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-ink-muted uppercase tracking-widest mb-0.5">Contact Email</p>
                      <a href={`mailto:${organization.contactEmail}`} className="font-bold text-ink hover:text-blue-dark">{organization.contactEmail}</a>
                    </div>
                 </div>
               )}
               {organization?.phone && (
                 <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-paper-3 rounded-lg flex items-center justify-center">
                      <Phone className="text-ink-muted w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-ink-muted uppercase tracking-widest mb-0.5">Phone</p>
                      <p className="font-bold text-ink">{organization.phone}</p>
                    </div>
                 </div>
               )}
               <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-paper-3 rounded-lg flex items-center justify-center">
                    <MapPin className="text-ink-muted w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-ink-muted uppercase tracking-widest mb-0.5">Location</p>
                    <p className="font-bold text-ink">{opportunity.location}</p>
                  </div>
               </div>
            </div>
          </div>

          {/* max-w-none removed: it opted OUT of Tailwind Typography's measure
              cap, so the description ran the full width of a max-w-5xl column
              at roughly 115-125 characters per line, against 45-75 (Bringhurst),
              45-90 (USWDS) and 55 measured best for comprehension (Dyson and
              Haselgrove 2001).

              28.5em rather than 65ch: Outfit's "0" advance is 0.656em but its
              real mean advance including spaces is 0.438em, so 65ch in this
              font renders about 97 characters. The em value gives a true 65. */}
          <div className="prose prose-slate max-w-[28.5em]">
            <h3 className="text-xl font-bold text-ink mb-4">Description</h3>
            <p className="text-ink-muted whitespace-pre-wrap leading-relaxed">
              {opportunity.description}
            </p>

            {/* Only when there is something to put under it. Requirements is
                optional on the create form, so this rendered a heading above an
                empty paragraph on every posting that left it blank. */}
            {opportunity.requirements?.trim() && (
              <>
                <h3 className="text-xl font-bold text-ink mt-10 mb-4">Requirements</h3>
                <p className="text-ink-muted whitespace-pre-wrap leading-relaxed">
                  {opportunity.requirements}
                </p>
              </>
            )}

            {/* Guarded, and the whole section is dropped when empty.
                `opportunity.skillsNeeded.map(...)` threw for any document
                without the field, and a throw in render hits the error boundary
                — so one opportunity missing one optional array replaced the
                entire page with "Something went wrong" for every student who
                opened it. Found by the end-to-end journey spec. */}
            {(opportunity.skillsNeeded?.length ?? 0) > 0 && (
              <div className="mt-10">
                 <h3 className="text-xl font-bold text-ink mb-4">Skills Needed</h3>
                 <div className="flex flex-wrap gap-2">
                    {opportunity.skillsNeeded!.map(skill => (
                      <Badge key={skill} variant="secondary" className="px-4 py-2 text-sm font-medium">
                         {skill}
                      </Badge>
                    ))}
                 </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Actions */}
        <div className="lg:col-span-1 space-y-6">
           <Card className="sticky top-24 border-blue-dark/10 ring-4 ring-blue-dark/10 overflow-hidden">
              <CardContent className="p-8 space-y-6">
                 <div className="space-y-4">
                    {opportunity.scheduleType === 'single' || !opportunity.scheduleType ? (
                       <div className="flex items-center justify-between text-sm">
                          <span className="text-ink-muted font-medium flex items-center gap-2"><Calendar className="w-4 h-4" /> Date</span>
                          <span className="font-bold text-ink">{formatDate(opportunity.dateTime?.toDate ? opportunity.dateTime.toDate() : opportunity.dateTime)}</span>
                       </div>
                    ) : (
                       <div className="space-y-3">
                          <div className="flex items-center justify-between text-sm mb-2">
                             <span className="text-ink-muted font-medium flex items-center gap-2"><Calendar className="w-4 h-4" /> Schedule</span>
                             <Badge variant="info" className="text-xs font-semibold tracking-wide bg-blue-dark/5 text-[#153343] border-none">
                                {opportunity.scheduleType === 'recurring' ? 'Weekly' : 'Multi-day'}
                             </Badge>
                          </div>
                          <div className="max-h-[150px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                             {opportunity.shifts?.map((shift, i) => (
                                <div key={i} className="bg-paper-2 p-2.5 rounded-lg border border-line-light flex items-center justify-between">
                                   <div className="flex flex-col">
                                      <span className="text-xs font-bold text-ink-muted leading-tight uppercase tracking-tighter">
                                         {opportunity.scheduleType === 'recurring' ? shift.day : (formatCalendarDate(shift.date) || 'Date to be confirmed')}
                                      </span>
                                      <span className="text-xs font-bold text-ink-soft">
                                         {shift.startTime} - {shift.endTime}
                                      </span>
                                   </div>
                                   <Clock className="w-3 h-3 text-ink-muted" />
                                </div>
                             ))}
                          </div>
                       </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                       <span className="text-ink-muted font-medium flex items-center gap-2"><Clock className="w-4 h-4" /> Commitment</span>
                       <span className="font-bold text-ink">{opportunity.timeCommitment}</span>
                    </div>
                    {/* How many places are LEFT, not just the capacity.
                        This read "10 total", so a student applying to a full
                        opportunity was quietly written as 'waitlist' and then
                        shown "You've Applied!" with no mention of a waitlist
                        anywhere. fetchAcceptedCount was already imported and
                        used inside handleApply — it just was not asked before
                        the decision to apply. */}
                    <div className="flex items-center justify-between text-sm">
                       <span className="text-ink-muted font-medium flex items-center gap-2"><Users className="w-4 h-4" /> Spots</span>
                       {/* Blank or 0 means UNCAPPED, which is how the create
                           form, waitlistService and capacityRefusal all read it.
                           This tested `acceptedCount >= (maxVolunteers || 0)`,
                           so with no cap the test was 0 >= 0 — always true —
                           and a posting with zero accepted volunteers told every
                           student it was Full. The apply handler 380 lines up
                           used a THIRD reading, `|| 10`. One meaning now. */}
                       <span className="font-bold text-ink">
                         {(() => {
                           const cap = Number(opportunity.maxVolunteers) || 0;
                           if (cap <= 0) return 'Open to new volunteers';
                           if (acceptedCount === null) return `${cap} place${cap === 1 ? '' : 's'} in total`;
                           if (acceptedCount >= cap) return 'Full. You can join the waitlist.';
                           return `${Math.max(0, cap - acceptedCount)} of ${cap} left`;
                         })()}
                       </span>
                    </div>
                 </div>

                 <div className="pt-6 border-t border-line-light flex flex-col gap-3">
                    {hasApplied ? (
                      <div className="flex flex-col items-center gap-3 p-4 bg-blue-dark/5 rounded-lg border border-blue-dark/10">
                         <CheckCircle2 className="w-8 h-8 text-blue-dark" />
                         {/* Say WHICH thing happened. The sidebar already knows
                             the posting is full and the write already sets
                             status 'waitlist', but the confirmation said
                             "You've Applied!" either way — so a waitlisted
                             student learned it from the dashboard or the bell,
                             never from the screen they were looking at. */}
                         <span className="font-bold text-blue-dark">
                           {isFull ? "You're on the waitlist" : "You've Applied!"}
                         </span>
                         <p className="text-xs text-ink-soft text-center max-w-[22rem] leading-relaxed">
                           {isFull
                             ? 'Every place is taken right now. If one frees up, the longest-waiting student is moved up automatically and emailed.'
                             : 'You can withdraw any time from your dashboard.'}
                         </p>
                         <Link to="/student/dashboard" className="text-xs text-blue-dark hover:underline">View in dashboard</Link>
                      </div>
                    ) : eligibilityNote ? (
                      /* The browse card warns and this page did not, so a
                         student clicked through a warning into a page that had
                         forgotten it, applied, and was rejected days later.
                         Shown, not enforced: the rule is a guideline the
                         organisation set, not something we can decide for
                         them. */
                      <div className="space-y-3">
                        <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                          {eligibilityNote}
                        </div>
                        <Button
                          onClick={() => setShowApplyModal(true)}
                          className="w-full h-14 rounded-lg bg-blue-dark hover:bg-[#153343] text-white font-bold text-xs uppercase tracking-wide"
                        >
                          Apply anyway
                        </Button>
                      </div>
                    ) : opportunity.status === 'closed' ? (
                      /* Say so rather than offering a button that will be
                         refused. Someone can still reach this page from a
                         bookmark or a shared link after it closes. */
                      <div className="flex flex-col items-center gap-2 p-4 bg-paper-2 rounded-lg border border-line text-center">
                         <span className="font-bold text-ink">Applications are closed</span>
                         <p className="text-xs text-ink-muted leading-relaxed">
                           This organization has the volunteers it needs. Browse other opportunities.
                         </p>
                         <Link to="/student/opportunities" className="text-xs text-blue-dark hover:underline">
                           See what else is open
                         </Link>
                      </div>
                    ) : (
                      <Button size="lg" className="w-full text-lg font-bold " onClick={() => setShowApplyModal(true)}>
                         Apply
                      </Button>
                    )}
                    <div className="flex gap-2">
                       <Button 
                         variant="outline" 
                         className={cn("flex-1 gap-2", isSaved && "bg-blue-dark/5 text-[#153343] border-blue-dark/20")} 
                         onClick={handleToggleSave}
                       >
                         <Bookmark className={cn("w-4 h-4", isSaved && "fill-blue-dark text-blue-dark")} /> 
                         {isSaved ? 'Saved' : 'Save'}
                       </Button>
                       <Button variant="outline" className="flex-1 gap-2" onClick={handleShare}>
                         <Share2 className="w-4 h-4" /> Share
                       </Button>
                    </div>
                    
                    <Button 
                      variant="outline" 
                      onClick={() => setShowReportModal(true)}
                      className="w-full text-xs font-bold text-red-600 border-red-100 hover:bg-red-50/50 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" /> Report Safety Concern
                    </Button>
                 </div>
              </CardContent>
           </Card>
        </div>
      </div>

      {/* Safety Reporting Modal.
          NOT gated on `organization`. It used to be `opportunity && organization`,
          and the organization document is a separate fetch that silently leaves
          the state null whenever the doc is missing or unreadable (see the
          `orgSnap.exists()` check above, which has no else). When that happened
          the button rendered, the click set showReportModal, and no modal ever
          mounted — a dead "Report Safety Concern" button, on the one screen
          where a student is trying to tell us something is wrong.
          Everything the modal needs comes from the opportunity itself; the
          organization record only supplies a nicer display name. */}
      {opportunity && (
        <ReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          reportedUserId={opportunity.orgId}
          reportedUserName={organization?.organizationName || opportunity.orgName || 'This organization'}
          reportedUserRole="organization"
        />
      )}

      {/* Apply Modal.
          Wired to useDialog like the other four dialogs in the app. This one
          had been missed, and it is the modal students actually use: without
          it there was no role="dialog", no Escape, no focus trap and no focus
          restore, so a keyboard user could tab straight past it into the page
          behind with no way to close it. */}
      {showApplyModal && (
        /* The outer layer scrolls, and the centring lives on an inner wrapper
           with min-h-full. Before this the modal was a fixed, non-scrolling
           box centred with `flex items-center` and no height cap, so on any
           viewport shorter than the dialog the top and bottom were simply cut
           off by the edges of the screen with nothing to scroll -- and the
           Send Application button is the last element in it. On a 320x568
           phone a student could read the form and had no way to submit it.
           min-h-full keeps it centred whenever it does fit, so nothing
           changes on a normal screen. */
        <div className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain">
          {/* fixed, not absolute: the backdrop must cover the viewport rather
              than the first screenful of a scrolling container. */}
          <div className="fixed inset-0 bg-ink/60 backdrop-blur-sm" />
          {/* The dismiss handler lives HERE, not on the backdrop.
              Making the overlay scrollable turned the backdrop and this
              centring wrapper into siblings, both positioned and both at
              z-index auto. This one comes later in tree order and is
              min-h-full by full width, so it paints on top of the backdrop
              across the whole viewport — and hit-testing follows paint order,
              so every click landed here and the backdrop's onClick could never
              fire. Click-outside was dead on the one modal students use.
              Escape and the X still worked, which is exactly why it would not
              have been noticed. */}
          <div
            className="relative flex min-h-full items-center justify-center p-4"
            onClick={() => setShowApplyModal(false)}
          >
          {/* The ref and dialog semantics live on this wrapper: Card is a plain
              function component that neither forwards a ref nor accepts ARIA
              props, and widening its signature for one caller is a bigger
              change than the problem needs. */}
          <div
            ref={applyDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Apply to this opportunity"
            className="relative w-full max-w-xl mx-auto"
            // Clicks inside the card are not clicks outside it.
            onClick={(e) => e.stopPropagation()}
          >
          <Card className="relative w-full rounded-lg overflow-hidden border-none animate-in fade-in zoom-in duration-300 shadow-card">
            <button
              onClick={() => setShowApplyModal(false)}
              aria-label="Close"
              className="absolute top-6 right-6 p-2 rounded-lg hover:bg-paper-3 transition-colors text-ink-muted z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <CardHeader className="px-6 sm:px-10 pt-10 sm:pt-12 pb-6">
               <CardTitle className="text-2xl font-bold text-ink tracking-tight">Apply to this opportunity</CardTitle>
               <p className="text-ink-muted text-sm">Apply for <strong>{opportunity.title}</strong></p>
            </CardHeader>
            <CardContent className="px-6 sm:px-10 pb-10 sm:pb-12">
               <form onSubmit={handleApply} className="space-y-6">
                  {applyError && (
                     <div role="alert" aria-live="assertive" className="bg-red-50 text-red-700 p-3.5 text-xs border border-red-200">
                        {applyError}
                     </div>
                  )}
                  <div className="space-y-3">
                     <p className="text-xs text-ink-muted bg-blue-dark/5 p-4 rounded-lg">
                        Applying shares your name, school, grade, neighbourhood, interests, skills,
                availability, previous experience, and your resume if you uploaded one.
                     </p>
                  </div>

                  {/* The field that was already being saved but could never be
                      filled in. `applicationMessage` was written onto every
                      application and setApplicationMessage was never called from
                      anywhere, so every application arrived with message: "" and
                      the organization's "Personal Message" panel always read
                      "No message provided." */}
                  <div className="space-y-2">
                     <label htmlFor="application-message" className="text-xs font-semibold text-ink">
                        Anything you'd like to add? <span className="font-normal text-ink-muted">(optional)</span>
                     </label>
                     <textarea
                        id="application-message"
                        value={applicationMessage}
                        onChange={(e) => setApplicationMessage(e.target.value.slice(0, 1000))}
                        rows={4}
                        maxLength={1000}
                        placeholder="Why this opportunity interests you, when you're free, or anything the organization should know."
                        className="w-full p-3.5 text-sm bg-paper-2 border border-line rounded-lg outline-none focus:ring-1 focus:ring-blue-dark focus:bg-white transition-all resize-y leading-relaxed"
                     />
                     <p className="text-xs text-ink-muted text-right">{applicationMessage.length}/1000</p>
                  </div>


                  <Button 
                     type="submit" 
                     className="w-full h-16 rounded-lg bg-blue-dark hover:bg-[#153343] text-white font-bold text-xs uppercase tracking-wide  transition-all" 
                     disabled={isApplying}
                  >
                     {isApplying ? 'Sending…' : 'Apply'}
                  </Button>
               </form>
            </CardContent>
          </Card>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
