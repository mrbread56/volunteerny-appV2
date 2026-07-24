import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase/config';
import { doc, setDoc } from 'firebase/firestore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { FileUpload } from '../components/ui/FileUpload';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { 
  GraduationCap, 
  School as SchoolIcon, 
  MapPin, 
  Sparkles, 
  Calendar, 
  Award, 
  FileText, 
  Check, 
  ArrowRight,
  ShieldAlert,
  FolderLock
} from 'lucide-react';
import { cn } from '../lib/utils';
import { TORONTO_SCHOOLS, NEIGHBORHOODS } from '../constants';
import { compressFile } from '../utils/compress';

const GRADES = [
  { value: '9', label: 'Grade 9' },
  { value: '10', label: 'Grade 10' },
  { value: '11', label: 'Grade 11' },
  { value: '12', label: 'Grade 12' },
];

const INTERESTS = [
  'Animal Welfare', 'Arts & Culture', 'Children & Youth', 'Community Services',
  'Education', 'Environment', 'Event Planning', 'Food Banks', 'Health & Hospitals',
  'Seniors', 'Sports', 'Technology', 'Tutoring', 'Other'
];

const SKILLS = [
  'Communication', 'Computer & Tech', 'Creative & Design', 'Event Support',
  'Language Skills', 'Leadership', 'Organization', 'Physical Work', 'Research & Writing', 'Teaching'
];

const AVAILABILITY = [
  'Weekday Mornings', 'Weekday Afternoons', 'Weekday Evenings',
  'Weekend Mornings', 'Weekend Afternoons', 'Weekend Evenings', 'Flexible'
];

export default function StudentOnboarding() {
  const { user, studentProfile, refreshProfile, isDemoMode } = useAuth();
  const navigate = useNavigate();
  
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fields state
  const [fullName, setFullName] = useState(studentProfile?.fullName || user?.displayName || '');
  const [selectedSchool, setSelectedSchool] = useState('');
  const [otherSchool, setOtherSchool] = useState('');
  const [school, setSchool] = useState('');
  const [grade, setGrade] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [availability, setAvailability] = useState<string[]>([]);
  const [passportBase64, setPassportBase64] = useState('');
  const [previousExperience, setPreviousExperience] = useState('');
  const [resumeBase64, setResumeBase64] = useState('');
  const [resumeFileName, setResumeFileName] = useState('');

  const toggleItem = (item: string, list: string[], setList: (l: string[]) => void) => {
    if (list.includes(item)) {
      setList(list.filter(i => i !== item));
    } else {
      setList([...list, item]);
    }
  };

  const validateStep = () => {
    setError('');
    if (step === 1) {
      if (!fullName.trim()) return "Full Name is required";
      const finalSchool = selectedSchool === 'Other' ? otherSchool : selectedSchool;
      if (!finalSchool || !finalSchool.trim()) return "Academic School is required";
      if (!grade) return "Grade level is required";
      if (!neighborhood) return "Neighborhood is required";
    }
    if (step === 2) {
      if (interests.length === 0) return "Please choose at least one cause category that inspires you";
    }
    if (step === 3) {
      if (skills.length === 0) return "Please choose at least one core skill you bring";
    }
    if (step === 4) {
      if (availability.length === 0) return "Please choose at least one time slot of availability";
    }
    return '';
  };

  const handleNextStep = () => {
    const errorMsg = validateStep();
    if (errorMsg) {
      setError(errorMsg);
      return;
    }
    setStep(prev => prev + 1);
  };

  const handlePrevStep = () => {
    setError('');
    setStep(prev => prev - 1);
  };

  const handleSubmit = async (e?: React.MouseEvent, skipFields = false) => {
    if (!user) return;
    setIsSubmitting(true);
    setError('');

    const finalSchool = selectedSchool === 'Other' ? otherSchool : selectedSchool;
    const finalProfileData = {
      uid: user.uid,
      fullName: fullName.trim(),
      school: finalSchool,
      grade,
      neighborhood,
      interests,
      skills,
      availability,
      previousExperience: skipFields ? '' : previousExperience.trim(),
      resumeUrl: (skipFields || !resumeBase64) ? '' : resumeBase64,
      passportUrl: passportBase64 ? compressFile(passportBase64) : '',
      trackerEnabled: true,
      trackerAnonymous: false,
      loggedHours: []
    };

    if (isDemoMode) {
      localStorage.setItem('demo_student_profile', JSON.stringify(finalProfileData));
      await refreshProfile();
      setIsSubmitting(false);
      navigate('/student/dashboard');
      return;
    }

    try {
      await setDoc(doc(db, 'students', user.uid), finalProfileData, { merge: true });
      await refreshProfile();
      navigate('/student/dashboard');
    } catch (err: any) {
      console.error("Error writing database onboarding:", err);
      setError("Failed to save your details to Google Cloud FireStore: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-6 flex flex-col justify-center items-center">
      <div className="w-full max-w-3xl space-y-8 animate-fadeIn">
        <div className="text-center space-y-3">
          <span className="text-[11px] font-black tracking-widest uppercase text-[#1F4C63] bg-[#1F4C63]/5 px-3.5 py-1.5 rounded-sm border border-[#1F4C63]/10">
            Initial Account Onboarding
          </span>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight leading-none">
            Complete Your Student Profile
          </h1>
          <p className="text-slate-600 font-medium text-sm max-w-md mx-auto leading-relaxed">
            Let's gather the academic, cause alignment, and verification details needed to safely match you with registered community programs.
          </p>
        </div>

        {/* High-contrast Progress Bar */}
        <div className="grid grid-cols-5 gap-3 max-w-xl mx-auto">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex flex-col items-center space-y-2">
              <div className={cn(
                "h-2 w-full rounded-sm transition-all duration-300",
                step >= i ? "bg-[#1F4C63]" : "bg-slate-200"
              )} />
              <span className={cn(
                "text-[9px] font-black uppercase tracking-widest hidden sm:block",
                step === i ? "text-[#1F4C63]" : "text-slate-600"
              )}>
                Step {i}
              </span>
            </div>
          ))}
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-sm flex items-center gap-3 text-xs font-bold max-w-xl mx-auto animate-shake">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Core Wizard Cards */}
        <div className="max-w-2xl mx-auto">
          {/* Step 1: Academic Identity */}
          {step === 1 && (
            <Card className="rounded-sm border-none  shadow-slate-100 bg-white">
              <CardHeader className="p-5 sm:p-10 md:p-12 border-b border-slate-50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#1F4C63]/5 text-[#1F4C63] rounded-sm flex items-center justify-center">
                    <SchoolIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-black uppercase text-slate-900 tracking-tight">School Details</CardTitle>
                    <p className="text-xs text-slate-600 font-semibold mt-1">Specify your schooling details and current neighborhood.</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 sm:p-10 md:p-12 space-y-8">
                <div className="space-y-2.5">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest pl-1">Full Name</label>
                  <Input 
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your legal first and last name"
                    className="h-14 rounded-sm bg-slate-50 border-slate-100 font-bold focus:bg-white"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2.5">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest pl-1">Academic High School</label>
                    <Select 
                      value={selectedSchool}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedSchool(val);
                        if (val !== 'Other') setSchool(val);
                        else setSchool('');
                      }}
                      options={[
                        { value: '', label: 'Select your high school' },
                        ...TORONTO_SCHOOLS.map(s => ({ value: s, label: s })),
                        { value: 'Other', label: 'Other/Not Listed' }
                      ]}
                      className="h-14 rounded-sm bg-slate-50 border-slate-100 font-bold"
                    />
                  </div>

                  <div className="space-y-2.5">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest pl-1">Grade Level</label>
                    <Select 
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                      options={[
                        { value: '', label: 'Select Grade' },
                        ...GRADES
                      ]}
                      className="h-14 rounded-sm bg-slate-50 border-slate-100 font-bold"
                    />
                  </div>
                </div>

                {selectedSchool === 'Other' && (
                  <div className="space-y-2.5 animate-in slide-in-">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest pl-1">Custom High School Name</label>
                    <Input 
                      value={otherSchool}
                      onChange={(e) => {
                        setOtherSchool(e.target.value);
                        setSchool(e.target.value);
                      }}
                      placeholder="Enter other high school name"
                      className="h-14 rounded-sm bg-slate-50 border-slate-100 font-bold"
                    />
                  </div>
                )}

                <div className="space-y-2.5">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest pl-1">Your Neighborhood</label>
                  <Select 
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    options={[
                      { value: '', label: 'Select nearest Toronto neighborhood' },
                      ...NEIGHBORHOODS.map(n => ({ value: n, label: n }))
                    ]}
                    className="h-14 rounded-sm bg-slate-50 border-slate-100 font-bold"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Interests */}
          {step === 2 && (
            <Card className="rounded-sm border-none  shadow-slate-100 bg-white">
              <CardHeader className="p-5 sm:p-10 md:p-12 border-b border-slate-50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#1F4C63]/5 text-[#1F4C63] text-[#1F4C63] rounded-sm flex items-center justify-center w-12 h-12 bg-[#1F4C63]/5 text-[#1F4C63] rounded-sm flex items-center justify-center">
                    <Award className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-black uppercase text-slate-900 tracking-tight">Causes & Passions</CardTitle>
                    <p className="text-xs text-slate-600 font-semibold mt-1">Select the main cause categories that interest you.</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 sm:p-10 md:p-12">
                <div className="flex flex-wrap gap-3 justify-center">
                  {INTERESTS.map(item => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleItem(item, interests, setInterests)}
                      className={cn(
                        "px-6 py-3.5 rounded-sm text-[10px] font-black uppercase tracking-widest border-2 transition-all duration-200",
                        interests.includes(item)
                          ? "bg-slate-900 border-slate-900 text-white scale-105  shadow-slate-200"
                          : "bg-white border-slate-100 text-slate-600 hover:border-slate-300 hover:text-slate-700"
                      )}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Skills */}
          {step === 3 && (
            <Card className="rounded-sm border-none  shadow-slate-100 bg-white">
              <CardHeader className="p-5 sm:p-10 md:p-12 border-b border-slate-50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#1F4C63]/5 text-[#1F4C63] rounded-sm flex items-center justify-center">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-black uppercase text-slate-900 tracking-tight">Your Core Skills</CardTitle>
                    <p className="text-xs text-slate-600 font-semibold mt-1">Choose the specific skillsets/contributions you bring.</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 sm:p-10 md:p-12">
                <div className="flex flex-wrap gap-3 justify-center">
                  {SKILLS.map(item => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleItem(item, skills, setSkills)}
                      className={cn(
                        "px-6 py-3.5 rounded-sm text-[10px] font-black uppercase tracking-widest border-2 transition-all duration-200",
                        skills.includes(item)
                          ? "bg-[#1F4C63] border-[#1F4C63] text-white scale-105  shadow-blue-100"
                          : "bg-white border-slate-100 text-slate-600 hover:border-slate-300 hover:text-[#1F4C63]"
                      )}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Availability */}
          {step === 4 && (
            <Card className="rounded-sm border-none  shadow-slate-100 bg-white">
              <CardHeader className="p-5 sm:p-10 md:p-12 border-b border-slate-50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#1F4C63]/5 text-[#1F4C63] rounded-sm flex items-center justify-center">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-black uppercase text-slate-900 tracking-tight">Time Availability</CardTitle>
                    <p className="text-xs text-slate-600 font-semibold mt-1">When can you usually join community placements?</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 sm:p-10 md:p-12">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {AVAILABILITY.map(item => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleItem(item, availability, setAvailability)}
                      className={cn(
                        "p-5 rounded-sm text-xs font-bold text-left border-2 transition-all flex items-center justify-between",
                        availability.includes(item)
                          ? "bg-[#E08A3C]/10 border-[#E08A3C] text-orange-900 "
                          : "bg-white border-slate-100 text-slate-600 hover:border-slate-200"
                      )}
                    >
                      <span>{item}</span>
                      {availability.includes(item) && <Check className="w-4 h-4 text-[#E08A3C] shrink-0" />}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 5: Optional Experience & Resume */}
          {step === 5 && (
            <Card className="rounded-sm border-none  shadow-slate-100 bg-white">
              <CardHeader className="p-5 sm:p-10 md:p-12 border-b border-slate-50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#1F4C63]/5 text-[#1F4C63] rounded-sm flex items-center justify-center">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-black uppercase text-slate-900 tracking-tight">Experience & Resume</CardTitle>
                    <p className="text-xs text-slate-600 font-semibold mt-1">This step is completely optional. You can skip if you want.</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 sm:p-10 md:p-12 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">Tell us about any previous experience (Optional)</label>
                  <textarea
                    value={previousExperience}
                    onChange={(e) => setPreviousExperience(e.target.value)}
                    placeholder="E.g., tutee support, neighborhood cleanups, school clubs, community events..."
                    className="w-full h-32 p-4 text-sm border-2 border-slate-100 rounded-sm focus:border-[#1F4C63] focus:ring-0 resize-none font-medium text-slate-700 outline-none placeholder-slate-300"
                  />
                </div>
                
                <FileUpload
                  label="Upload Your Resume (Optional, PDF format under 500KB)"
                  onFileSelect={(base64, fileName) => {
                    setResumeBase64(base64 || '');
                    setResumeFileName(fileName || '');
                  }}
                  currentFileName={resumeFileName}
                  accept=".pdf"
                  maxSizeMB={0.5}
                />
              </CardContent>
            </Card>
          )}

          {/* Navigation Controls */}
          <div className="flex items-center justify-between mt-8 p-4 bg-white/70 backdrop-blur-md rounded-sm  border border-slate-100 max-w-2xl mx-auto">
            {step > 1 ? (
              <Button 
                variant="outline" 
                onClick={handlePrevStep}
                className="h-12 px-6 rounded-sm font-bold uppercase text-[10px] tracking-widest text-slate-600 hover:bg-slate-50"
              >
                Go Back
              </Button>
            ) : (
              <div />
            )}

            {step < 5 ? (
              <Button 
                onClick={handleNextStep}
                className="h-12 bg-[#1F4C63] hover:bg-[#1F4C63] text-white px-8 rounded-sm font-black uppercase text-[10px] tracking-widest gap-2"
              >
                Continue <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                <Button 
                  onClick={(e) => handleSubmit(e as any, true)}
                  variant="outline" 
                  className="h-12 px-6 rounded-sm font-bold uppercase text-[10px] tracking-widest text-slate-600 hover:bg-slate-50 border border-slate-200 cursor-pointer animate-pulse"
                >
                  Skip & Onboard
                </Button>
                <Button 
                  onClick={(e) => handleSubmit(e as any, false)}
                  isLoading={isSubmitting}
                  className="h-12 bg-[#E08A3C] hover:bg-[#E08A3C] text-white px-10 rounded-sm font-black uppercase text-[10px] tracking-widest gap-2  shadow-orange-500/10"
                >
                  Complete Onboarding <Check className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
