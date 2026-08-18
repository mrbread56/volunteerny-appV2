import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { reportError } from '../lib/errors';
import { useDialog } from '../hooks/useDialog';
import { useLocation, useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, getDocs, where, limit, orderBy, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { Opportunity, SavedOpportunity } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import OpportunityCard from '../components/OpportunityCard';
import { Map as MapIcon, List, Search, X, MapPin, Share2 } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { OPPORTUNITY_CATEGORIES, OPPORTUNITY_EXCLUSIVES } from '../constants';
import { cn, copyToClipboard } from '../lib/utils';
import { useGeolocation } from '../hooks/useGeolocation';
import { COMMITMENTS } from '../lib/vocabularies';

// Leaflet lives in src/components/OpportunitiesMap.tsx and is reached through
// React.lazy below, so the 154 kB map bundle is fetched only when a student
// actually switches to map view — not on every visit to the browse page.
const OpportunitiesMap = lazy(() => import('../components/OpportunitiesMap'));


export default function StudentOpportunities() {
  const { user, studentProfile, isDemoMode } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { coords } = useGeolocation();
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Synchronize userCoords from GPS coordinates or student profile neighborhood
  useEffect(() => {
    if (coords) {
      setUserCoords(prev => {
        if (prev?.lat === coords.latitude && prev?.lng === coords.longitude) return prev;
        return { lat: coords.latitude, lng: coords.longitude };
      });
    } else {
      const neighborhood = studentProfile?.neighborhood || "";
      const lower = neighborhood.toLowerCase();
      let lat = 43.7615;
      let lng = -79.4111;
      
      if (lower.includes("willowdale")) {
        lat = 43.7725; lng = -79.4124;
      } else if (lower.includes("york mills")) {
        lat = 43.7431; lng = -79.4053;
      } else if (lower.includes("bayview")) {
        lat = 43.7679; lng = -79.3791;
      } else if (lower.includes("don mills")) {
        lat = 43.7371; lng = -79.3431;
      } else if (lower.includes("downtown")) {
        lat = 43.6532; lng = -79.3832;
      } else if (lower.includes("scarborough")) {
        lat = 43.7764; lng = -79.2318;
      } else if (lower.includes("etobicoke")) {
        lat = 43.6205; lng = -79.5489;
      } else if (lower.includes("east york")) {
        lat = 43.6912; lng = -79.3417;
      } else if (lower.includes("york")) {
        lat = 43.6954; lng = -79.4503;
      } else if (lower.includes("north york")) {
        lat = 43.7615; lng = -79.4111;
      }
      
      setUserCoords(prev => {
        if (prev?.lat === lat && prev?.lng === lng) return prev;
        return { lat, lng };
      });
    }
  }, [coords, studentProfile?.neighborhood]);


  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('');
  const [exclusive, setExclusive] = useState('');
  const [commitment, setCommitment] = useState('');
  const [virtualOnly, setVirtualOnly] = useState(false);
  const [sharingOpp, setSharingOpp] = useState<Opportunity | null>(null);
  const closeShareDialog = useCallback(() => setSharingOpp(null), []);
  const shareDialogRef = useDialog(!!sharingOpp, closeShareDialog);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Shared by the toolbar button and the empty state, so "clear filters" cannot
  // drift between the two places that offer it.
  const hasActiveFilters = !!(searchTerm || category || exclusive || commitment || virtualOnly);
  const clearAllFilters = useCallback(() => {
    setSearchTerm(''); setCategory(''); setExclusive(''); setCommitment(''); setVirtualOnly(false);
  }, []);

  useEffect(() => {
    if (!saveError) return;
    const timer = setTimeout(() => setSaveError(null), 5000);
    return () => clearTimeout(timer);
  }, [saveError]);

  const categoriesOptions = [{ value: '', label: 'All Categories' }, ...OPPORTUNITY_CATEGORIES.map(cat => ({ value: cat, label: cat }))];
  const exclusivesOptions = [{ value: '', label: 'All Eligibility' }, ...OPPORTUNITY_EXCLUSIVES.map(exc => ({ value: exc, label: exc }))];

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const cat = params.get('category');
    if (cat) setCategory(cat);
  }, [location]);

  useEffect(() => {
    const fetchOpps = async () => {
      setIsLoading(true);

      if (isDemoMode) {
        // Mock data for demo mode
        const mockOpps: Opportunity[] = [
          {
            id: 'demo-opp-1',
            orgId: 'demo-org-1',
            title: 'Math Tutor for Grade 9 Students',
            description: 'Help students with their algebra and geometry homework.',
            location: '5100 Yonge St, North York',
            dateTime: new Date(Date.now() + 86400000 * 2),
            category: 'Tutoring',
            exclusives: ['School Exclusive'],
            requirements: 'Good understanding of Grade 9 Math.',
            maxVolunteers: 5,
            skillsNeeded: ['Teaching', 'Communication'],
            timeCommitment: 'Short-term',
            isVirtual: false,
            createdAt: new Date() as any,
            coordinates: { lat: 43.7615, lng: -79.4111 }
          },
          {
            id: 'demo-opp-2',
            orgId: 'demo-org-2',
            title: 'Community Garden Cleanup',
            description: 'Join us for a day of planting and cleaning at the community garden.',
            location: 'Lee Lifeson Art Park, North York',
            dateTime: new Date(Date.now() + 86400000 * 7),
            category: 'Environment',
            exclusives: ['Club Exclusive'],
            requirements: 'Willingness to work outdoors.',
            maxVolunteers: 15,
            skillsNeeded: ['Physical Work'],
            timeCommitment: 'One-time',
            isVirtual: false,
            createdAt: new Date() as any,
            coordinates: { lat: 43.7680, lng: -79.4050 }
          },
          {
            id: 'demo-opp-3',
            orgId: 'demo-org-3',
            title: 'Technical Support volunteer',
            description: 'Help seniors learn how to use their smartphones and tablets.',
            location: '21 Hendon Ave, North York',
            dateTime: new Date(Date.now() + 86400000 * 1),
            category: 'Seniors',
            requirements: 'Patience and basic smartphone knowledge.',
            maxVolunteers: 3,
            skillsNeeded: ['Computer & Tech', 'Communication'],
            timeCommitment: 'Long-term',
            isVirtual: false,
            createdAt: new Date() as any,
            coordinates: { lat: 43.7780, lng: -79.4150 }
          }
        ];
        
        setTimeout(() => {
          setOpportunities(mockOpps);
          setIsLoading(false);
        }, 600);
        return;
      }

      try {
        // Bounded. This had no limit at all, so the main browse page downloaded
        // EVERY opportunity ever posted on every visit and filtered them in the
        // browser — a read cost and a payload that grow with the collection
        // forever, on the one page students open most. The `limit` import was
        // already sitting there unused. 200 is far past what anyone scrolls,
        // and the newest are what the ordering guarantees are kept.
        const oppsQuery = query(
          collection(db, 'opportunities'),
          orderBy('createdAt', 'desc'),
          limit(200),
        );
        const snap = await getDocs(oppsQuery);
        // Closed postings are filtered HERE rather than with a
        // where('status','==','open') clause, deliberately: Firestore omits
        // documents that lack the field entirely, so a query filter would have
        // hidden every opportunity created before `status` existed. Absent
        // means open.
        setOpportunities(
          snap.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as Opportunity))
            .filter(o => o.status !== 'closed'),
        );

        // Fetch saved status with local storage fallback mirror
        if (user) {
          const localSaves = JSON.parse(localStorage.getItem('demo_saved_ids') || '[]');
          try {
            const savedQuery = query(collection(db, 'savedOpportunities'), where('studentId', '==', user.uid), limit(200));
            const savedSnap = await getDocs(savedQuery);
            const remoteIds = savedSnap.docs.map(doc => (doc.data() as SavedOpportunity).opportunityId);
            const merged = Array.from(new Set([...remoteIds, ...(isDemoMode ? localSaves : [])]));
            setSavedIds(merged);
          } catch (dbErr) {
            // Falling back to an empty list is correct — demo ids must never
            // stand in for a real student's bookmarks — but it used to do that
            // behind a console.error, so every saved opportunity silently
            // appeared unsaved and the student had no idea the read had failed.
            setSavedIds(isDemoMode ? localSaves : []);
            reportError('load saved opportunity ids', dbErr);
          }
        }
      } catch (err) {
        // This was a bare console.error, so `opportunities` stayed [] and the
        // page rendered its empty state: "No volunteer opportunities yet." A
        // student on a dropped connection was told there was nothing to
        // volunteer for and left. A failed read is not an empty result.
        setLoadError(
          reportError(
            'load opportunities',
            err,
            "We couldn't load the opportunities. Check your connection and refresh to try again.",
          ),
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchOpps();
  }, [user]);

  /**
   * Bookmark or un-bookmark an opportunity.
   *
   * The optimistic update is now REVERTED when the write fails, and the
   * student is told. It used to swallow the failure — the log line read
   * "using local backup seamlessly" — and leave the icon filled in. So a
   * bookmark could look saved while existing only in this browser's
   * localStorage: gone on another device, and absent from the dashboard's
   * saved list, which reads from Firestore. "Saved" is a promise to the
   * person who clicked it; showing it for a write that failed breaks it.
   *
   * Demo mode keeps the localStorage path, because there is no Firestore
   * behind it by design.
   */
  const handleSave = async (oppId: string) => {
    if (!user) return;
    const wasSaved = savedIds.includes(oppId);

    // Optimistic: the tap should feel instant.
    setSavedIds(prev => (wasSaved ? prev.filter(id => id !== oppId) : [...prev, oppId]));

    if (isDemoMode) {
      const localSaves = JSON.parse(localStorage.getItem('demo_saved_ids') || '[]');
      const updated = wasSaved
        ? localSaves.filter((id: string) => id !== oppId)
        : [...new Set([...localSaves, oppId])];
      localStorage.setItem('demo_saved_ids', JSON.stringify(updated));
      return;
    }

    try {
      if (wasSaved) {
        const q = query(
          collection(db, 'savedOpportunities'),
          where('studentId', '==', user.uid),
          where('opportunityId', '==', oppId)
        );
        const snap = await getDocs(q);
        await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      } else {
        await addDoc(collection(db, 'savedOpportunities'), {
          studentId: user.uid,
          opportunityId: oppId,
          savedAt: serverTimestamp()
        });
      }
    } catch (err) {
      console.error('Saving the opportunity failed:', err);
      // Put the icon back where it was, so it never claims a state the
      // database does not hold.
      setSavedIds(prev => (wasSaved ? [...prev, oppId] : prev.filter(id => id !== oppId)));
      setSaveError(
        wasSaved
          ? "We couldn't remove that bookmark. Please try again."
          : "We couldn't save that opportunity. Please check your connection and try again."
      );
    }
  };

  const filteredOpps = opportunities.filter(opp => {
    const matchesSearch = opp.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          opp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          opp.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          opp.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (opp.skillsNeeded && opp.skillsNeeded.some(skill => skill.toLowerCase().includes(searchTerm.toLowerCase())));
    const matchesCategory = category === '' || opp.category === category;
    const matchesExclusive = exclusive === '' || opp.exclusives?.includes(exclusive);
    // Exact match. This was `.includes()`, which only worked because the two
    // sides stored different strings — the org form saved
    // 'Short-term (1-3 months)' while this filter looked for 'Short-term'. Both
    // now come from the same list, so a substring match is no longer papering
    // over anything and an exact comparison is what it should always have been.
    const matchesCommitment = commitment === '' || opp.timeCommitment === commitment;
    const matchesVirtual = !virtualOnly || opp.isVirtual;
    return matchesSearch && matchesCategory && matchesExclusive && matchesCommitment && matchesVirtual;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {saveError && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-rose-600 text-white px-6 py-3 rounded-lg font-semibold text-xs tracking-wide max-w-[90vw]"
        >
          {saveError}
        </div>
      )}

      {/* Local Community Involvement Banner card */}
      <div className="relative overflow-hidden rounded-lg bg-blue-dark/5 text-ink border border-blue-dark/10 p-6 sm:p-10">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-dark/15 rounded-lg blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-10 w-60 h-60 bg-[#FF6B35]/10 rounded-lg blur-3xl pointer-events-none" />
        <div className="relative max-w-2xl space-y-4">
          {/* amber-900, not amber-dark. amber-dark (#A85E22) clears 4.5:1 on white,
              but this chip sits on bg-amber/10, which composites to #EEDACD and
              drops the pair to 3.62:1. A token that is accessible on paper is not
              automatically accessible on a tint of itself. */}
          <div className="inline-flex items-center gap-2 bg-amber/10 border border-amber/20 px-3 py-1 rounded-lg text-amber-900 text-xs font-semibold tracking-wide leading-none">
            <MapPin className="w-3 h-3 text-amber-dark fill-orange-500/10 animate-pulse" />
            North York, Toronto
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-ink tracking-tight leading-none">
            Find Opportunities
          </h1>
          {/* ink-soft, not ink-muted: this paragraph sits on bg-blue-dark/5, which
              composites to #EEF0F0 and leaves ink-muted at 4.28:1. */}
          <p className="text-ink-soft text-sm sm:text-base leading-relaxed font-semibold">
            Discover ways to share your skills, earn high-school community hours, and connect with volunteer coordinators, student organizers, and mutual aid spaces across Greater Toronto.
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-ink tracking-tight">Opportunities</h2>
          <p className="text-ink-muted text-xs font-semibold">Discover high school-approved community involvement opportunities.</p>
        </div>
        
        <div className="bg-white p-1.5 rounded-lg border border-line flex w-fit">
          <button 
            onClick={() => setView('list')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all",
              view === 'list' ? "bg-blue-dark text-white  shadow-blue-200" : "text-ink-muted hover:text-ink"
            )}
          >
            <List className="w-4 h-4" /> List
          </button>
          <button 
            onClick={() => setView('map')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all",
              view === 'map' ? "bg-blue-dark text-white  shadow-blue-200" : "text-ink-muted hover:text-ink"
            )}
          >
            <MapIcon className="w-4 h-4" /> Map
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="p-6 md:p-8 rounded-lg border border-line border-line/40 bg-white/60 backdrop-blur-md ">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="relative">
             <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
             {/* These four filters had no visible label and no accessible
                 name, so a screen reader announced four unlabelled controls.
                 The design keeps them label-free, so the name goes on aria-label. */}
             <Input 
                aria-label="Search opportunities by keyword"
                placeholder="Search keywords..." 
                className="pl-10.5 rounded-lg border-line/80 bg-white" 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
             />
          </div>
          <Select 
            aria-label="Filter by category"
            options={categoriesOptions} 
            value={category} 
            onChange={(e) => setCategory(e.target.value)} 
          />
          <Select 
            aria-label="Filter by exclusivity"
            options={exclusivesOptions} 
            value={exclusive} 
            onChange={(e) => setExclusive(e.target.value)} 
          />
          <Select 
            aria-label="Filter by time commitment"
            options={COMMITMENTS} 
            value={commitment} 
            onChange={(e) => setCommitment(e.target.value)} 
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={clearAllFilters} className="w-full gap-2">
               <X className="w-4 h-4" /> Clear filters
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 mt-6 pt-6 border-t border-line-light">
           <label className="flex items-center gap-3 cursor-pointer group">
              <input 
                 type="checkbox" 
                 checked={virtualOnly} 
                 onChange={(e) => setVirtualOnly(e.target.checked)}
                 className="w-5 h-5 rounded-lg text-blue-dark focus:ring-blue-dark border-line"
              />
              <span className="text-sm font-bold text-ink-muted group-hover:text-ink">Virtual / Remote Only</span>
           </label>
        </div>
      </Card>

      {/* Main View */}
      {isLoading ? (
        // A card grid in outline, rather than a spinner in the middle of nothing.
        // The finished layout is a three-column grid of cards, and showing that
        // shape while it loads is what makes the wait feel short.
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-busy="true" aria-live="polite">
           <span className="sr-only">Finding opportunities</span>
           {[0, 1, 2, 3, 4, 5].map((i) => (
             <div key={i} className="rounded-lg border border-line bg-white p-6 space-y-4">
                <div className="h-4 w-20 rounded bg-line animate-shimmer" />
                <div className="h-6 w-3/4 rounded bg-line animate-shimmer" />
                <div className="h-3 w-full rounded bg-line animate-shimmer" />
                <div className="h-3 w-5/6 rounded bg-line animate-shimmer" />
                <div className="h-10 w-full rounded-lg bg-paper-2 animate-shimmer" />
             </div>
           ))}
        </div>
      ) : view === 'list' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredOpps.length > 0 ? (
            filteredOpps.map(opp => (
              <OpportunityCard 
                key={opp.id} 
                opportunity={opp} 
                isSaved={savedIds.includes(opp.id)}
                onSave={handleSave}
                onShare={(o) => setSharingOpp(o)}
                studentInterests={studentProfile?.interests || []}
              />
            ))
          ) : loadError ? (
            // A failed read must not look like an empty catalogue.
            <div role="alert" className="col-span-full py-24 text-center bg-white rounded-lg border border-dashed border-red-200 space-y-4">
               <div className="text-5xl">⚠️</div>
               <p className="text-xl font-bold text-ink tracking-tight leading-none">We couldn't load the opportunities.</p>
               <p className="text-ink-muted max-w-md mx-auto leading-relaxed">{loadError}</p>
               <button
                 onClick={() => window.location.reload()}
                 className="mt-2 h-11 px-6 rounded-lg bg-blue-dark text-white font-semibold text-sm"
               >
                 Try again
               </button>
            </div>
          ) : (
            <div className="col-span-full py-24 text-center bg-white rounded-lg border border-dashed text-ink-muted font-medium space-y-4 ">
               <div className="text-5xl">🔭</div>
               {/* "No opportunities yet" is a lie when 200 loaded and the
                   student's own filters excluded all of them — and the only way
                   out was a Clear button far above, which they have to connect
                   to the problem themselves. Say which it is, and put the escape
                   hatch here. */}
               {hasActiveFilters ? (
                 <>
                   <p className="text-xl font-bold text-ink tracking-tight leading-none">No opportunities match these filters.</p>
                   <p className="text-ink-muted">{opportunities.length} are available in total.</p>
                   <button
                     onClick={clearAllFilters}
                     className="mt-1 h-11 px-6 rounded-lg bg-blue-dark text-white font-semibold text-sm"
                   >
                     Clear all filters
                   </button>
                 </>
               ) : (
                 <>
                   <p className="text-xl font-bold text-ink tracking-tight leading-none">No volunteer opportunities yet.</p>
                   <p className="text-ink-muted">New postings appear here as organizations add them — check back soon.</p>
                 </>
               )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="h-[300px] sm:h-[450px] md:h-[600px] rounded-lg overflow-hidden relative border-none ">
             <Suspense
                fallback={
                  <div className="h-full w-full grid place-items-center bg-paper-2 text-sm text-ink-muted">
                    Loading map…
                  </div>
                }
             >
                <OpportunitiesMap
                   opportunities={filteredOpps}
                   userCoords={userCoords}
                   hasLiveGps={!!coords}
                   onOpen={(id: string) => navigate(`/student/opportunities/${id}`)}
                />
             </Suspense>
          </Card>


        </div>
      )}

      {sharingOpp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSharingOpp(null)} />
           {/* Wrapper carries the ref and dialog role — Card neither forwards a
               ref nor accepts ARIA props. */}
           <div
             ref={shareDialogRef}
             role="dialog"
             aria-modal="true"
             aria-label="Share this opportunity"
             className="relative w-full max-w-md"
           >
           <Card className="relative w-full bg-white rounded-lg animate-in fade-in zoom-in duration-300 border-none overflow-hidden">
              <button aria-label="Close dialog" 
                onClick={() => setSharingOpp(null)}
                className="absolute top-6 right-6 p-2 rounded-lg hover:bg-slate-100 transition-colors text-ink-muted z-10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="p-6 sm:p-10 space-y-6">
                 <div className="w-16 h-16 bg-blue-dark/5 rounded-lg flex items-center justify-center mx-auto text-blue-dark mb-2">
                    <Share2 className="w-8 h-8" />
                 </div>
                 <div className="text-center">
                    <h3 className="text-xl font-bold text-ink uppercase tracking-tight">Share Opportunity</h3>
                    <p className="text-sm text-ink-muted mt-2">Help others find <strong>{sharingOpp.title}</strong></p>
                 </div>

                 <div className="space-y-3">
                    <Button className="w-full h-12 bg-[#1877F2] hover:bg-[#166fe5]" onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.origin + '/student/opportunities/' + sharingOpp.id)}`, '_blank', 'noopener,noreferrer')}>Share on Facebook</Button>
                    <Button className="w-full h-12 bg-[#1DA1F2] hover:bg-[#1a91da]" onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent('Check out this volunteer opportunity: ' + sharingOpp.title)}&url=${encodeURIComponent(window.location.origin + '/student/opportunities/' + sharingOpp.id)}`, '_blank', 'noopener,noreferrer')}>Share on Twitter</Button>
                    <Button variant="outline" className="w-full h-12 border-line" onClick={async () => { const ok = await copyToClipboard(`${window.location.origin}/student/opportunities/${sharingOpp.id}`); if (ok) alert('Link copied to clipboard!'); }}>Copy Link</Button>
                 </div>
              </div>
           </Card>
           </div>
        </div>
      )}
    </div>
  );
}
