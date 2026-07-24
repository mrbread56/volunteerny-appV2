import { useState, useEffect, useRef, useMemo } from 'react';
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
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { OPPORTUNITY_CATEGORIES, OPPORTUNITY_EXCLUSIVES } from '../constants';
import { cn, copyToClipboard } from '../lib/utils';
import { useGeolocation } from '../hooks/useGeolocation';

// Fix for Leaflet marker icons in React - custom, beautiful vector SVG pin
const DefaultIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center">
      <div class="absolute w-6 h-6 bg-[#1F4C63]/15 rounded-sm blur-sm"></div>
      <div class="w-8 h-8    border-2 border-white rounded-sm  flex items-center justify-center transition-all duration-300 transform hover:scale-110">
        <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 21C12 21 4 14 4 9C4 5.96 6.46 3.5 9.5 3.5C11.18 3.5 12.69 4.25 13.7 5.43" />
          <path d="M12 21C12 21 20 14 20 9C20 5.96 17.54 3.5 14.5 3.5C12.82 3.5 11.31 4.25 10.3 5.43" />
        </svg>
      </div>
    </div>
  `,
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 28],
});
L.Marker.prototype.options.icon = DefaultIcon;

const userLocationIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center">
      <div class="absolute w-8 h-8 bg-[#E08A3C]/40 rounded-sm animate-ping"></div>
      <div class="w-7 h-7 bg-[#E08A3C] border-2 border-white rounded-sm  flex items-center justify-center">
        <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="12" cy="12" r="8" fill="white" fill-opacity="0.2" />
          <circle cx="12" cy="12" r="4" fill="white" />
        </svg>
      </div>
    </div>
  `,
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

function MapViewManager({ coords }: { coords: { lat: number; lng: number } | null }) {
  const map = useMap();
  
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    if (coords) {
      map.setView([coords.lat, coords.lng], 14);
    }
  }, [coords, map]);
  return null;
}

const COMMITMENTS = [
  { value: '', label: 'Any Commitment' },
  { value: 'One-time', label: 'One-time' },
  { value: 'Short-term', label: 'Short-term (1-3 months)' },
  { value: 'Long-term', label: 'Long-term (6+ months)' },
];

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
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('');
  const [exclusive, setExclusive] = useState('');
  const [commitment, setCommitment] = useState('');
  const [virtualOnly, setVirtualOnly] = useState(false);
  const [sharingOpp, setSharingOpp] = useState<Opportunity | null>(null);

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
        const oppsQuery = query(collection(db, 'opportunities'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(oppsQuery);
        setOpportunities(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Opportunity)));

        // Fetch saved status with local storage fallback mirror
        if (user) {
          const localSaves = JSON.parse(localStorage.getItem('demo_saved_ids') || '[]');
          try {
            const savedQuery = query(collection(db, 'savedOpportunities'), where('studentId', '==', user.uid));
            const savedSnap = await getDocs(savedQuery);
            const remoteIds = savedSnap.docs.map(doc => (doc.data() as SavedOpportunity).opportunityId);
            const merged = Array.from(new Set([...remoteIds, ...localSaves]));
            setSavedIds(merged);
          } catch (dbErr) {
            console.warn('Real Firestore saved opportunities fetch failed, using local storage cache:', dbErr);
            setSavedIds(localSaves);
          }
        }
      } catch (err) {
        console.error('Error fetching opportunities:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOpps();
  }, [user]);

  const handleSave = async (oppId: string) => {
    if (!user) return;
    try {
      const localSaves = JSON.parse(localStorage.getItem('demo_saved_ids') || '[]');
      if (savedIds.includes(oppId)) {
        // Unsave
        setSavedIds(prev => prev.filter(id => id !== oppId));
        const updated = localSaves.filter((id: string) => id !== oppId);
        localStorage.setItem('demo_saved_ids', JSON.stringify(updated));

        try {
          const q = query(collection(db, 'savedOpportunities'), where('studentId', '==', user.uid), where('opportunityId', '==', oppId));
          const snap = await getDocs(q);
          await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
        } catch (dbErr) {
          console.warn('Real Firestore unsave failed, local cache preserved:', dbErr);
        }
      } else {
        // Save
        setSavedIds(prev => [...prev, oppId]);
        if (!localSaves.includes(oppId)) {
          localSaves.push(oppId);
          localStorage.setItem('demo_saved_ids', JSON.stringify(localSaves));
        }

        try {
          await addDoc(collection(db, 'savedOpportunities'), {
            studentId: user.uid,
            opportunityId: oppId,
            savedAt: serverTimestamp()
          });
        } catch (dbErr) {
          console.warn('Real Firestore save failed, using local backup seamlessly:', dbErr);
        }
      }
    } catch (err) {
      console.error('Error saving opportunity:', err);
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
    const matchesCommitment = commitment === '' || opp.timeCommitment.includes(commitment);
    const matchesVirtual = !virtualOnly || opp.isVirtual;
    return matchesSearch && matchesCategory && matchesExclusive && matchesCommitment && matchesVirtual;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Local Community Involvement Banner card */}
      <div className="relative overflow-hidden rounded-sm   /10 text-slate-900 border border-[#1F4C63]/10/70  p-6 sm:p-10">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#1F4C63]/15 rounded-sm blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-10 w-60 h-60 bg-[#FF6B35]/10 rounded-sm blur-3xl pointer-events-none" />
        <div className="relative max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 bg-[#E08A3C]/10 border border-[#E08A3C]/20/50 px-3 py-1 rounded-sm text-[#E08A3C] text-[10px] font-black uppercase tracking-widest leading-none">
            <MapPin className="w-3 h-3 text-[#E08A3C] fill-orange-500/10 animate-pulse" />
            North York, Toronto Sector
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight leading-none">
            Find Opportunities
          </h1>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed font-semibold">
            Discover ways to share your skills, earn high-school community hours, and connect with volunteer coordinators, student organizers, and mutual aid spaces across Greater Toronto.
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Active Programs Hub</h2>
          <p className="text-slate-600 text-xs font-semibold">Discover high school-approved community involvement opportunities in real-time.</p>
        </div>
        
        <div className="bg-white p-1.5 rounded-sm border border-slate-200 flex  w-fit">
          <button 
            onClick={() => setView('list')}
            className={cn(
              "px-4 py-2 rounded-sm text-sm font-bold flex items-center gap-2 transition-all",
              view === 'list' ? "bg-[#1F4C63] text-white  shadow-blue-200" : "text-slate-600 hover:text-slate-900"
            )}
          >
            <List className="w-4 h-4" /> List
          </button>
          <button 
            onClick={() => setView('map')}
            className={cn(
              "px-4 py-2 rounded-sm text-sm font-bold flex items-center gap-2 transition-all",
              view === 'map' ? "bg-[#1F4C63] text-white  shadow-blue-200" : "text-slate-600 hover:text-slate-900"
            )}
          >
            <MapIcon className="w-4 h-4" /> Map
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="p-6 md:p-8 rounded-sm border border-slate-200 border-slate-200/40 bg-white/60 backdrop-blur-md ">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="relative">
             <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
             <Input 
                placeholder="Search keywords..." 
                className="pl-10.5 rounded-sm border-slate-200/80 bg-white" 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
             />
          </div>
          <Select 
            options={categoriesOptions} 
            value={category} 
            onChange={(e) => setCategory(e.target.value)} 
          />
          <Select 
            options={exclusivesOptions} 
            value={exclusive} 
            onChange={(e) => setExclusive(e.target.value)} 
          />
          <Select 
            options={COMMITMENTS} 
            value={commitment} 
            onChange={(e) => setCommitment(e.target.value)} 
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => { setSearchTerm(''); setCategory(''); setExclusive(''); setCommitment(''); setVirtualOnly(false); }} className="w-full gap-2">
               <X className="w-4 h-4" /> Clear filters
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 mt-6 pt-6 border-t border-slate-100">
           <label className="flex items-center gap-3 cursor-pointer group">
              <input 
                 type="checkbox" 
                 checked={virtualOnly} 
                 onChange={(e) => setVirtualOnly(e.target.checked)}
                 className="w-5 h-5 rounded-sm text-[#1F4C63] focus:ring-[#1F4C63] border-slate-200"
              />
              <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900">Virtual / Remote Only</span>
           </label>
        </div>
      </Card>

      {/* Main View */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
           <div className="animate-spin rounded-sm h-12 w-12 border-4 border-[#1F4C63] border-t-transparent" />
           <p className="text-slate-600 font-medium">Finding the best matches for you...</p>
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
          ) : (
            <div className="col-span-full py-24 text-center bg-white rounded-sm border border-dashed text-slate-600 font-medium space-y-4 ">
               <div className="text-5xl">🔭</div>
               <p className="text-xl font-bold text-slate-900 tracking-tight leading-none">No volunteer opportunities yet.</p>
               <p className="text-slate-600">Try adjusting your filters or check back soon!</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="h-[300px] sm:h-[450px] md:h-[600px] rounded-sm overflow-hidden relative border-none ">
             <MapContainer 
                center={userCoords ? [userCoords.lat, userCoords.lng] : [43.7615, -79.4111]} 
                zoom={14} 
                style={{ height: '100%', width: '100%' }}
             >
                <MapViewManager coords={userCoords} />
                
                
                {userCoords && (
                   <Marker 
                      position={[userCoords.lat, userCoords.lng]} 
                      icon={userLocationIcon}
                      
                      
                      
                   >
                      <Popup className="rounded-sm overflow-hidden">
                         <div className="p-2 text-center text-xs space-y-1">
                            <div className="font-bold text-slate-900 font-sans">Your Location</div>
                            <div className="text-[10px] text-[#E08A3C] font-mono font-bold uppercase tracking-wider">{coords ? "Live GPS Tracker" : "Neighborhood Location"}</div>
                            <div className="text-[10px] text-slate-600 font-mono">Lat: {userCoords.lat.toFixed(4)}, Lng: {userCoords.lng.toFixed(4)}</div>
                         </div>
                      </Popup>
                   </Marker>
                )}
                <TileLayer 
                   url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                   attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> Contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    
                   maxZoom={20}
                />
                {filteredOpps.filter(o => o.coordinates).map(opp => (
                  <Marker key={opp.id} position={[opp.coordinates!.lat, opp.coordinates!.lng]} icon={DefaultIcon}>
                     <Popup className="custom-popup">
                        <div className="p-2 space-y-2">
                           <h4 className="font-bold text-slate-900 leading-tight">{opp.title}</h4>
                           <Badge variant="secondary" className="text-[10px]">{opp.category}</Badge>
                           <div className="text-xs text-slate-500 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-600" /> {opp.location}
                           </div>
                           <Button size="sm" className="w-full mt-2" onClick={() => navigate(`/student/opportunities/${opp.id}`)}>
                              View Details
                           </Button>
                        </div>
                     </Popup>
                  </Marker>
                ))}
             </MapContainer>
          </Card>


        </div>
      )}

      {sharingOpp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSharingOpp(null)} />
           <Card className="relative w-full max-w-md bg-white rounded-sm  animate-in fade-in zoom-in duration-300 border-none overflow-hidden">
              <button aria-label="Close dialog" 
                onClick={() => setSharingOpp(null)}
                className="absolute top-6 right-6 p-2 rounded-sm hover:bg-slate-100 transition-colors text-slate-600 z-10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="p-6 sm:p-10 space-y-6">
                 <div className="w-16 h-16 bg-[#1F4C63]/5 rounded-sm flex items-center justify-center mx-auto text-[#1F4C63] mb-2">
                    <Share2 className="w-8 h-8" />
                 </div>
                 <div className="text-center">
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Share Opportunity</h3>
                    <p className="text-sm text-slate-600 mt-2">Help others find <strong>{sharingOpp.title}</strong></p>
                 </div>

                 <div className="space-y-3">
                    <Button className="w-full h-12 bg-[#1877F2] hover:bg-[#166fe5]" onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.origin + '/student/opportunities/' + sharingOpp.id)}`, '_blank', 'noopener,noreferrer')}>Share on Facebook</Button>
                    <Button className="w-full h-12 bg-[#1DA1F2] hover:bg-[#1a91da]" onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent('Check out this volunteer opportunity: ' + sharingOpp.title)}&url=${encodeURIComponent(window.location.origin + '/student/opportunities/' + sharingOpp.id)}`, '_blank', 'noopener,noreferrer')}>Share on Twitter</Button>
                    <Button variant="outline" className="w-full h-12 border-slate-200" onClick={async () => { const ok = await copyToClipboard(`${window.location.origin}/student/opportunities/${sharingOpp.id}`); if (ok) alert('Link copied to clipboard!'); }}>Copy Link</Button>
                 </div>
              </div>
           </Card>
        </div>
      )}
    </div>
  );
}
