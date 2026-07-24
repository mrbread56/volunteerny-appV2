import React, { useState, useEffect } from 'react';
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
import ReportModal from '../components/ReportModal';

export default function StudentOpportunityDetail() {
  const { id } = useParams();
  const { user, isDemoMode, studentProfile } = useAuth();
  const navigate = useNavigate();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [organization, setOrganization] = useState<OrganizationProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [hasApplied, setHasApplied] = useState(false);
  const [applicationMessage, setApplicationMessage] = useState('');
  const [showApplyModal, setShowApplyModal] = useState(false);
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
          
          // Fetch organization
          const orgSnap = await getDoc(doc(db, 'organizations', data.orgId));
          if (orgSnap.exists()) {
            setOrganization({ uid: orgSnap.id, ...orgSnap.data() } as OrganizationProfile);
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
              console.warn('Error checking saved state from Firestore:', savedErr);
              const localSaves = JSON.parse(localStorage.getItem('demo_saved_ids') || '[]');
              setIsSaved(localSaves.includes(id || ''));
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
          
          const updated = localSaves.filter((sid: string) => sid !== id);
          localStorage.setItem('demo_saved_ids', JSON.stringify(updated));
        }
        setIsSaved(false);
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
          if (!localSaves.includes(id)) {
            localSaves.push(id);
            localStorage.setItem('demo_saved_ids', JSON.stringify(localSaves));
          }
        }
        setIsSaved(true);
      }
    } catch (err: any) {
      console.error('Error toggling opportunity bookmark:', err);
      alert('Could not update bookmark. Please check your connection and try again.');
    }
  };

  const handleShare = async () => {
    const ok = await copyToClipboard(window.location.href);
    if (ok) {
      alert('Link copied to clipboard successfully!');
    } else {
      alert('Failed to copy link.');
    }
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
          studentId: user?.uid || 'demo-student-1',
          studentName: studentProfile?.fullName || 'Alex Volunteer',
          status: determinedStatus,
          message: applicationMessage,
          appliedAt: new Date().toISOString(),
          resumeUrl: studentProfile?.resumeUrl || ''
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
      // Fetch accepted count to see if full
      const acceptedQ = query(
        collection(db, 'applications'),
        where('opportunityId', '==', id),
        where('status', '==', 'accepted')
      );
      const snap = await getDocs(acceptedQ);
      currentAcceptedCount = snap.size;
      if (currentAcceptedCount >= maxVolunteers) {
        determinedStatus = 'waitlist';
      }

      await addDoc(collection(db, 'applications'), {
        opportunityId: id,
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
      <button 
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-slate-600 hover:text-[#1F4C63] font-medium transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to results
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-8">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
               <Badge variant="info" className="px-3 py-1 font-bold text-[10px] tracking-widest uppercase">
                  {opportunity.category}
               </Badge>
               {opportunity.exclusives?.map(exc => (
                  <Badge key={exc} variant="info" className="px-3 py-1 font-bold text-[10px] tracking-widest uppercase bg-[#E08A3C]/10 text-amber-700 border-amber-100">
                     {exc}
                  </Badge>
               ))}
            </div>
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight leading-[1.1]">{opportunity.title}</h1>
            <div className="flex flex-wrap items-center gap-6 pt-4 border-y border-slate-100 py-6">
               <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-[#1F4C63]/5 rounded-sm flex items-center justify-center">
                    <Building2 className="text-[#1F4C63] w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-0.5">Organization</p>
                    <p className="font-bold text-slate-900">{organization?.organizationName || 'Loading...'}</p>
                  </div>
               </div>
               {organization?.contactEmail && (
                 <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-slate-100 rounded-sm flex items-center justify-center">
                      <Mail className="text-slate-600 w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-0.5">Contact Email</p>
                      <a href={`mailto:${organization.contactEmail}`} className="font-bold text-slate-900 hover:text-[#1F4C63]">{organization.contactEmail}</a>
                    </div>
                 </div>
               )}
               {organization?.phone && (
                 <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-slate-100 rounded-sm flex items-center justify-center">
                      <Phone className="text-slate-600 w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-0.5">Phone</p>
                      <p className="font-bold text-slate-900">{organization.phone}</p>
                    </div>
                 </div>
               )}
               <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-slate-100 rounded-sm flex items-center justify-center">
                    <MapPin className="text-slate-600 w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-0.5">Location</p>
                    <p className="font-bold text-slate-900">{opportunity.location}</p>
                  </div>
               </div>
            </div>
          </div>

          <div className="prose prose-slate max-w-none">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Description</h3>
            <p className="text-slate-600 whitespace-pre-wrap leading-relaxed">
              {opportunity.description}
            </p>

            <h3 className="text-xl font-bold text-slate-900 mt-10 mb-4">Requirements</h3>
            <p className="text-slate-600 whitespace-pre-wrap leading-relaxed">
              {opportunity.requirements}
            </p>

            <div className="mt-10">
               <h3 className="text-xl font-bold text-slate-900 mb-4">Skills Needed</h3>
               <div className="flex flex-wrap gap-2">
                  {opportunity.skillsNeeded.map(skill => (
                    <Badge key={skill} variant="secondary" className="px-4 py-2 text-sm font-medium">
                       {skill}
                    </Badge>
                  ))}
               </div>
            </div>
          </div>
        </div>

        {/* Sidebar Actions */}
        <div className="lg:col-span-1 space-y-6">
           <Card className="sticky top-24 border-[#1F4C63]/10 ring-4 ring-blue-50 overflow-hidden">
              <CardContent className="p-8 space-y-6">
                 <div className="space-y-4">
                    {opportunity.scheduleType === 'single' || !opportunity.scheduleType ? (
                       <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-600 font-medium flex items-center gap-2"><Calendar className="w-4 h-4" /> Date</span>
                          <span className="font-bold text-slate-900">{formatDate(opportunity.dateTime?.toDate ? opportunity.dateTime.toDate() : opportunity.dateTime)}</span>
                       </div>
                    ) : (
                       <div className="space-y-3">
                          <div className="flex items-center justify-between text-sm mb-2">
                             <span className="text-slate-600 font-medium flex items-center gap-2"><Calendar className="w-4 h-4" /> Schedule</span>
                             <Badge variant="info" className="text-[9px] font-black uppercase tracking-widest bg-[#1F4C63]/5 text-[#153343] border-none">
                                {opportunity.scheduleType === 'recurring' ? 'Weekly' : 'Multi-day'}
                             </Badge>
                          </div>
                          <div className="max-h-[150px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                             {opportunity.shifts?.map((shift, i) => (
                                <div key={i} className="bg-slate-50 p-2.5 rounded-sm border border-slate-100 flex items-center justify-between">
                                   <div className="flex flex-col">
                                      <span className="text-[10px] font-black text-slate-600 leading-tight uppercase tracking-tighter">
                                         {opportunity.scheduleType === 'recurring' ? shift.day : formatDate(shift.date)}
                                      </span>
                                      <span className="text-xs font-bold text-slate-700">
                                         {shift.startTime} - {shift.endTime}
                                      </span>
                                   </div>
                                   <Clock className="w-3 h-3 text-slate-600" />
                                </div>
                             ))}
                          </div>
                       </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                       <span className="text-slate-600 font-medium flex items-center gap-2"><Clock className="w-4 h-4" /> Commitment</span>
                       <span className="font-bold text-slate-900">{opportunity.timeCommitment}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                       <span className="text-slate-600 font-medium flex items-center gap-2"><Users className="w-4 h-4" /> Spots</span>
                       <span className="font-bold text-slate-900">{opportunity.maxVolunteers} total</span>
                    </div>
                 </div>

                 <div className="pt-6 border-t border-slate-100 flex flex-col gap-3">
                    {hasApplied ? (
                      <div className="flex flex-col items-center gap-3 p-4 bg-[#1F4C63]/5 rounded-sm border border-[#1F4C63]/10">
                         <CheckCircle2 className="w-8 h-8 text-[#1F4C63]" />
                         <span className="font-bold text-[#1F4C63]">You've Applied!</span>
                         <Link to="/student/dashboard" className="text-xs text-[#1F4C63] hover:underline">View in dashboard</Link>
                      </div>
                    ) : (
                      <Button size="lg" className="w-full text-lg font-black  shadow-blue-200" onClick={() => setShowApplyModal(true)}>
                         Apply Now
                      </Button>
                    )}
                    <div className="flex gap-2">
                       <Button 
                         variant="outline" 
                         className={cn("flex-1 gap-2", isSaved && "bg-[#1F4C63]/5 text-[#153343] border-[#1F4C63]/20")} 
                         onClick={handleToggleSave}
                       >
                         <Bookmark className={cn("w-4 h-4", isSaved && "fill-blue-600 text-[#1F4C63]")} /> 
                         {isSaved ? 'Saved' : 'Save'}
                       </Button>
                       <Button variant="outline" className="flex-1 gap-2" onClick={handleShare}>
                         <Share2 className="w-4 h-4" /> Share
                       </Button>
                    </div>
                    
                    <Button 
                      variant="outline" 
                      onClick={() => setShowReportModal(true)}
                      className="w-full text-xs font-bold text-red-600 text-red-600 border-red-100 hover:bg-red-50/50 flex items-center justify-center gap-1.5 py-2.5 rounded-sm border"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" /> Report Safety Concern
                    </Button>
                 </div>
              </CardContent>
           </Card>
        </div>
      </div>

      {/* Safety Reporting Modal Option */}
      {opportunity && organization && (
        <ReportModal 
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          reportedUserId={opportunity.orgId}
          reportedUserName={organization.organizationName || 'York Region Organization'}
          reportedUserRole="organization"
        />
      )}

      {/* Apply Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowApplyModal(false)} />
          <Card className="relative w-full max-w-xl mx-auto  rounded-sm overflow-hidden border-none animate-in fade-in zoom-in duration-300">
            <button 
              onClick={() => setShowApplyModal(false)}
              className="absolute top-6 right-6 p-2 rounded-sm hover:bg-slate-100 transition-colors text-slate-600 z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <CardHeader className="px-10 pt-12 pb-6">
               <CardTitle className="text-2xl font-black text-slate-900 uppercase tracking-tight">Express Interest</CardTitle>
               <p className="text-slate-600 text-sm">Apply for <strong>{opportunity.title}</strong></p>
            </CardHeader>
            <CardContent className="px-10 pb-12">
               <form onSubmit={handleApply} className="space-y-6">
                  {applyError && (
                     <div role="alert" aria-live="assertive" className="bg-red-50 text-red-700 p-3.5 text-[13px] border border-red-200">
                        {applyError}
                     </div>
                  )}
                  <div className="space-y-3">
                     <p className="text-xs text-slate-600 bg-[#1F4C63]/5 p-4 rounded-sm italic">
                        Your profile description and previous experience will automatically be shared with the organization.
                     </p>
                  </div>
                  
                  <Button 
                     type="submit" 
                     className="w-full h-16 rounded-sm bg-[#1F4C63] hover:bg-[#153343] text-white font-black text-xs uppercase tracking-[0.2em]  shadow-blue-200 transition-all hover:scale-[1.02] active:scale-[0.98]" 
                     disabled={isApplying}
                  >
                     {isApplying ? 'Submitting...' : 'Send Application'}
                  </Button>
               </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
