import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import SuccessAnimation from '../components/SuccessAnimation';
import { db } from '../firebase/config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { ArrowLeft, Globe, Plus, Trash2, Info } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { cn } from '../lib/utils';
import { useGeolocation } from '../hooks/useGeolocation';

import { Badge } from '../components/ui/Badge';
import { OPPORTUNITY_CATEGORIES, OPPORTUNITY_EXCLUSIVES } from '../constants';
import { resolveOpportunityDate } from '../lib/opportunityDate';
import { SKILLS, COMMITMENTS } from '../lib/vocabularies';

const userLocationIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center">
      <div class="absolute w-8 h-8 bg-amber/40 rounded-lg animate-ping"></div>
      <div class="w-7 h-7 bg-amber border-2 border-white rounded-lg flex items-center justify-center">
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

const customPinIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center">
      <div class="absolute w-8 h-8 bg-blue-dark/30 rounded-lg animate-ping"></div>
      <div class="w-7 h-7 bg-blue-dark border-2 border-white rounded-lg flex items-center justify-center">
        <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 21s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 7.2c0 7.3-8 11.8-8 11.8z" />
          <circle cx="12" cy="9" r="2.5" fill="white" />
        </svg>
      </div>
    </div>
  `,
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 28],
});



const SCHEDULE_TYPES = [
  { value: 'single', label: 'Single Event' },
  { value: 'multiple', label: 'Multiple Occurrences' },
  { value: 'recurring', label: 'Weekly Recurring' },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/*
 * At MODULE scope, not inside the component.
 *
 * Declared in the component body these were a NEW function object on every
 * parent render, so React saw a different element.type and unmounted and
 * remounted them instead of updating -- which makes the [center, map]
 * dependency array irrelevant, because the effect runs in a fresh component
 * every time. react-leaflet's MapContainer does not memoise its children, so
 * every parent render reached them.
 *
 * The visible result: an organisation drags the map to place the pin exactly,
 * types one character in Title, and the viewport snaps back to `coords`. It
 * also snapped back a second later when the draft autosave set its timestamp,
 * and twice more on every address edit via the geocoding flag. The Marker was
 * a destroyed-and-recreated Leaflet layer each time, so the pin flickered too.
 */
function MapController({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap();
  React.useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom());
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, [center, map]);
  return null;
}

function LocationMarker({
  coords,
  setCoords,
}: {
  coords: { lat: number; lng: number };
  setCoords: (c: { lat: number; lng: number }) => void;
}) {
  useMapEvents({
    click(e) {
      setCoords(e.latlng);
    },
  });
  /*
   * draggable, because both geocode-failure messages tell the coordinator to
   * drag it and react-leaflet markers are static without this prop. The message
   * fires exactly when the address could not be found, so the pin is sitting at
   * the North York default -- and those coordinates drive the student distance
   * filter and the map a minor navigates to. An instruction that does nothing on
   * that path is worse than no instruction.
   */
  return (
    <Marker
      position={coords}
      icon={customPinIcon}
      draggable
      eventHandlers={{
        dragend: (e: any) => {
          const { lat, lng } = e.target.getLatLng();
          setCoords({ lat, lng });
        },
      }}
    />
  );
}

export default function OrgOpportunityCreate() {
  const { user, isDemoMode, orgProfile, profilesLoaded } = useAuth();
  const navigate = useNavigate();
  const { coords: userCoords } = useGeolocation();
  const [isLoading, setIsLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSuccessAnim, setShowSuccessAnim] = useState(false);

  // Form Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState(orgProfile?.address || '');
  const [dateTime, setDateTime] = useState('');
  const [category, setCategory] = useState(OPPORTUNITY_CATEGORIES[0]);
  const [requirements, setRequirements] = useState('');
  const [maxVolunteers, setMaxVolunteers] = useState('5');
  const [minAge, setMinAge] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedExclusives, setSelectedExclusives] = useState<string[]>([]);
  const [timeCommitment, setTimeCommitment] = useState(COMMITMENTS[0].value);
  const [isVirtual, setIsVirtual] = useState(false);
  const [coords, setCoords] = useState({ lat: 43.7615, lng: -79.4111 }); // North York center
  const [isGeocoding, setIsGeocoding] = useState(false);
  // Set when the address lookup finds nothing or fails, so the map pin is not
  // silently left at the North York default. See the geocode effect.
  const [geocodeNotice, setGeocodeNotice] = useState<string | null>(null);

  // Advanced Timeline
  const [scheduleType, setScheduleType] = useState<'single' | 'recurring' | 'multiple'>('single');
  const [shifts, setShifts] = useState<Array<{ date?: string; day?: string; startTime: string; endTime: string }>>([
    { startTime: '09:00', endTime: '12:00' }
  ]);

  const [draftSavedTime, setDraftSavedTime] = useState<string | null>(null);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const isLoadedRef = React.useRef(false);

  // Load draft on mount
  React.useEffect(() => {
    const savedDraft = localStorage.getItem('opportunity_draft');
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        if (parsed.title) setTitle(parsed.title);
        if (parsed.description) setDescription(parsed.description);
        if (parsed.location) setLocation(parsed.location);
        if (parsed.dateTime) setDateTime(parsed.dateTime);
        if (parsed.category) setCategory(parsed.category);
        if (parsed.requirements) setRequirements(parsed.requirements);
        if (parsed.maxVolunteers) setMaxVolunteers(parsed.maxVolunteers);
        if (parsed.minAge) setMinAge(parsed.minAge);
        if (parsed.selectedSkills) setSelectedSkills(parsed.selectedSkills);
        if (parsed.selectedExclusives) setSelectedExclusives(parsed.selectedExclusives);
        if (parsed.timeCommitment) setTimeCommitment(parsed.timeCommitment);
        if (parsed.isVirtual !== undefined) setIsVirtual(parsed.isVirtual);
        if (parsed.coords) setCoords(parsed.coords);
        if (parsed.scheduleType) setScheduleType(parsed.scheduleType);
        if (parsed.shifts) setShifts(parsed.shifts);
        if (parsed.savedAt) {
          setDraftSavedTime(new Date(parsed.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
        setIsDraftLoaded(true);
      } catch (err) {
        console.error('Failed to load draft:', err);
      }
    }
    isLoadedRef.current = true;
  }, []);

  // Save changes to draft
  React.useEffect(() => {
    if (!isLoadedRef.current) return;

    if (!title && !description && !location && selectedSkills.length === 0) {
      localStorage.removeItem('opportunity_draft');
      setDraftSavedTime(null);
      return;
    }

    const draftData = {
      title,
      description,
      location,
      dateTime,
      category,
      requirements,
      maxVolunteers,
      // minAge was in neither the save nor the load, so it silently vanished on
      // every reload while the banner said the draft was saved.
      minAge,
      selectedSkills,
      selectedExclusives,
      timeCommitment,
      isVirtual,
      coords,
      scheduleType,
      shifts,
      savedAt: new Date().toISOString()
    };

    const timer = setTimeout(() => {
      localStorage.setItem('opportunity_draft', JSON.stringify(draftData));
      setDraftSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 1000);

    return () => clearTimeout(timer);
  }, [title, description, location, dateTime, category, requirements, maxVolunteers, selectedSkills, selectedExclusives, timeCommitment, isVirtual, coords, scheduleType, shifts]);

  const handleDeleteDraft = () => {
    localStorage.removeItem('opportunity_draft');
    setTitle('');
    setDescription('');
    setLocation(orgProfile?.address || '');
    setDateTime('');
    setCategory(OPPORTUNITY_CATEGORIES[0]);
    setRequirements('');
    setMaxVolunteers('5');
    setMinAge('');
    setSelectedSkills([]);
    setSelectedExclusives([]);
    setTimeCommitment(COMMITMENTS[0].value);
    setIsVirtual(false);
    setCoords({ lat: 43.7615, lng: -79.4111 });
    setScheduleType('single');
    setShifts([{ startTime: '09:00', endTime: '12:00' }]);
    setDraftSavedTime(null);
    setIsDraftLoaded(false);
  };

  // Auto-geocode location
  React.useEffect(() => {
    // The debounce was cleared on cleanup but the request it had already
    // started was not, so an in-flight lookup outlived the address it was for.
    // Two consequences: a slow response for an older address could land after a
    // newer one and silently overwrite the coordinates actually saved with the
    // opportunity, and leaving the page logged the aborted fetch as
    // "Geocoding error: TypeError: Failed to fetch" (found by npm run
    // sweep:console) on whatever route the user had moved to.
    const controller = new AbortController();

    const geocode = async () => {
      if (!location || location.length < 5 || isVirtual) return;

      setIsGeocoding(true);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&viewbox=-79.638,43.855,-79.116,43.581&bounded=0`,
          { signal: controller.signal }
        );
        const data = await response.json();

        /*
         * Zero results is a RESULT, and it used to do nothing at all.
         *
         * With no `else`, coords kept whatever it already held: the generic
         * North York centre on a fresh form, or the coordinates of a previous
         * address the coordinator typed and then corrected. The posting was
         * then created showing a confident pin on the map, and that value drives
         * both the map marker students see and the distance filter that decides
         * which students are shown the posting at all. Nobody found out until a
         * student travelled to the wrong place.
         *
         * The pin is draggable, so the honest move is to say we could not find
         * it and ask them to place it.
         */
        if (data && data.length > 0) {
          const { lat, lon } = data[0];
          setCoords({ lat: parseFloat(lat), lng: parseFloat(lon) });
          setGeocodeNotice(null);
        } else {
          setGeocodeNotice(
            'We could not find that address on the map. Drag the pin below, or click the map, to put it in the right place before you save.',
          );
        }
      } catch (error) {
        // We cancelled it ourselves; not a failure worth reporting.
        if ((error as Error)?.name === 'AbortError') return;
        console.error('Geocoding error:', error);
        setGeocodeNotice(
          'We could not look that address up just now. Check the pin below is in the right place, and drag it if it is not, before you save.',
        );
      } finally {
        if (!controller.signal.aborted) setIsGeocoding(false);
      }
    };

    const timeoutId = setTimeout(geocode, 1000); // 1s debounce
    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [location, isVirtual]);

  const toggleSkill = (skill: string) => {
    setSelectedSkills(prev => prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]);
  };

  const toggleExclusive = (exc: string) => {
    setSelectedExclusives(prev => prev.includes(exc) ? prev.filter(e => e !== exc) : [...prev, exc]);
  };

  const addShift = () => {
    setShifts([...shifts, { startTime: '09:00', endTime: '12:00' }]);
  };

  const removeShift = (index: number) => {
    setShifts(shifts.filter((_, i) => i !== index));
  };

  const updateShift = (index: number, updates: any) => {
    const newShifts = [...shifts];
    newShifts[index] = { ...newShifts[index], ...updates };
    setShifts(newShifts);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setIsLoading(true);
    setSaveError(null);

    // Validate past dates and times
    const now = new Date();
    if (scheduleType === 'single') {
      const selectedDate = new Date(dateTime);
      if (selectedDate < now) {
        setSaveError("The event date and time cannot be in the past.");
        setIsLoading(false);
        return;
      }
    } else {
      for (const shift of shifts) {
        if (scheduleType === 'multiple' && shift.date) {
          const shiftDate = new Date(`${shift.date}T${shift.startTime}`);
          if (shiftDate < now) {
            setSaveError("One or more shift dates are in the past.");
            setIsLoading(false);
            return;
          }
        }
        if (shift.startTime >= shift.endTime) {
          setSaveError("Shift end time must be after the start time.");
          setIsLoading(false);
          return;
        }
      }
    }

    const opportunityData = {
      orgId: user.uid,
      // The `|| ''` is load-bearing. orgProfile is null until AuthContext has
      // read organizations/{uid}, and PrivateRoute releases the page as soon as
      // users/{uid} lands — so posting quickly after arriving here sent
      // `orgName: undefined`, which the Firestore SDK rejects outright
      // ("Unsupported field value: undefined"). The whole addDoc failed, and the
      // organization was told to check its connection.
      orgName: orgProfile?.organizationName || '',
      title,
      description,
      location,
      // A real event date for every schedule type. This was serverTimestamp()
      // for anything but a single event, which stored the moment of posting and
      // showed it to students as the event date. See resolveOpportunityDate.
      dateTime: resolveOpportunityDate(scheduleType, dateTime, shifts),
      category,
      requirements,
      maxVolunteers: parseInt(maxVolunteers),
      // Omitted entirely when blank: the rules and eligibility.ts both treat an
      // absent minAge as "no minimum", and writing 0 would be a claim nobody made.
      ...(minAge.trim() !== '' && Number.isFinite(Number(minAge)) ? { minAge: parseInt(minAge, 10) } : {}),
      skillsNeeded: selectedSkills,
      exclusives: selectedExclusives,
      timeCommitment,
      isVirtual,
      createdAt: serverTimestamp(),
      coordinates: coords,
      scheduleType,
      shifts: shifts.map(s => ({
        ...s,
        date: s.date || null,
        day: s.day || null
      }))
    };

    if (isDemoMode) {
      localStorage.removeItem('opportunity_draft');
      setShowSuccessAnim(true);
      setTimeout(() => {
        setIsLoading(false);
        navigate('/org/dashboard');
      }, 3000);
      return;
    }

    try {
      // The ref was created and thrown away. Landing on the posting itself
      // beats landing on an overview whose only change is a counter ticking
      // 0 to 1, which is all the confirmation an organisation used to get that
      // their opportunity was live.
      const created = await addDoc(collection(db, 'opportunities'), opportunityData);
      localStorage.removeItem('opportunity_draft');
      setShowSuccessAnim(true);
      setTimeout(() => {
        navigate(`/org/opportunities/${created.id}/applicants`);
      }, 3000);
    } catch (err: any) {
      // handleFirestoreError threw from inside this catch, so setIsLoading(false)
      // below it never ran - the submit button stayed stuck on its loading state
      // forever with no error shown.
      console.error('Failed to create opportunity:', err);
      setSaveError("We couldn't publish this opportunity. Please check your connection and try again.");
      setIsLoading(false);
    }
  };

  // Posting is gated on a person having approved this organization.
  //
  // firestore.rules enforces it, so without this the form would submit and come
  // back permission-denied — a dead end with no explanation. Say so before they
  // spend ten minutes writing a posting, and tell them exactly what unblocks it.
  const verification = orgProfile?.craVerified
    ? 'verified'
    : (orgProfile?.verificationStatus || 'unverified');

  /*
   * profilesLoaded, not `orgProfile &&`.
   *
   * A null orgProfile means a failed or denied read, or a signup where users/
   * was written and organizations/ was not — and with the old condition the
   * gate was SKIPPED in exactly those cases. The full form rendered, and the
   * submit then died on isApprovedOrg() with a message about their connection.
   * AuthContext exposes profilesLoaded precisely so a null can be read as "no
   * document" rather than "still in flight".
   */
  if (!isDemoMode && profilesLoaded && verification !== 'verified') {
    const copy = {
      pending: {
        title: 'Your organization is being reviewed',
        body: 'We check every organization before its opportunities reach students. This usually takes a day or two — we will email you the moment it is done, and you can post straight away.',
        cta: null,
      },
      rejected: {
        title: 'This organization was not approved',
        body: 'We could not confirm this organization, so it cannot post opportunities. If you think that is a mistake, reply to the email we sent and we will take another look.',
        cta: null,
      },
      unverified: {
        title: 'Get verified before you post',
        body: 'Students volunteer in person, often as minors, so a person checks every organization before its opportunities are shown. Add your details on your profile and ask for review — it usually takes a day or two.',
        cta: { to: '/org/profile', label: 'Go to your profile' },
      },
    }[verification === 'pending' ? 'pending' : verification === 'rejected' ? 'rejected' : 'unverified'];

    return (
      <div className="max-w-2xl mx-auto py-16 px-4">
        <button
          onClick={() => navigate('/org/dashboard')}
          className="flex items-center gap-2 text-ink-muted hover:text-blue-dark font-medium mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
        <div className="rounded-lg border border-line bg-white p-8 space-y-4">
          <h1 className="text-2xl font-bold text-ink tracking-tight">{copy.title}</h1>
          <p className="text-ink-soft leading-relaxed">{copy.body}</p>
          {copy.cta && (
            <Link
              to={copy.cta.to}
              className="inline-flex items-center justify-center h-11 px-6 rounded-lg bg-blue-dark text-white font-semibold text-sm"
            >
              {copy.cta.label}
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <button 
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-ink-muted hover:text-blue-dark font-medium mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <Card className="border-none rounded-lg overflow-hidden shadow-card">
        <CardHeader className="bg-blue-dark text-white p-10 border-none">
          {/* The page had no <h1> at all — its title rendered as an <h3>, so the
              heading outline started three levels deep. */}
          <CardTitle as="h1" className="text-3xl text-white">Post New Opportunity</CardTitle>
          <p className="text-blue-100 mt-2">Fill out the details to attract the best student volunteers.</p>
        </CardHeader>
        <CardContent className="p-10">
          {/* Draft Auto-save Banner */}
          <div className="mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-lg bg-paper-2 border border-line-light/70 text-ink-muted text-xs ">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 bg-emerald-500 rounded-lg animate-pulse" />
              <span className="font-semibold text-ink-muted">
                {draftSavedTime 
                  ? `Changes auto-saved to local draft at ${draftSavedTime}` 
                  : "All work is automatically saved as a local draft."}
              </span>
            </div>
            {isDraftLoaded && (
              <button
                type="button"
                onClick={handleDeleteDraft}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-lg transition-all uppercase tracking-wider text-xs cursor-pointer rounded-full"
              >
                Delete Draft & Start Fresh
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-10">
            {/* Basic Info */}
            <section className="space-y-6">
               <h3 className="text-xl font-bold flex items-center gap-2 text-ink pb-3 border-b border-line">
                  Basic Information
               </h3>
               <Input label="Opportunity Title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g., Afternoon Tutoring at Community Center" />
               <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-ink-soft">Description <span className="text-red-600">*</span></label>
                  <textarea 
                    className="w-full rounded-lg border border-line p-6 text-sm focus:ring-2 focus:ring-blue-dark focus:outline-none min-h-[150px] font-medium"
                    aria-label="Description"
                    placeholder="Describe what volunteers will be doing..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                  />
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={OPPORTUNITY_CATEGORIES.map(cat => ({ value: cat, label: cat }))} required />
                  <Select label="Frequency" value={timeCommitment} onChange={(e) => setTimeCommitment(e.target.value)} options={COMMITMENTS} required />
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Input label="Number of Openings / Volunteers Needed" type="number" min="1" value={maxVolunteers} onChange={(e) => setMaxVolunteers(e.target.value)} required />
                  <Select label="Type of Schedule" value={scheduleType} onChange={(e) => setScheduleType(e.target.value as any)} options={SCHEDULE_TYPES} required />
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* minAge had every part except the input.
                      It is in the Opportunity type, validated in firestore.rules,
                      allow-listed on create and update, covered by the emulator
                      suite, and drives the student-facing "This one asks for
                      volunteers aged N+" warning in eligibility.ts — and neither
                      form rendered a control, so it was always absent and that
                      warning could never fire. The approval email meanwhile tells
                      organisations to say "how many you can take, and any minimum
                      age". Real Toronto floors run 14 to 19. */}
                  <Input
                    label="Minimum Age (optional)"
                    type="number"
                    min="0"
                    max="120"
                    placeholder="e.g. 16 — leave blank if there is no minimum"
                    value={minAge}
                    onChange={(e) => setMinAge(e.target.value)}
                  />
               </div>
            </section>

            {/* Advanced Timeline */}
            <section className="space-y-6">
               <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold flex items-center gap-2 text-ink pb-3 border-b border-line">
                     Advanced Timeline
                  </h3>
                  <Badge variant="secondary" className="bg-blue-dark/5 text-[#153343] border-none font-bold">
                     {shifts.length} Shift{shifts.length !== 1 ? 's' : ''}
                  </Badge>
               </div>
               
               <div className="bg-paper-2 p-6 rounded-lg border border-line-light space-y-6">
                  {scheduleType === 'single' && (
                     <div className="animate-in fade-in slide-in- duration-300">
                        <Input label="Event Date & Primary Time" type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} required />
                        <p className="text-xs text-ink-muted font-bold uppercase tracking-widest mt-3 flex items-center gap-2">
                           <Info className="w-3 h-3 text-blue-dark" /> This is a one-time event with a single start time.
                        </p>
                     </div>
                  )}

                  {(scheduleType === 'multiple' || scheduleType === 'recurring') && (
                     <div className="space-y-4 animate-in fade-in slide-in- duration-300">
                        {shifts.map((shift, index) => (
                           <div key={index} className="flex flex-col md:flex-row gap-4 p-6 bg-white rounded-lg border border-line-light items-end relative overflow-hidden group">
                              <div className="absolute top-0 left-0 w-1 h-full bg-blue-dark opacity-0 group-hover:opacity-100 transition-opacity" />
                              
                              {scheduleType === 'multiple' ? (
                                 <div className="flex-1 space-y-2">
                                    <label className="text-xs font-bold text-ink-muted uppercase tracking-widest leading-none">Shift Date</label>
                                    <Input
                                      aria-label="Shift Date" type="date" value={shift.date || ''} onChange={(e) => updateShift(index, { date: e.target.value })} required />
                                 </div>
                              ) : (
                                 <div className="flex-1 space-y-2 text-left">
                                    <label className="text-xs font-bold text-ink-muted uppercase tracking-widest leading-none">Weekly Day</label>
                                    <select
                                      aria-label="Weekly Day" 
                                       className="w-full h-10 px-3 rounded-lg border border-line text-sm focus:ring-2 focus:ring-blue-dark font-bold"
                                       value={shift.day || ''}
                                       onChange={(e) => updateShift(index, { day: e.target.value })}
                                       required
                                    >
                                       <option value="">Select Day</option>
                                       {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                 </div>
                              )}

                              <div className="flex-[0.5] space-y-2">
                                 <label className="text-xs font-bold text-ink-muted uppercase tracking-widest leading-none">Starts</label>
                                 <Input
                                   aria-label="Starts" type="time" value={shift.startTime} onChange={(e) => updateShift(index, { startTime: e.target.value })} required />
                              </div>

                              <div className="flex-[0.5] space-y-2">
                                 <label className="text-xs font-bold text-ink-muted uppercase tracking-widest leading-none">Ends</label>
                                 <Input
                                   aria-label="Ends" type="time" value={shift.endTime} onChange={(e) => updateShift(index, { endTime: e.target.value })} required />
                              </div>

                              <button 
                                 type="button" 
                                 onClick={() => removeShift(index)}
                                 className="p-3 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                                 disabled={shifts.length <= 1}
                              >
                                 <Trash2 className="w-4 h-4" />
                              </button>
                           </div>
                        ))}
                        <Button type="button" variant="outline" className="w-full h-14 border-dashed border-2 hover:border-blue-dark hover:text-blue-dark transition-all rounded-lg gap-2 font-semibold text-xs" onClick={addShift}>
                           <Plus className="w-4 h-4" /> Add Another Shift / Day
                        </Button>
                     </div>
                  )}
               </div>
            </section>

            {/* Location & Map */}
            <section className="space-y-6">
               <h3 className="text-xl font-bold flex items-center gap-2 text-ink pb-3 border-b border-line">
                  Location & Map Pin
               </h3>
                <div className="relative">
                  <Input 
                    label="Physical Address / Location" 
                    value={location} 
                    onChange={(e) => setLocation(e.target.value)} 
                    required 
                    placeholder="e.g., 5100 Yonge St, Toronto, ON" 
                  />
                  {isGeocoding && (
                    <div className="absolute right-4 top-[40px] flex items-center gap-2 text-xs font-bold text-blue-dark animate-pulse uppercase tracking-widest">
                       <div className="w-2 h-2 bg-blue-dark rounded-lg" /> Updating Map...
                    </div>
                  )}
               </div>
               <label className="flex items-center gap-3 p-6 rounded-lg bg-paper-2 border border-line cursor-pointer hover:border-blue-300 transition-all">
                  <input
                    type="checkbox"
                    className="w-6 h-6 rounded-lg text-blue-dark focus:ring-blue-dark"
                    checked={isVirtual}
                    onChange={(e) => setIsVirtual(e.target.checked)}
                  />
                  <div>
                    <p className="font-bold text-ink flex items-center gap-2 uppercase text-xs tracking-widest">
                       <Globe className="w-4 h-4 text-blue-dark" /> Virtual Opportunity
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5 font-medium">Volunteers can participate from anywhere via internet.</p>
                  </div>
               </label>
               
               <div className="space-y-2">
                  <p className="text-xs font-bold text-ink-muted uppercase tracking-widest ml-1">Place Map Pin (drag it, or click the map)</p>
                  {geocodeNotice && (
                    <p role="status" className="text-xs text-amber-800 bg-amber/10 border border-amber/40 rounded-lg p-2.5 leading-relaxed">
                      {geocodeNotice}
                    </p>
                  )}
                  <Card className="h-[300px] overflow-hidden rounded-lg border-none shadow-card">
                     <MapContainer center={[coords.lat, coords.lng]} zoom={12} style={{ height: '100%', width: '100%' }}>
                        {/* OSM, not CARTO. CARTO requires an API key now and
                            stamps "API KEY REQUIRED" across every tile without
                            one. The same fix was applied to AddressMapsSelector
                            and OpportunitiesMap; these two pages inline their
                            own TileLayer and were missed, so the coordinator's
                            map still showed the watermark. */}
                        <TileLayer
                            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            maxZoom={19}
                         />
                        <MapController center={coords} />
                        <LocationMarker coords={coords} setCoords={setCoords} />
                        {userCoords && (
                           <Marker position={[userCoords.latitude, userCoords.longitude]} icon={userLocationIcon}>
                              <Popup className="rounded-lg overflow-hidden">
                                 <div className="p-2 text-center text-xs space-y-1">
                                    <div className="font-bold text-ink">Your Location</div>
                                    <div className="text-xs text-amber-dark font-mono font-bold uppercase">Active Tracker</div>
                                    <div className="text-xs text-ink-muted font-mono">Lat: {userCoords.latitude.toFixed(4)}, Lng: {userCoords.longitude.toFixed(4)}</div>
                                 </div>
                              </Popup>
                           </Marker>
                        )}
                     </MapContainer>
                  </Card>
               </div>

            </section>

            {/* Requirements & Skills */}
            <section className="space-y-6">
               <h3 className="text-xl font-bold flex items-center gap-2 text-ink pb-3 border-b border-line">
                  Requirements & Skills
               </h3>
               <div className="flex flex-col gap-1.5">
                  {/* Optional, like Minimum Age beside it.
                      This was required, so a coordinator with no policy to hand
                      had to invent one or go and ask a manager before they could
                      post anything at all. Most postings genuinely have no
                      requirements, and "none" is a perfectly good answer. */}
                  <label className="text-sm font-medium text-ink-soft">
                    Requirements <span className="font-normal text-ink-muted">(optional)</span>
                  </label>
                  <textarea
                    className="w-full rounded-lg border border-line p-6 text-sm focus:ring-2 focus:ring-blue-dark focus:outline-none min-h-[100px] font-medium"
                    aria-label="Requirements"
                    placeholder="Anything a student must have or do first, like a police check or a language. Leave blank if there is nothing."
                    value={requirements}
                    onChange={(e) => setRequirements(e.target.value)}
                  />
               </div>
               <div>
                  <label className="text-sm font-medium text-ink-soft block mb-4">Skills Needed</label>
                  <div className="flex flex-wrap gap-2">
                    {SKILLS.map(skill => (
                      <button
                        key={skill}
                        type="button"
                        onClick={() => toggleSkill(skill)}
                        className={cn(
                          "px-6 py-2 rounded-lg text-xs font-semibold uppercase border transition-all",
                          selectedSkills.includes(skill) 
                            ? "bg-blue-dark border-blue-dark text-white "
                            : "bg-white border-line-light text-ink-muted hover:border-blue-300"
                        )}
                      >
                        {skill}
                      </button>
                    ))}
                  </div>
               </div>

               <div>
                  <label className="text-sm font-medium text-ink-soft block mb-4">Exclusive Badges / Eligibility</label>
                  <div className="flex flex-wrap gap-2">
                    {OPPORTUNITY_EXCLUSIVES.map(exc => (
                      <button
                        key={exc}
                        type="button"
                        onClick={() => toggleExclusive(exc)}
                        className={cn(
                          "px-6 py-2 rounded-lg text-xs font-semibold uppercase border transition-all",
                          selectedExclusives.includes(exc) 
                            ? "bg-amber-600 border-amber-600 text-white "
                            : "bg-white border-line-light text-ink-muted hover:border-amber-300"
                        )}
                      >
                        {exc}
                      </button>
                    ))}
                  </div>
               </div>
            </section>

            {saveError && (
              <div role="alert" aria-live="assertive" className="mt-8 bg-red-50 text-red-700 p-3.5 text-[13px] border border-red-200">
                {saveError}
              </div>
            )}

            <div className="pt-10 flex gap-4">
              <Button type="button" variant="outline" className="flex-1 h-16 rounded-lg font-semibold uppercase text-xs" onClick={() => navigate(-1)}>Cancel</Button>
              <Button type="submit" className="flex-[2] text-sm h-16 font-semibold uppercase bg-blue-dark hover:bg-[#153343]  rounded-lg" isLoading={isLoading}>
                Create Opportunity
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {showSuccessAnim && (
        <SuccessAnimation
          message="Your custom volunteering opportunity has been listed successfully!"
        />
      )}
    </div>
  );
}
