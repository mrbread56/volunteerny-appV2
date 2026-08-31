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
  School as SchoolIcon, 
  Sparkles, 
  Calendar, 
  Award, 
  FileText, 
  Check, 
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { TORONTO_SCHOOLS, NEIGHBORHOODS } from '../constants';
import { SKILLS, AVAILABILITY } from '../lib/vocabularies';
import { OPPORTUNITY_CATEGORIES as INTERESTS } from '../constants';

const GRADES = [
  { value: '9', label: 'Grade 9' },
  { value: '10', label: 'Grade 10' },
  { value: '11', label: 'Grade 11' },
  { value: '12', label: 'Grade 12' },
];




export default function StudentOnboarding() {
  const { user, studentProfile, refreshProfile, isDemoMode, logout } = useAuth();
  const navigate = useNavigate();
  
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fields state
  const [fullName, setFullName] = useState(studentProfile?.fullName || user?.displayName || '');
  const [school, setSchool] = useState('');
  const [grade, setGrade] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [availability, setAvailability] = useState<string[]>([]);
  const [previousExperience, setPreviousExperience] = useState('');
  const [resumeBase64, setResumeBase64] = useState('');
  const [resumeFileName, setResumeFileName] = useState('');
  const [leaderboardConsent, setLeaderboardConsent] = useState(false);

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
      if (!school) return "Academic School is required";
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

    const finalProfileData = {
      uid: user.uid,
      fullName: fullName.trim(),
      school: school,
      grade,
      neighborhood,
      interests,
      skills,
      availability,
      previousExperience: skipFields ? '' : previousExperience.trim(),
      resumeUrl: (skipFields || !resumeBase64) ? '' : resumeBase64,
      trackerEnabled: leaderboardConsent,
      trackerAnonymous: false,
      // Deliberately NOT loggedHours. Verified hours are written only by the
      // organization that supervised them, and the students update rule enforces
      // that by rejecting any owner write whose diff touches loggedHours. Signup
      // does not create the field, so merging `loggedHours: []` here ADDED it to
      // the diff and every onboarding submission was denied with
      // "Missing or insufficient permissions". Readers already treat an absent
      // value as [].
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
      setError(
        err?.code === 'permission-denied'
          ? "We couldn't save your details. Please refresh and try again — if it keeps happening, contact support."
          : "We couldn't save your details. Please check your connection and try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper-2 py-12 px-6 flex flex-col justify-center items-center">
      {/* A way OUT. This route is wrapped in no layout at all — no navbar, no
          sidebar, no sign out, no links — and all four steps are mandatory, so
          a student whose save kept failing sat on a page with nothing but the
          browser URL bar, and the dashboard sends them straight back here. */}
      <div className="w-full max-w-3xl flex justify-end mb-4 gap-4 text-xs">
        <a
          href="mailto:privacy@volunteernorthyork.indevs.in"
          className="text-ink-muted hover:text-ink underline underline-offset-2"
        >
          Get help
        </a>
        <button
          type="button"
          onClick={() => { void logout(); }}
          className="text-ink-muted hover:text-ink underline underline-offset-2"
        >
          Sign out
        </button>
      </div>
      <div className="w-full max-w-3xl space-y-8 animate-fadeIn">
        <div className="text-center space-y-3">
          <span className="text-xs font-bold tracking-widest uppercase text-blue-dark bg-blue-dark/5 px-3.5 py-1.5 rounded-lg border border-blue-dark/10">
            Initial Account Onboarding
          </span>
          <h1 className="text-4xl md:text-5xl font-bold text-ink tracking-tight leading-none">
            Complete Your Student Profile
          </h1>
          <p className="text-ink-muted font-medium text-sm max-w-md mx-auto leading-relaxed">
            Tell us your school, what you are interested in, and when you are free. We use it to sort opportunities so the ones near you and close to your interests come first.
          </p>
        </div>

        {/* High-contrast Progress Bar */}
        <div className="grid grid-cols-5 gap-3 max-w-xl mx-auto">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex flex-col items-center space-y-2">
              <div className={cn(
                "h-2 w-full rounded-lg transition-all duration-300",
                step >= i ? "bg-blue-dark" : "bg-slate-200"
              )} />
              <span className={cn(
                "text-xs font-semibold uppercase hidden sm:block",
                step === i ? "text-blue-dark" : "text-ink-muted"
              )}>
                Step {i}
              </span>
            </div>
          ))}
        </div>

        {/* role="alert" is what makes this reach a screen reader. Without it
            the message renders and is announced to nobody: a blind student
            presses Continue, the step does not advance, and there is no
            indication why. Login and Signup already do this; onboarding was the
            outlier. The shake animation carries the same information visually,
            which is exactly why the non-visual channel has to be explicit. */}
        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-3 text-xs font-bold max-w-xl mx-auto animate-shake"
          >
            <ShieldAlert className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* Core Wizard Cards */}
        <div className="max-w-2xl mx-auto">
          {/* Step 1: Academic Identity */}
          {step === 1 && (
            <Card className="rounded-lg border-none  bg-white shadow-card">
              <CardHeader className="p-5 sm:p-10 md:p-12 border-b border-slate-50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-dark/5 text-blue-dark rounded-lg flex items-center justify-center">
                    <SchoolIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold uppercase text-ink tracking-tight">School Details</CardTitle>
                    <p className="text-xs text-ink-muted font-semibold mt-1">Specify your schooling details and current neighborhood.</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 sm:p-10 md:p-12 space-y-8">
                <div className="space-y-2.5">
                  <label className="text-xs font-bold text-ink-muted uppercase tracking-widest pl-1">Full Name</label>
                  <Input aria-label="Full Name" 
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your legal first and last name"
                    className="h-14 rounded-lg bg-paper-2 border-line-light font-bold focus:bg-white"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2.5">
                    <label className="text-xs font-bold text-ink-muted uppercase tracking-widest pl-1">Academic High School</label>
                    <Select aria-label="Academic High School" 
                      value={school}
                      onChange={(e) => setSchool(e.target.value)}
                      options={[
                        { value: '', label: 'Select your high school' },
                        ...TORONTO_SCHOOLS.map(s => ({ value: s, label: s }))
                      ]}
                      className="h-14 rounded-lg bg-paper-2 border-line-light font-bold"
                    />
                  </div>

                  <div className="space-y-2.5">
                    <label className="text-xs font-bold text-ink-muted uppercase tracking-widest pl-1">Grade Level</label>
                    <Select aria-label="Grade Level" 
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                      options={[
                        { value: '', label: 'Select Grade' },
                        ...GRADES
                      ]}
                      className="h-14 rounded-lg bg-paper-2 border-line-light font-bold"
                    />
                  </div>
                </div>

                <div className="space-y-2.5">
                  <label className="text-xs font-bold text-ink-muted uppercase tracking-widest pl-1">Your Neighborhood</label>
                  <Select aria-label="Your Neighborhood" 
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    options={[
                      { value: '', label: 'Select nearest Toronto neighborhood' },
                      ...NEIGHBORHOODS.map(n => ({ value: n, label: n }))
                    ]}
                    className="h-14 rounded-lg bg-paper-2 border-line-light font-bold"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Interests */}
          {step === 2 && (
            <Card className="rounded-lg border-none  bg-white shadow-card">
              <CardHeader className="p-5 sm:p-10 md:p-12 border-b border-slate-50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-dark/5 text-blue-dark rounded-lg flex items-center justify-center">
                    <Award className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold uppercase text-ink tracking-tight">Causes & Passions</CardTitle>
                    <p className="text-xs text-ink-muted font-semibold mt-1">Select the main cause categories that interest you.</p>
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
                        "px-6 py-3.5 rounded-lg text-xs font-semibold uppercase border-2 transition-all duration-200",
                        interests.includes(item)
                          ? "bg-slate-900 border-slate-900 text-white scale-105 "
                          : "bg-white border-line-light text-ink-muted hover:border-slate-300 hover:text-ink-soft"
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
            <Card className="rounded-lg border-none  bg-white shadow-card">
              <CardHeader className="p-5 sm:p-10 md:p-12 border-b border-slate-50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-dark/5 text-blue-dark rounded-lg flex items-center justify-center">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold uppercase text-ink tracking-tight">Your Core Skills</CardTitle>
                    <p className="text-xs text-ink-muted font-semibold mt-1">Choose the specific skillsets/contributions you bring.</p>
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
                        "px-6 py-3.5 rounded-lg text-xs font-semibold uppercase border-2 transition-all duration-200",
                        skills.includes(item)
                          ? "bg-blue-dark border-blue-dark text-white scale-105 "
                          : "bg-white border-line-light text-ink-muted hover:border-slate-300 hover:text-blue-dark"
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
            <Card className="rounded-lg border-none  bg-white shadow-card">
              <CardHeader className="p-5 sm:p-10 md:p-12 border-b border-slate-50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-dark/5 text-blue-dark rounded-lg flex items-center justify-center">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold uppercase text-ink tracking-tight">Time Availability</CardTitle>
                    <p className="text-xs text-ink-muted font-semibold mt-1">When can you usually join community placements?</p>
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
                        "p-5 rounded-lg text-xs font-bold text-left border-2 transition-all flex items-center justify-between",
                        availability.includes(item)
                          ? "bg-amber/10 border-amber text-orange-900 "
                          : "bg-white border-line-light text-ink-muted hover:border-line"
                      )}
                    >
                      <span>{item}</span>
                      {availability.includes(item) && <Check className="w-4 h-4 text-amber-dark shrink-0" />}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 5: Optional Experience & Resume */}
          {step === 5 && (
            <Card className="rounded-lg border-none  bg-white shadow-card">
              <CardHeader className="p-5 sm:p-10 md:p-12 border-b border-slate-50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-dark/5 text-blue-dark rounded-lg flex items-center justify-center">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold uppercase text-ink tracking-tight">Experience & Resume</CardTitle>
                    <p className="text-xs text-ink-muted font-semibold mt-1">This step is completely optional. You can skip if you want.</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 sm:p-10 md:p-12 space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-ink-muted uppercase tracking-widest ml-2">Tell us about any previous experience (Optional)</label>
                  <textarea
                    value={previousExperience}
                    onChange={(e) => setPreviousExperience(e.target.value)}
                    placeholder="E.g., tutee support, neighborhood cleanups, school clubs, community events..."
                    className="w-full h-32 p-4 text-sm border-2 border-line-light rounded-lg focus:border-blue-dark focus:ring-0 resize-none font-medium text-ink-soft outline-none placeholder:text-ink-muted"
                  />
                </div>

                <div className="flex items-start gap-3 p-4 bg-blue-50/50 rounded-lg border border-blue-100">
                  <input
                    type="checkbox"
                    id="leaderboardConsent"
                    checked={leaderboardConsent}
                    onChange={(e) => setLeaderboardConsent(e.target.checked)}
                    className="mt-1 shrink-0 w-4 h-4 rounded border-slate-300 text-blue-dark focus:ring-blue-dark"
                  />
                  <label htmlFor="leaderboardConsent" className="text-sm text-ink-soft leading-relaxed">
                    <span className="font-bold text-ink block mb-0.5">Leaderboard Participation</span>
                    I consent to having my name and verified volunteer hours displayed on the public Volunteer North York Leaderboard. I understand this is optional and I can change this later in my Profile.
                  </label>
                </div>
                
                <FileUpload
                  label="Upload Your Resume (Optional, PDF)"
                  storagePath={`students/${user?.uid}`}
                  onFileSelect={(url, fileName) => {
                    setResumeBase64(url || '');
                    setResumeFileName(fileName || '');
                  }}
                  currentFileName={resumeFileName}
                  accept=".pdf"
                  maxSizeMB={5}
                />
              </CardContent>
            </Card>
          )}

          {/* Navigation Controls */}
          <div className="flex items-center justify-between mt-8 p-4 bg-white/70 backdrop-blur-md rounded-lg border border-line-light max-w-2xl mx-auto">
            {step > 1 ? (
              <Button 
                variant="outline" 
                onClick={handlePrevStep}
                className="h-12 px-6 rounded-lg font-bold uppercase text-xs tracking-widest text-ink-muted hover:bg-paper-2"
              >
                Go Back
              </Button>
            ) : (
              <div />
            )}

            {step < 5 ? (
              <Button 
                onClick={handleNextStep}
                className="h-12 bg-blue-dark hover:bg-blue-dark text-white px-8 rounded-lg font-bold uppercase text-xs tracking-widest gap-2"
              >
                Continue <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                {/* disabled while submitting, like its sibling below.
                    handleSubmit(_, true) writes previousExperience: '' and
                    resumeUrl: '', so pressing this while "Complete Onboarding"
                    is still in flight erases the resume just uploaded. */}
                <Button 
                  onClick={(e) => handleSubmit(e as any, true)}
                  disabled={isSubmitting}
                  variant="outline" 
                  className="h-12 px-6 rounded-lg font-bold uppercase text-xs tracking-widest text-ink-muted hover:bg-paper-2 border border-line cursor-pointer animate-pulse"
                >
                  Skip this step and finish
                </Button>
                <Button 
                  onClick={(e) => handleSubmit(e as any, false)}
                  isLoading={isSubmitting}
                  className="h-12 bg-amber-dark hover:bg-amber-dark text-white px-10 rounded-lg font-bold uppercase text-xs tracking-widest gap-2 "
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
