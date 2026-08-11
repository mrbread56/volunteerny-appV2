import React, { useState, useEffect } from 'react';
import { reportError } from '../lib/errors';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db } from '../firebase/config';
import { doc, getDoc, collection, addDoc, serverTimestamp, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { Opportunity, Application, OrganizationProfile } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { MapPin, Calendar, Clock, ArrowLeft, Building2, Share2, Bookmark, CheckCircle2, Users, X, Mail, Phone, Globe, ShieldAlert } from 'lucide-react';
import { formatDate, cn, copyToClipboard } from '../lib/utils';
import { fetchAcceptedCount } from '../lib/opportunityCapacity';
import ReportModal from '../components/ReportModal';
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

          // Check if already applied
          if (user) {
            const appQuery = query(
              collection(db, 'applications'), 
              where('opportunityId', '==', id), 
              where('studentId', '==', user.uid)
            );
            const appSnap = await getDocs(appQuery);
            setHasApplied(!appSnap.empty);

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

  const handleToggleSave = async () => {
    if (!user || !id) return;
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
          ? "Your account can't save opportunities yet. Make sure your student profile is complete — sign out and back in to finish setup if you're prompted."
          : 'Could not update your bookmark. Please check your connection and try again.';
      setNotice({ kind: 'error', text: reportError('toggle bookmark', err, message) });
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
    
    setIsApplying(true);
    setApplyError("");

    let determinedStatus = 'pending';
    let currentAcceptedCount = 0;
    const maxVolunteers = opportunity.maxVolunteers || 10;

    if (isDemoMode) {
      setTimeout(() => {
        const storedApps2 = localStorage.getItem('demo_applications');
        const appsList2 = storedApps2 ? JSON.parse(storedApps2) : [];
        currentAcceptedCount = appsList2.filter((a: any) => a.opportunityId === id && a.status === 'accepted').length;
        if (currentAcceptedCount >= maxVolunteers) {
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
        if (currentAcceptedCount >= maxVolunteers) {
          determinedStatus = 'waitlist';
        }
      } catch (capacityErr) {
        console.warn('Could not read opportunity capacity, applying as pending:', capacityErr);
      }

      await addDoc(collection(db, 'applications'), {
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
        resumeUrl: studentProfile?.resumeUrl || ''
      });

      setHasApplied(true);
      setShowApplyModal(false);
    } catch (err: any) {
      // Previously this called handleFirestoreError, which logs and then THROWS
      // a new error from inside the catch block. That escaped unhandled, so a
      // failed application left the modal open with no message at all - the
      // student had no idea whether they had applied. Log and tell them.
      console.error('Failed to submit application:', err);
      setApplyError(
        "We couldn't submit your application. Please check your connection and try again."
      );
    } finally {
      setIsApplying(false);
    }
  };

  if (isLoading) return <div className="p-20 text-center">Loading details...</div>;
  if (!opportunity)
    return (
      <div className="max-w-3xl mx-auto px-4 py-20">
        <div role="alert" className="bg-red-50 text-red-700 p-4 text-[14px] border border-red-200 text-center">
          We couldn't load this opportunity. It may have been removed, or your connection dropped.
        </div>
      </div>
    );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Bookmark/share feedback banner. This was previously rendered only inside
          the "opportunity not found" branch above — i.e. the one state where
          Save and Share cannot be clicked — so on the real page both buttons
          gave zero feedback and appeared completely dead. */}
      {notice && (
        <div role="status" aria-live="polite" className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 text-[13px] border ${notice.kind === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-blue-50 border-blue-105 text-blue-dark'}`}>
          {notice.text}
        </div>
      )}
      <button 
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-ink-muted hover:text-blue-dark font-medium transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to results
      </button>

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
            <h1 className="text-4xl font-semibold text-ink tracking-tight leading-[1.1]">{opportunity.title}</h1>
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
                    <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
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
                    <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                      <Phone className="text-ink-muted w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-ink-muted uppercase tracking-widest mb-0.5">Phone</p>
                      <p className="font-bold text-ink">{organization.phone}</p>
                    </div>
                 </div>
               )}
               <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                    <MapPin className="text-ink-muted w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-ink-muted uppercase tracking-widest mb-0.5">Location</p>
                    <p className="font-bold text-ink">{opportunity.location}</p>
                  </div>
               </div>
            </div>
          </div>

          <div className="prose prose-slate max-w-none">
            <h3 className="text-xl font-bold text-ink mb-4">Description</h3>
            <p className="text-ink-muted whitespace-pre-wrap leading-relaxed">
              {opportunity.description}
            </p>

            <h3 className="text-xl font-bold text-ink mt-10 mb-4">Requirements</h3>
            <p className="text-ink-muted whitespace-pre-wrap leading-relaxed">
              {opportunity.requirements}
            </p>

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
           <Card className="sticky top-24 border-blue-dark/10 ring-4 ring-blue-50 overflow-hidden">
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
                                         {opportunity.scheduleType === 'recurring' ? shift.day : (shift.date ? formatDate(shift.date) : 'Date to be confirmed')}
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
                    <div className="flex items-center justify-between text-sm">
                       <span className="text-ink-muted font-medium flex items-center gap-2"><Users className="w-4 h-4" /> Spots</span>
                       <span className="font-bold text-ink">{opportunity.maxVolunteers} total</span>
                    </div>
                 </div>

                 <div className="pt-6 border-t border-line-light flex flex-col gap-3">
                    {hasApplied ? (
                      <div className="flex flex-col items-center gap-3 p-4 bg-blue-dark/5 rounded-lg border border-blue-dark/10">
                         <CheckCircle2 className="w-8 h-8 text-blue-dark" />
                         <span className="font-bold text-blue-dark">You've Applied!</span>
                         <Link to="/student/dashboard" className="text-xs text-blue-dark hover:underline">View in dashboard</Link>
                      </div>
                    ) : (
                      <Button size="lg" className="w-full text-lg font-bold shadow-blue-200" onClick={() => setShowApplyModal(true)}>
                         Apply Now
                      </Button>
                    )}
                    <div className="flex gap-2">
                       <Button 
                         variant="outline" 
                         className={cn("flex-1 gap-2", isSaved && "bg-blue-dark/5 text-[#153343] border-blue-dark/20")} 
                         onClick={handleToggleSave}
                       >
                         <Bookmark className={cn("w-4 h-4", isSaved && "fill-blue-600 text-blue-dark")} /> 
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowApplyModal(false)} />
          {/* The ref and dialog semantics live on this wrapper: Card is a plain
              function component that neither forwards a ref nor accepts ARIA
              props, and widening its signature for one caller is a bigger
              change than the problem needs. */}
          <div
            ref={applyDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Express interest in this opportunity"
            className="relative w-full max-w-xl mx-auto"
          >
          <Card className="relative w-full rounded-lg overflow-hidden border-none animate-in fade-in zoom-in duration-300">
            <button
              onClick={() => setShowApplyModal(false)}
              aria-label="Close"
              className="absolute top-6 right-6 p-2 rounded-lg hover:bg-slate-100 transition-colors text-ink-muted z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <CardHeader className="px-10 pt-12 pb-6">
               <CardTitle className="text-2xl font-bold text-ink uppercase tracking-tight">Express Interest</CardTitle>
               <p className="text-ink-muted text-sm">Apply for <strong>{opportunity.title}</strong></p>
            </CardHeader>
            <CardContent className="px-10 pb-12">
               <form onSubmit={handleApply} className="space-y-6">
                  {applyError && (
                     <div role="alert" aria-live="assertive" className="bg-red-50 text-red-700 p-3.5 text-[13px] border border-red-200">
                        {applyError}
                     </div>
                  )}
                  <div className="space-y-3">
                     <p className="text-xs text-ink-muted bg-blue-dark/5 p-4 rounded-lg italic">
                        Your profile description and previous experience will automatically be shared with the organization.
                     </p>
                  </div>
                  
                  <Button 
                     type="submit" 
                     className="w-full h-16 rounded-lg bg-blue-dark hover:bg-[#153343] text-white font-bold text-xs uppercase tracking-wide shadow-blue-200 transition-all hover:scale-[1.02] active:scale-[0.98]" 
                     disabled={isApplying}
                  >
                     {isApplying ? 'Submitting...' : 'Send Application'}
                  </Button>
               </form>
            </CardContent>
          </Card>
          </div>
        </div>
      )}
    </div>
  );
}
