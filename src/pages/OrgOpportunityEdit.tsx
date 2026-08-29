import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../firebase/config';
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { ArrowLeft, Globe, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Opportunity } from '../types';
import { cn } from '../lib/utils';
import { Badge } from '../components/ui/Badge';
import { useGeolocation } from '../hooks/useGeolocation';

import { OPPORTUNITY_CATEGORIES, OPPORTUNITY_EXCLUSIVES } from '../constants';
import { promoteWaitlistedApplicant } from '../lib/waitlistService';
import { resolveOpportunityDate } from '../lib/opportunityDate';
import { deleteOpportunityWithDependents } from '../lib/deleteAccount';
import { SKILLS } from '../lib/vocabularies';

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


const COMMITMENTS = [
  { value: 'One-time', label: 'One-time' },
  { value: 'Short-term (1-3 months)', label: 'Short-term (1-3 months)' },
  { value: 'Long-term (6+ months)', label: 'Long-term (6+ months)' },
];

const SCHEDULE_TYPES = [
  { value: 'single', label: 'Single Event' },
  { value: 'multiple', label: 'Multiple Occurrences' },
  { value: 'recurring', label: 'Weekly Recurring' },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Format a Date for an <input type="datetime-local">, in LOCAL time.
 *
 * This used to be `dt.toISOString().slice(0, 16)`, which is UTC — while the
 * input both displays and returns local time, and `new Date(value)` on save
 * parses a bare "YYYY-MM-DDTHH:mm" as local. So loading an opportunity shifted
 * its time forward by the UTC offset before the organization had touched
 * anything, and saving wrote that shifted value back: a 9:00 AM event showed as
 * 1:00 PM in the field and was stored as 5:00 PM. Every edit moved it again,
 * silently, and students saw the drifted time. The create page never had this
 * bug — it consumes the raw input value directly.
 */
function toDateTimeLocal(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/*
 * At MODULE scope, not inside the component. Same reasoning as the create page:
 * declared in the body they were a new function object on every render, so React
 * unmounted and remounted them rather than updating, which made the dependency
 * array meaningless and snapped the map viewport back to `coords` on every
 * keystroke. react-leaflet does not memoise MapContainer's children.
 */
function MapController({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
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
  return <Marker position={coords} icon={customPinIcon} />;
}

export default function OrgOpportunityEdit() {
  const { id } = useParams();
  const { user, orgProfile, isDemoMode } = useAuth();
  const navigate = useNavigate();
  const { coords: userCoords } = useGeolocation();
  const [isLoading, setIsLoading] = useState(true);
  // The posting could not be read. Distinct from isLoading, because the failure
  // mode being prevented is rendering an editable form over a document whose
  // real contents are unknown.
  const [loadFailed, setLoadFailed] = useState(false);
  // maxVolunteers as it was when the page loaded, so the save can promote the
  // waitlist when the coordinator raises it.
  const loadedMaxRef = useRef<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  // What the date field held when the opportunity was loaded, so an edit that
  // does not touch the date is never rejected for being in the past.
  const initialDateTimeRef = useRef('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Form Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [category, setCategory] = useState(OPPORTUNITY_CATEGORIES[0]);
  const [requirements, setRequirements] = useState('');
  const [maxVolunteers, setMaxVolunteers] = useState('5');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedExclusives, setSelectedExclusives] = useState<string[]>([]);
  const [timeCommitment, setTimeCommitment] = useState(COMMITMENTS[0].value);
  const [isVirtual, setIsVirtual] = useState(false);
  const [coords, setCoords] = useState({ lat: 43.7615, lng: -79.4111 });
  const [isGeocoding, setIsGeocoding] = useState(false);
  // Set when the address lookup finds nothing or fails, so the map pin is not
  // silently left at the North York default. See the geocode effect.
  const [geocodeNotice, setGeocodeNotice] = useState<string | null>(null);

  // Auto-geocode location — same abort handling as OrgOpportunityCreate; see
  // the note there for why an unaborted in-flight lookup could overwrite the
  // coordinates of a newer address.
  useEffect(() => {
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
            'We could not find that address on the map. Drag the pin below to the right place before you save.',
          );
        }
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return;
        console.error('Geocoding error:', error);
        setGeocodeNotice(
          'We could not look that address up just now. Check the pin below is in the right place before you save.',
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

  // Advanced Timeline
  const [scheduleType, setScheduleType] = useState<'single' | 'recurring' | 'multiple'>('single');
  const [shifts, setShifts] = useState<Array<{ date?: string; day?: string; startTime: string; endTime: string }>>([
    { startTime: '09:00', endTime: '12:00' }
  ]);

  useEffect(() => {
    const fetchOpp = async () => {
      if (!id) return;

      if (isDemoMode) {
        setTitle('Welcome Center Support');
        setDescription('Help us welcome new community members.');
        setLocation('5100 Yonge St, North York');
        setDateTime(new Date().toISOString().slice(0, 16));
        setCategory('Community Services');
        setRequirements('Friendly attitude.');
        setMaxVolunteers('10');
        setSelectedSkills(['Communication']);
        setTimeCommitment('One-time');
        setIsVirtual(false);
        setScheduleType('single');
        setShifts([{ startTime: '09:00', endTime: '12:00' }]);
        setIsLoading(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, 'opportunities', id));
        if (!snap.exists()) {
          // Was a bare `if (snap.exists())` with no else. See the note on the
          // catch below: falling through here renders an empty form over a real
          // document id.
          setLoadFailed(true);
          return;
        }
        {
          const data = snap.data() as Opportunity;
          if (data.orgId !== user?.uid) {
             navigate('/org/dashboard');
             return;
          }
          setTitle(data.title);
          setDescription(data.description);
          setLocation(data.location);
          if (data.dateTime) {
            try {
              const dt = data.dateTime.toDate ? data.dateTime.toDate() : new Date(data.dateTime);
              setDateTime(toDateTimeLocal(dt));
              initialDateTimeRef.current = toDateTimeLocal(dt);
            } catch (e) {
              // fallback
            }
          } else if (data.dateTime instanceof Date) {
            setDateTime(toDateTimeLocal(data.dateTime));
          } else if (typeof data.dateTime === 'string') {
            setDateTime(data.dateTime.slice(0, 16));
          }
          // Defaulted, because a document missing any of these used to be
          // unrecoverable rather than merely incomplete:
          //   - maxVolunteers.toString() threw, so the page hit the error
          //     boundary and the opportunity could never be opened;
          //   - skillsNeeded fed straight into state and back out on save, so
          //     an absent field wrote `skillsNeeded: undefined`, which the
          //     Firestore SDK rejects — the whole update failed and the
          //     organization simply could not edit that opportunity.
          setCategory(data.category || '');
          setRequirements(data.requirements || '');
          setMaxVolunteers(String(data.maxVolunteers ?? ''));
          // Remembered so the save can tell a RAISE from a lowering and promote
          // the waitlist by the difference. Without it, adding places left every
          // waitlisted student exactly where they were.
          loadedMaxRef.current = Number(data.maxVolunteers) || 0;
          setSelectedSkills(data.skillsNeeded || []);
          setSelectedExclusives(data.exclusives || []);
          setTimeCommitment(data.timeCommitment || '');
          setIsVirtual(Boolean(data.isVirtual));
          if (data.coordinates) setCoords(data.coordinates);
          if (data.scheduleType) setScheduleType(data.scheduleType);
          if (data.shifts) setShifts(data.shifts);
        }
      } catch (err) {
        /*
         * A failed read must NOT fall through to the form.
         *
         * This was `console.error` and nothing else, and neither this nor the
         * missing-document branch set any flag, so both paths landed on the
         * fully rendered "Edit Opportunity" form with every field at its
         * useState default. The required fields are visibly empty, so an
         * organisation retypes them and presses Update -- and handleSubmit
         * writes the WHOLE document from component state, silently replacing
         * everything that is not required: skillsNeeded and exclusives become
         * [], coordinates jump to the generic North York centre, isVirtual
         * becomes false, and a recurring three-shift posting becomes a single
         * one-off 09:00-12:00. Then it navigates away on success.
         *
         * Both sibling pages already do this correctly
         * (OrgOpportunityApplicants and StudentOpportunityDetail).
         */
        console.error('Error fetching opp:', err);
        setLoadFailed(true);
      } finally {
        setIsLoading(false);
      }
    };
    fetchOpp();
  }, [id, user, navigate]);

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
    if (!user || !id) return;
    
    setIsSaving(true);
    setSaveError(null);

    // The same checks the create page runs. This page had none at all, so an
    // opportunity could be edited to end before it starts, or moved into the
    // past — neither of which could be entered when posting it.
    //
    // Past dates are only rejected when the value actually CHANGED. An
    // organization fixing a typo in the description of an event that has
    // already happened is doing something reasonable, and blocking that would
    // make old postings uneditable.
    if (scheduleType === 'single' && !dateTime) {
      // Without this the empty case fell through to the shift branch, whose
      // loop is a no-op for a single event, and resolveOpportunityDate returned
      // `now` — so saving a description tweak silently moved the event to today
      // on every student's card. The load fallback leaves this empty whenever
      // the stored value cannot be parsed, so it is reachable.
      setSaveError('This opportunity has no date and time. Please set one before saving.');
      setIsSaving(false);
      return;
    }
    if (scheduleType === 'single' && dateTime) {
      const selected = new Date(dateTime);
      if (Number.isNaN(selected.getTime())) {
        setSaveError('That date and time could not be read. Please re-enter it.');
        setIsSaving(false);
        return;
      }
      if (dateTime !== initialDateTimeRef.current && selected < new Date()) {
        setSaveError('The event date and time cannot be in the past.');
        setIsSaving(false);
        return;
      }
    } else {
      for (const shift of shifts) {
        if (shift.startTime >= shift.endTime) {
          setSaveError('Shift end time must be after the start time.');
          setIsSaving(false);
          return;
        }
      }
    }

    const opportunityData = {
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
      skillsNeeded: selectedSkills,
      exclusives: selectedExclusives,
      timeCommitment,
      isVirtual,
      updatedAt: serverTimestamp(),
      coordinates: coords,
      scheduleType,
      shifts: shifts.map(s => ({
        ...s,
        date: s.date || null,
        day: s.day || null
      }))
    };

    if (isDemoMode) {
      setTimeout(() => {
        navigate('/org/dashboard');
      }, 800);
      return;
    }

    try {
      await updateDoc(doc(db, 'opportunities', id), opportunityData);

      /*
       * Raising the volunteer limit frees places, and nothing promoted anyone.
       *
       * Promotion was reachable from exactly two places, both of them a
       * rejection or a termination, so a coordinator who secured more capacity
       * and edited the posting from 3 to 6 left every waitlisted student
       * waitlisted until some unrelated applicant happened to be turned down.
       *
       * Promoted one at a time up to the number of new places, because
       * promoteWaitlistedApplicant re-counts the accepted total on each call and
       * returns null once the posting is full or the waitlist is empty, so it is
       * safe to ask for more than exist.
       */
      const newMax = Number(maxVolunteers) || 0;
      const added = newMax - loadedMaxRef.current;
      let unnotified = 0;
      if (newMax > 0 && added > 0) {
        for (let i = 0; i < added; i++) {
          const promoted: any = await promoteWaitlistedApplicant(id, orgProfile?.organizationName || 'Verified Organization');
          if (!promoted) break;
          // Checked here TOO. The other two call sites read this flag; this
          // third one was written without it, so a promotion whose email failed
          // navigated away in silence and the student kept seeing WAITLIST.
          if (promoted.emailSent === false) unnotified++;
        }
      }

      if (unnotified > 0) {
        setSaveError(
          `Saved, and ${unnotified} waitlisted student${unnotified === 1 ? ' was' : 's were'} moved into the new place${unnotified === 1 ? '' : 's'}, ` +
          'but we could not email them. Please contact them directly.',
        );
        setIsSaving(false);
        return;
      }

      navigate('/org/dashboard');
    } catch (err: any) {
      // handleFirestoreError throws from inside the catch, which escaped
      // unhandled and left the org with no idea the save had failed.
      console.error('Failed to update opportunity:', err);
      setSaveError("We couldn't save your changes. Please check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteOpportunity = async () => {
    if (!id || !user) return;
    setIsDeleting(true);
    setDeleteError(null);

    if (isDemoMode) {
      setTimeout(() => navigate('/org/dashboard'), 600);
      return;
    }

    try {
      // Deleted server-side, with its dependents.
      //
      // This was a bare deleteDoc on the opportunity alone. Every application
      // to the posting survived it and became unreachable by anyone: the
      // organization's applicant queries are built from the opportunities it
      // still owns, and the applications `list` rule proves ownership through
      // exists(/opportunities/{id}) — now false. Students kept a "PENDING" row
      // forever, never rejected, never told.
      //
      // The cascade cannot run from here: the rules let only the student (or a
      // developer) delete an application or a saved bookmark, and an
      // organization cannot even list savedOpportunities. So the server does
      // it, and emails the students whose placement has just disappeared.
      await deleteOpportunityWithDependents(id);
      navigate('/org/dashboard');
    } catch (err: any) {
      console.error('Failed to delete opportunity:', err);
      setDeleteError('Something went wrong deleting this opportunity. Please try again.');
      setIsDeleting(false);
    }
  };

  if (isLoading) return <div className="p-20 text-center text-ink-muted font-bold uppercase tracking-widest text-xs">Loading Opportunity...</div>;

  // Never the form. Saving a form filled from useState defaults overwrites the
  // real posting with them.
  if (loadFailed) {
    return (
      <div className="max-w-2xl mx-auto py-20 px-4 text-center">
        <h1 className="text-2xl font-bold text-ink mb-3">We could not open this opportunity</h1>
        <p className="text-ink-muted text-sm leading-relaxed mb-8">
          It may have been deleted, or the connection dropped while it was loading.
          Nothing has been changed. Go back and try again, and if it keeps happening
          the posting may no longer exist.
        </p>
        <button
          onClick={() => navigate('/org/dashboard')}
          className="bg-blue-dark text-white font-bold uppercase text-xs tracking-widest px-6 py-3 rounded-lg hover:bg-[#153343] transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-ink-muted hover:text-blue-dark font-bold uppercase text-xs tracking-widest mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <Card className="border-none rounded-lg overflow-hidden">
        <CardHeader className="bg-blue-dark text-white p-10 border-none">
          {/* as="h1": this card IS the page, and without it the outline starts at h3. */}
          <CardTitle as="h1" className="text-3xl font-bold uppercase tracking-tight text-white">Edit Opportunity</CardTitle>
          <p className="text-blue-100 mt-2 font-medium">Keep your volunteer posting up to date.</p>
        </CardHeader>
        <CardContent className="p-10">
          <form onSubmit={handleSubmit} className="space-y-10">
             <section className="space-y-6">
                <h3 className="text-xl font-bold flex items-center gap-2 text-ink pb-3 border-b border-line">Basic Information</h3>
                <Input label="Opportunity Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
                <div className="flex flex-col gap-1.5">
                   <label className="text-sm font-medium text-ink-soft">Description <span className="text-red-600">*</span></label>
                   <textarea aria-label="Description" className="w-full rounded-lg border border-line p-6 min-h-[150px] font-medium focus:ring-2 focus:ring-blue-dark focus:outline-none" value={description} onChange={(e) => setDescription(e.target.value)} required />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={OPPORTUNITY_CATEGORIES.map(cat => ({ value: cat, label: cat }))} required />
                   <Select label="Frequency" value={timeCommitment} onChange={(e) => setTimeCommitment(e.target.value)} options={COMMITMENTS} required />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <Input label="Number of Openings / Volunteers Needed" type="number" min="1" value={maxVolunteers} onChange={(e) => setMaxVolunteers(e.target.value)} required />
                   <Select label="Type of Schedule" value={scheduleType} onChange={(e) => setScheduleType(e.target.value as any)} options={SCHEDULE_TYPES} required />
                </div>
             </section>

             {/* Advanced Timeline */}
             <section className="space-y-6">
                <div className="flex items-center justify-between">
                   <h3 className="text-xl font-bold flex items-center gap-2 text-ink pb-3 border-b border-line">Advanced Timeline</h3>
                   <Badge variant="secondary" className="bg-blue-dark/5 text-[#153343] border-none font-bold">{shifts.length} Shift{shifts.length !== 1 ? 's' : ''}</Badge>
                </div>
                
                <div className="bg-paper-2 p-6 rounded-lg border border-line-light space-y-6">
                   {scheduleType === 'single' && (
                      <div className="animate-in fade-in slide-in- duration-300">
                         <Input label="Event Date & Primary Time" type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} required />
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
                                  <div className="flex-1 space-y-2">
                                     <label className="text-xs font-bold text-ink-muted uppercase tracking-widest leading-none">Weekly Day</label>
                                     <select
                                       aria-label="Weekly Day" className="w-full h-10 px-3 rounded-lg border border-line text-sm focus:ring-2 focus:ring-blue-dark font-bold" value={shift.day || ''} onChange={(e) => updateShift(index, { day: e.target.value })} required>
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
                               <button type="button" onClick={() => removeShift(index)} className="p-3 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors" disabled={shifts.length <= 1}>
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

             <section className="space-y-6">
                <h3 className="text-xl font-bold flex items-center gap-2 text-ink pb-3 border-b border-line">Location & Map</h3>
                <div className="relative">
                   <Input 
                     label="Physical Address" 
                     value={location} 
                     onChange={(e) => setLocation(e.target.value)} 
                     required 
                   />
                   {isGeocoding && (
                     <div className="absolute right-4 top-[40px] flex items-center gap-2 text-xs font-bold text-blue-dark animate-pulse uppercase tracking-widest">
                        <div className="w-2 h-2 bg-blue-dark rounded-lg" /> Updating Map...
                     </div>
                   )}
                </div>
                <label className="flex items-center gap-3 p-6 rounded-lg bg-paper-2 border border-line cursor-pointer hover:border-blue-300 transition-all">
                   <input type="checkbox" className="w-6 h-6 rounded-lg text-blue-dark focus:ring-blue-dark" checked={isVirtual} onChange={(e) => setIsVirtual(e.target.checked)} />
                   <div>
                     <p className="font-bold text-ink flex items-center gap-2 uppercase text-xs tracking-widest"><Globe className="w-4 h-4 text-blue-dark" /> Virtual Opportunity</p>
                     <p className="text-xs text-ink-muted mt-0.5 font-medium">Volunteers can participate online.</p>
                   </div>
                </label>
                <div className="space-y-2">
                   <p className="text-xs font-bold text-ink-muted uppercase tracking-widest ml-1">Update Map Pin</p>
                   {geocodeNotice && (
                     <p role="status" className="text-xs text-amber-800 bg-amber/10 border border-amber/40 rounded-lg p-2.5 leading-relaxed">
                       {geocodeNotice}
                     </p>
                   )}
                   <Card className="h-[300px] overflow-hidden rounded-lg border-none">
                      <MapContainer center={[coords.lat, coords.lng]} zoom={12} style={{ height: '100%', width: '100%' }}>
                         <TileLayer 
                            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> Contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                             
                            maxZoom={20}
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

             <section className="space-y-6">
                <h3 className="text-xl font-bold flex items-center gap-2 text-ink pb-3 border-b border-line">Requirements & Skills</h3>
                <div className="flex flex-col gap-1.5">
                   <label className="text-sm font-medium text-ink-soft">Detailed Requirements <span className="text-red-600">*</span></label>
                   <textarea aria-label="Detailed requirements" className="w-full rounded-lg border border-line p-6 min-h-[100px] font-medium" value={requirements} onChange={(e) => setRequirements(e.target.value)} required />
                </div>
                <div>
                   <label className="text-sm font-medium text-ink-soft block mb-4">Skills Needed</label>
                   <div className="flex flex-wrap gap-2">
                     {SKILLS.map(skill => (
                       <button key={skill} type="button" onClick={() => toggleSkill(skill)} className={cn("px-6 py-2 rounded-lg text-xs font-semibold uppercase border transition-all", selectedSkills.includes(skill) ? "bg-blue-dark border-blue-dark text-white shadow-blue-100" : "bg-white border-line-light text-ink-muted hover:border-blue-300")}>
                         {skill}
                       </button>
                     ))}
                   </div>
                </div>

                {/* The exclusives picker Create has and Edit did not.
                    OPPORTUNITY_EXCLUSIVES was imported here, toggleExclusive was
                    written here, and `exclusives` was read on load and written on
                    save — every part existed except the control. So eligibility
                    set once at creation could never be changed, and an
                    organization that opened a role to more students had no way to
                    say so. */}
                <div>
                   <label className="text-sm font-medium text-ink-soft block mb-4">Exclusive Badges / Eligibility</label>
                   <div className="flex flex-wrap gap-2">
                     {OPPORTUNITY_EXCLUSIVES.map(exc => (
                       <button
                         key={exc}
                         type="button"
                         onClick={() => toggleExclusive(exc)}
                         aria-pressed={selectedExclusives.includes(exc)}
                         className={cn(
                           "px-6 py-2 rounded-lg text-xs font-semibold uppercase border transition-all",
                           selectedExclusives.includes(exc)
                             ? "bg-amber-600 border-amber-600 text-white shadow-amber-100"
                             : "bg-white border-line-light text-ink-muted hover:border-amber-300"
                         )}
                       >
                         {exc}
                       </button>
                     ))}
                   </div>
                </div>
             </section>

             <section className="space-y-4 pt-4">
                {/* No left stripe: the heading is already red, says "Danger
                    Zone", and sits directly above a red-tinted panel. Three
                    signals for one message, one of which is colour-only. */}
                <h3 className="text-xl font-bold flex items-center gap-2 text-red-600">Danger Zone</h3>
                <div className="bg-red-50 border border-red-100 rounded-lg p-6 space-y-4">
                  {!confirmingDelete ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <p className="font-bold text-ink text-sm uppercase tracking-widest flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-600" /> Delete This Opportunity
                        </p>
                        <p className="text-xs text-ink-muted mt-1 font-medium max-w-lg">
                          Permanently removes this posting and every application to it. Anyone
                          still waiting on a decision is emailed to say it was withdrawn.
                        </p>
                      </div>
                      <Button type="button" variant="danger" className="rounded-lg font-semibold text-xs shrink-0" onClick={() => setConfirmingDelete(true)}>
                        Delete Opportunity
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="font-bold text-red-700 text-sm">Are you sure? This can't be undone.</p>
                      <p className="text-xs text-ink-muted font-medium">
                        This will delete "{title}" and every application to it. Applicants awaiting
                        a decision will be emailed. This cannot be undone.
                      </p>
                      {deleteError && <p className="text-xs text-red-600 font-bold">{deleteError}</p>}
                      <div className="flex gap-3">
                        <Button type="button" variant="outline" className="rounded-lg font-semibold text-xs" onClick={() => setConfirmingDelete(false)} disabled={isDeleting}>
                          Cancel
                        </Button>
                        <Button type="button" variant="danger" className="rounded-lg font-semibold text-xs" onClick={handleDeleteOpportunity} isLoading={isDeleting}>
                          Yes, Delete Permanently
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
             </section>

             {saveError && (
               <div role="alert" aria-live="assertive" className="mt-8 bg-red-50 text-red-700 p-3.5 text-[13px] border border-red-200">
                 {saveError}
               </div>
             )}

             <div className="pt-10 flex gap-4">
               <Button type="button" variant="outline" className="flex-1 h-16 rounded-lg font-semibold uppercase text-xs" onClick={() => navigate(-1)}>Cancel</Button>
               <Button type="submit" className="flex-[2] text-sm h-16 font-semibold uppercase bg-blue-dark hover:bg-[#153343] shadow-blue-100 rounded-lg" isLoading={isSaving}>Update Opportunity</Button>
             </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
