import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SuccessAnimation from '../components/SuccessAnimation';
import { db } from '../firebase/config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { MapPin, Calendar, Clock, Users, ArrowLeft, Globe, Plus, Trash2, Info, MessageCircle } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { cn } from '../lib/utils';
import { useGeolocation } from '../hooks/useGeolocation';

import { Badge } from '../components/ui/Badge';
import { OPPORTUNITY_CATEGORIES, OPPORTUNITY_EXCLUSIVES } from '../constants';

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

const customPinIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center">
      <div class="absolute w-8 h-8 bg-[#1F4C63]/30 rounded-sm animate-ping"></div>
      <div class="w-7 h-7 bg-[#1F4C63] border-2 border-white rounded-sm  flex items-center justify-center">
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

const SKILLS = [
  'Communication', 'Computer & Tech', 'Creative & Design', 'Event Support',
  'Language Skills', 'Leadership', 'Organization', 'Physical Work', 'Research & Writing', 'Teaching'
];

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

export default function OrgOpportunityCreate() {
  const { user, isDemoMode, orgProfile } = useAuth();
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
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedExclusives, setSelectedExclusives] = useState<string[]>([]);
  const [timeCommitment, setTimeCommitment] = useState(COMMITMENTS[0].value);
  const [isVirtual, setIsVirtual] = useState(false);
  const [autoCreateGroupChat, setAutoCreateGroupChat] = useState(true);
  const [coords, setCoords] = useState({ lat: 43.7615, lng: -79.4111 }); // North York center
  const [isGeocoding, setIsGeocoding] = useState(false);

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
        if (parsed.selectedSkills) setSelectedSkills(parsed.selectedSkills);
        if (parsed.selectedExclusives) setSelectedExclusives(parsed.selectedExclusives);
        if (parsed.timeCommitment) setTimeCommitment(parsed.timeCommitment);
        if (parsed.isVirtual !== undefined) setIsVirtual(parsed.isVirtual);
        if (parsed.autoCreateGroupChat !== undefined) setAutoCreateGroupChat(parsed.autoCreateGroupChat);
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
      selectedSkills,
      selectedExclusives,
      timeCommitment,
      isVirtual,
      autoCreateGroupChat,
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
  }, [title, description, location, dateTime, category, requirements, maxVolunteers, selectedSkills, selectedExclusives, timeCommitment, isVirtual, autoCreateGroupChat, coords, scheduleType, shifts]);

  const handleDeleteDraft = () => {
    localStorage.removeItem('opportunity_draft');
    setTitle('');
    setDescription('');
    setLocation(orgProfile?.address || '');
    setDateTime('');
    setCategory(OPPORTUNITY_CATEGORIES[0]);
    setRequirements('');
    setMaxVolunteers('5');
    setSelectedSkills([]);
    setSelectedExclusives([]);
    setTimeCommitment(COMMITMENTS[0].value);
    setIsVirtual(false);
    setAutoCreateGroupChat(true);
    setCoords({ lat: 43.7615, lng: -79.4111 });
    setScheduleType('single');
    setShifts([{ startTime: '09:00', endTime: '12:00' }]);
    setDraftSavedTime(null);
    setIsDraftLoaded(false);
  };

  // Auto-geocode location
  React.useEffect(() => {
    const geocode = async () => {
      if (!location || location.length < 5 || isVirtual) return;
      
      setIsGeocoding(true);
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&viewbox=-79.638,43.855,-79.116,43.581&bounded=0`);
        const data = await response.json();
        
        if (data && data.length > 0) {
          const { lat, lon } = data[0];
          setCoords({ lat: parseFloat(lat), lng: parseFloat(lon) });
        }
      } catch (error) {
        console.error('Geocoding error:', error);
      } finally {
        setIsGeocoding(false);
      }
    };

    const timeoutId = setTimeout(geocode, 1000); // 1s debounce
    return () => clearTimeout(timeoutId);
  }, [location, isVirtual]);

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

  function LocationMarker() {
    useMapEvents({
      click(e) {
        setCoords(e.latlng);
      },
    });
    return <Marker position={coords} icon={customPinIcon} />;
  }

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

    const opportunityData = {
      orgId: user.uid,
      orgName: orgProfile?.organizationName,
      title,
      description,
      location,
      dateTime: scheduleType === 'single' ? new Date(dateTime) : serverTimestamp(),
      category,
      requirements,
      maxVolunteers: parseInt(maxVolunteers),
      skillsNeeded: selectedSkills,
      exclusives: selectedExclusives,
      timeCommitment,
      isVirtual,
      autoCreateGroupChat,
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
      await addDoc(collection(db, 'opportunities'), opportunityData);
      localStorage.removeItem('opportunity_draft');
      setShowSuccessAnim(true);
      setTimeout(() => {
        navigate('/org/dashboard');
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

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <button 
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-slate-600 hover:text-[#1F4C63] font-medium mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <Card className="border-none  rounded-sm overflow-hidden">
        <CardHeader className="bg-[#1F4C63] text-white p-10 border-none">
          <CardTitle className="text-3xl text-white">Post New Opportunity</CardTitle>
          <p className="text-blue-100 mt-2">Fill out the details to attract the best student volunteers.</p>
        </CardHeader>
        <CardContent className="p-10">
          {/* Draft Auto-save Banner */}
          <div className="mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-sm bg-slate-50 border border-slate-100/70 text-slate-600 text-xs ">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 bg-emerald-500 rounded-sm animate-pulse" />
              <span className="font-semibold text-slate-600">
                {draftSavedTime 
                  ? `Changes auto-saved to local draft at ${draftSavedTime}` 
                  : "All work is automatically saved as a local draft."}
              </span>
            </div>
            {isDraftLoaded && (
              <button
                type="button"
                onClick={handleDeleteDraft}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-extrabold rounded-sm transition-all uppercase tracking-wider text-[10px] cursor-pointer rounded-full"
              >
                Delete Draft & Start Fresh
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-10">
            {/* Basic Info */}
            <section className="space-y-6">
               <h3 className="text-xl font-bold flex items-center gap-2 text-slate-900 border-l-4 border-[#1F4C63] pl-4">
                  Basic Information
               </h3>
               <Input label="Opportunity Title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g., Afternoon Tutoring at Community Center" />
               <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-700">Description</label>
                  <textarea 
                    className="w-full rounded-sm border border-slate-200 p-6 text-sm focus:ring-2 focus:ring-[#1F4C63] focus:outline-none min-h-[150px] font-medium"
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
                  <Input label="Max Volunteers needed total" type="number" min="1" value={maxVolunteers} onChange={(e) => setMaxVolunteers(e.target.value)} required />
                  <Select label="Type of Schedule" value={scheduleType} onChange={(e) => setScheduleType(e.target.value as any)} options={SCHEDULE_TYPES} required />
               </div>
            </section>

            {/* Advanced Timeline */}
            <section className="space-y-6">
               <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold flex items-center gap-2 text-slate-900 border-l-4 border-[#1F4C63] pl-4">
                     Advanced Timeline
                  </h3>
                  <Badge variant="secondary" className="bg-[#1F4C63]/5 text-[#153343] border-none font-bold">
                     {shifts.length} Shift{shifts.length !== 1 ? 's' : ''}
                  </Badge>
               </div>
               
               <div className="bg-slate-50 p-6 rounded-sm border border-slate-100 space-y-6">
                  {scheduleType === 'single' && (
                     <div className="animate-in fade-in slide-in- duration-300">
                        <Input label="Event Date & Primary Time" type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} required />
                        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest mt-3 flex items-center gap-2">
                           <Info className="w-3 h-3 text-[#1F4C63]" /> This is a one-time event with a single start time.
                        </p>
                     </div>
                  )}

                  {(scheduleType === 'multiple' || scheduleType === 'recurring') && (
                     <div className="space-y-4 animate-in fade-in slide-in- duration-300">
                        {shifts.map((shift, index) => (
                           <div key={index} className="flex flex-col md:flex-row gap-4 p-6 bg-white rounded-sm border border-slate-100  items-end relative overflow-hidden group">
                              <div className="absolute top-0 left-0 w-1 h-full bg-[#1F4C63] opacity-0 group-hover:opacity-100 transition-opacity" />
                              
                              {scheduleType === 'multiple' ? (
                                 <div className="flex-1 space-y-2">
                                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest leading-none">Shift Date</label>
                                    <Input type="date" value={shift.date || ''} onChange={(e) => updateShift(index, { date: e.target.value })} required />
                                 </div>
                              ) : (
                                 <div className="flex-1 space-y-2 text-left">
                                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest leading-none">Weekly Day</label>
                                    <select 
                                       className="w-full h-10 px-3 rounded-sm border border-slate-200 text-sm focus:ring-2 focus:ring-[#1F4C63] font-bold"
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
                                 <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest leading-none">Starts</label>
                                 <Input type="time" value={shift.startTime} onChange={(e) => updateShift(index, { startTime: e.target.value })} required />
                              </div>

                              <div className="flex-[0.5] space-y-2">
                                 <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest leading-none">Ends</label>
                                 <Input type="time" value={shift.endTime} onChange={(e) => updateShift(index, { endTime: e.target.value })} required />
                              </div>

                              <button 
                                 type="button" 
                                 onClick={() => removeShift(index)}
                                 className="p-3 bg-red-50 text-red-500 rounded-sm hover:bg-red-100 transition-colors"
                                 disabled={shifts.length <= 1}
                              >
                                 <Trash2 className="w-4 h-4" />
                              </button>
                           </div>
                        ))}
                        <Button type="button" variant="outline" className="w-full h-14 border-dashed border-2 hover:border-[#1F4C63] hover:text-[#1F4C63] transition-all rounded-sm gap-2 font-black uppercase text-xs tracking-widest" onClick={addShift}>
                           <Plus className="w-4 h-4" /> Add Another Shift / Day
                        </Button>
                     </div>
                  )}
               </div>
            </section>

            {/* Location & Map */}
            <section className="space-y-6">
               <h3 className="text-xl font-bold flex items-center gap-2 text-slate-900 border-l-4 border-[#1F4C63] pl-4">
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
                    <div className="absolute right-4 top-[40px] flex items-center gap-2 text-[10px] font-bold text-[#1F4C63] animate-pulse uppercase tracking-widest">
                       <div className="w-2 h-2 bg-[#1F4C63] rounded-sm" /> Updating Map...
                    </div>
                  )}
               </div>
               <label className="flex items-center gap-3 p-6 rounded-sm bg-slate-50 border border-slate-200 cursor-pointer hover:border-blue-300 transition-all">
                  <input
                    type="checkbox"
                    className="w-6 h-6 rounded-sm text-[#1F4C63] focus:ring-[#1F4C63]"
                    checked={isVirtual}
                    onChange={(e) => setIsVirtual(e.target.checked)}
                  />
                  <div>
                    <p className="font-black text-slate-900 flex items-center gap-2 uppercase text-xs tracking-widest">
                       <Globe className="w-4 h-4 text-[#1F4C63]" /> Virtual Opportunity
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5 font-medium">Volunteers can participate from anywhere via internet.</p>
                  </div>
               </label>
               
               <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Place Map Pin (Click to move)</p>
                  <Card className="h-[300px] overflow-hidden rounded-sm border-none ">
                     <MapContainer center={[coords.lat, coords.lng]} zoom={12} style={{ height: '100%', width: '100%' }}>
                        <TileLayer 
                            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> Contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                             
                            maxZoom={20}
                         />
                        <MapController center={coords} />
                        <LocationMarker />
                        {userCoords && (
                           <Marker position={[userCoords.latitude, userCoords.longitude]} icon={userLocationIcon}>
                              <Popup className="rounded-sm overflow-hidden">
                                 <div className="p-2 text-center text-xs space-y-1">
                                    <div className="font-bold text-slate-900">Your Location</div>
                                    <div className="text-[10px] text-[#E08A3C] font-mono font-bold uppercase">Active Tracker</div>
                                    <div className="text-[10px] text-slate-600 font-mono">Lat: {userCoords.latitude.toFixed(4)}, Lng: {userCoords.longitude.toFixed(4)}</div>
                                 </div>
                              </Popup>
                           </Marker>
                        )}
                     </MapContainer>
                  </Card>
               </div>

               <label className="flex items-center gap-3 p-6 rounded-sm bg-[#1F4C63]/5/50 border border-[#1F4C63]/10 cursor-pointer hover:border-blue-300 transition-all">
                  <input
                    type="checkbox"
                    className="w-6 h-6 rounded-sm text-[#1F4C63] focus:ring-[#1F4C63]"
                    checked={autoCreateGroupChat}
                    onChange={(e) => setAutoCreateGroupChat(e.target.checked)}
                  />
                  <div>
                    <p className="font-black text-slate-900 flex items-center gap-2 uppercase text-xs tracking-widest">
                       <MessageCircle className="w-4 h-4 text-[#1F4C63]" /> Auto-Create Group Chat
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5 font-medium">When you accept applicants, they will automatically be added to a dedicated group chat for this opportunity.</p>
                  </div>
               </label>
            </section>

            {/* Requirements & Skills */}
            <section className="space-y-6">
               <h3 className="text-xl font-bold flex items-center gap-2 text-slate-900 border-l-4 border-[#1F4C63] pl-4">
                  Requirements & Skills
               </h3>
               <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-700">Detailed Requirements</label>
                  <textarea 
                    className="w-full rounded-sm border border-slate-200 p-6 text-sm focus:ring-2 focus:ring-[#1F4C63] focus:outline-none min-h-[100px] font-medium"
                    placeholder="Specify any background checks, language requirements, or age limits..."
                    value={requirements}
                    onChange={(e) => setRequirements(e.target.value)}
                    required
                  />
               </div>
               <div>
                  <label className="text-sm font-medium text-slate-700 block mb-4">Skills Needed</label>
                  <div className="flex flex-wrap gap-2">
                    {SKILLS.map(skill => (
                      <button
                        key={skill}
                        type="button"
                        onClick={() => toggleSkill(skill)}
                        className={cn(
                          "px-6 py-2 rounded-sm text-xs font-black uppercase tracking-widest border transition-all",
                          selectedSkills.includes(skill) 
                            ? "bg-[#1F4C63] border-[#1F4C63] text-white  shadow-blue-100" 
                            : "bg-white border-slate-100 text-slate-600 hover:border-blue-300"
                        )}
                      >
                        {skill}
                      </button>
                    ))}
                  </div>
               </div>

               <div>
                  <label className="text-sm font-medium text-slate-700 block mb-4">Exclusive Badges / Eligibility</label>
                  <div className="flex flex-wrap gap-2">
                    {OPPORTUNITY_EXCLUSIVES.map(exc => (
                      <button
                        key={exc}
                        type="button"
                        onClick={() => toggleExclusive(exc)}
                        className={cn(
                          "px-6 py-2 rounded-sm text-xs font-black uppercase tracking-widest border transition-all",
                          selectedExclusives.includes(exc) 
                            ? "bg-amber-600 border-amber-600 text-white  shadow-amber-100" 
                            : "bg-white border-slate-100 text-slate-600 hover:border-amber-300"
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
              <Button type="button" variant="outline" className="flex-1 h-16 rounded-sm font-black uppercase tracking-widest text-xs" onClick={() => navigate(-1)}>Cancel</Button>
              <Button type="submit" className="flex-[2] text-sm h-16 font-black uppercase tracking-widest bg-[#1F4C63] hover:bg-[#153343]  shadow-blue-100 rounded-sm" isLoading={isLoading}>
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
