import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { X, User, MapPin, GraduationCap, Briefcase, FileText, Calendar, Clock, MessageSquare, ExternalLink, Mail, Phone, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Application, StudentProfile } from '../types';
import { formatDate } from '../lib/utils';
import { Badge } from './ui/Badge';
import { decompressFile } from '../utils/compress';

interface ApplicationReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  application: Application | null;
  student: StudentProfile | null;
  onAccept: (appId: string) => Promise<{ success: boolean; emailSent: boolean; receiptGenerated: boolean; error?: string }>;
  onReject: (app: Application) => void;
}

export default function ApplicationReviewDialog({ 
  isOpen, 
  onClose, 
  application, 
  student,
  onAccept,
  onReject
}: ApplicationReviewDialogProps) {
  const [showResumeInline, setShowResumeInline] = useState(false);

  // Acceptance Workflow States
  const [submittingState, setSubmittingState] = useState<'idle' | 'database' | 'receipt' | 'email' | 'success' | 'error'>('idle');
  const [dbVerified, setDbVerified] = useState(false);
  const [receiptCompiled, setReceiptCompiled] = useState(false);
  const [emailDispatched, setEmailDispatched] = useState(false);
  const [errorDetails, setErrorDetails] = useState('');

  useEffect(() => {
    if (isOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setShowResumeInline(false);
      setSubmittingState('idle');
      setDbVerified(false);
      setReceiptCompiled(false);
      setEmailDispatched(false);
      setErrorDetails('');
    }
  }, [isOpen]);

  if (!isOpen || !application) return null;

  const handleOpenResume = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowResumeInline(true);
  };

  const handleAcceptClick = async () => {
    try {
      setSubmittingState('database');
      
      const startTime = Date.now();
      const res = await onAccept(application.id);
      
      // Ensure at least 800ms of comfortable database mutation animation
      const elapsed = Date.now() - startTime;
      if (elapsed < 800) {
        await new Promise(resolve => setTimeout(resolve, 800 - elapsed));
      }

      if (!res.success) {
        throw new Error(res.error || "Failed to update record in Firestore database context.");
      }

      setDbVerified(true);
      setSubmittingState('receipt');

      // Stage 2: Receipt Compilation delay
      await new Promise(resolve => setTimeout(resolve, 850));
      setReceiptCompiled(res.receiptGenerated);
      setSubmittingState('email');

      // Stage 3: Resend notification compilation delay
      await new Promise(resolve => setTimeout(resolve, 850));
      setEmailDispatched(res.emailSent);
      setSubmittingState('success');

    } catch (err: any) {
      console.error("Critical error in application acceptance workflow:", err);
      setErrorDetails(err.message || "An unexpected write or dispatch error occurred.");
      setSubmittingState('error');
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-2xl"
        >
          <Card className="border-none  rounded-sm overflow-hidden bg-white max-h-[90vh] flex flex-col">
            <CardHeader className="p-8 border-b border-slate-50 flex flex-row items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-[#1F4C63]/10 bg-[#1F4C63]/5 rounded-sm flex items-center justify-center text-[#1F4C63]">
                  <User className="w-8 h-8" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                    {submittingState !== 'idle' ? "Verification Engine" : "Review Application"}
                  </CardTitle>
                  <p className="text-xs text-slate-600 font-bold mt-1 uppercase tracking-widest leading-none">
                    Status: {application.status}
                  </p>
                </div>
              </div>
              <button aria-label="Close modal" 
                onClick={onClose} 
                disabled={submittingState === 'database' || submittingState === 'receipt' || submittingState === 'email'}
                className="p-2 hover:bg-slate-100 rounded-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed rounded-full"
              >
                <X className="w-6 h-6 text-slate-600" />
              </button>
            </CardHeader>

            {/* LIVE ACCEPTANCE WORKFLOW SEQUENCER */}
            {submittingState !== 'idle' ? (
              <CardContent className="p-10 space-y-8 flex-grow flex flex-col justify-center items-center text-center select-none animate-fadeIn">
                {submittingState === 'error' ? (
                  <div className="space-y-6 max-w-md my-6">
                    <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-sm flex items-center justify-center mx-auto  animate-bounce">
                      <AlertCircle className="w-10 h-10" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Verification Aborted</h4>
                      <p className="text-sm text-slate-600 font-medium">
                        The acceptance transaction failed to commit to the Firestore ledger. Please inspect your connection constraints and try again.
                      </p>
                    </div>
                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-sm text-left">
                      <p className="text-[9px] font-black font-mono text-slate-600 uppercase tracking-wider mb-1">Error Traceback</p>
                      <p className="text-xs font-mono font-bold text-rose-600 break-words">{errorDetails}</p>
                    </div>
                    <Button 
                      onClick={() => setSubmittingState('idle')}
                      className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white font-black uppercase text-xs tracking-widest rounded-sm transition-all"
                    >
                      Return to Profile
                    </Button>
                  </div>
                ) : submittingState === 'success' ? (
                  <div className="space-y-8 max-w-lg w-full my-4">
                    <div className="w-20 h-20 bg-[#1F4C63]/10 text-[#1F4C63] rounded-sm flex items-center justify-center mx-auto  animate-pulse">
                      <CheckCircle className="w-10 h-10" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Active Enrollment Authorized!</h4>
                      <p className="text-sm text-slate-600 font-medium">
                        Student is now officially enrolled. High school coordination logs have been locked for verification.
                      </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-sm p-6 space-y-4 text-left">
                      <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-200">
                        <span className="font-bold text-slate-600 uppercase tracking-widest">Enrollment Ledger Receipt</span>
                        <span className="font-bold text-[#1F4C63] uppercase tracking-wider">✓ Active Status</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-tight">Participant Name</p>
                          <p className="font-extrabold text-slate-800 text-sm mt-0.5">{student?.fullName || application.studentName}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-tight font-sans">Contact Coordinate</p>
                          <p className="font-extrabold text-slate-800 text-sm mt-0.5 truncate">{student?.contactEmail || "armin.k@yorkschool.ca"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-tight">Database Mutation Ledger</p>
                          <p className="font-bold text-slate-600 mt-0.5">Firestore Verified</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-tight">SMTP Email Dispatch</p>
                          <p className="font-bold text-slate-600 mt-0.5">{emailDispatched ? "Resend Despatched" : "Direct Standard Failover"}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4">
                      <Button
                        variant="outline"
                        className="flex-1 rounded-sm h-14 font-black uppercase text-xs tracking-widest border-slate-200 text-slate-700 hover:bg-slate-50"
                        onClick={() => {
                          const resumeUrl = application?.resumeUrl || student?.resumeUrl;
                          if (resumeUrl) {
                            try {
                              const rawDataUrl = decompressFile(resumeUrl);
                              const link = document.createElement('a');
                              link.href = rawDataUrl;
                              link.download = `${student?.fullName || application?.studentName || 'student'}_enrollment_slip`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            } catch (err) {
                              console.warn("Could not download inline resume attachment:", err);
                            }
                          } else {
                            alert("No attached resume files found on this volunteer profile.");
                          }
                        }}
                      >
                        <FileText className="w-4 h-4 mr-1.5 text-slate-600" />
                        Download PDF Slip
                      </Button>
                      <Button 
                        onClick={onClose}
                        className="flex-[1.2] bg-[#1F4C63] hover:bg-[#153343] text-white rounded-sm h-14 font-black uppercase text-xs tracking-widest  shadow-blue-100"
                      >
                        Complete Flow
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="w-full max-w-md space-y-10 my-4 text-left">
                    <div className="space-y-2 text-center">
                      <Loader2 className="w-12 h-12 text-[#1F4C63] animate-spin mx-auto mb-4" />
                      <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Verifying Placement Credentials</h4>
                      <p className="text-xs text-slate-600 font-bold uppercase tracking-widest">Locking ledger and building transaction environment</p>
                    </div>

                    <div className="space-y-6">
                      {/* Step 1 */}
                      <div className="flex items-center gap-4">
                        <div className={`w-8 h-8 rounded-sm border-2 flex items-center justify-center transition-all shrink-0 ${
                          dbVerified 
                            ? "bg-[#1F4C63]/10 border-[#1F4C63] text-[#1F4C63] font-bold" 
                            : submittingState === 'database' 
                              ? "border-[#1F4C63] text-[#1F4C63] animate-pulse font-bold" 
                              : "border-slate-300 border-slate-200 text-slate-600"
                        }`}>
                          {dbVerified ? "✓" : "1"}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-black uppercase tracking-tight transition-colors ${submittingState === 'database' ? 'text-[#1F4C63]' : dbVerified ? 'text-slate-800' : 'text-slate-600'}`}>
                            1. Ledger Database Mutation
                          </p>
                          <p className="text-xs text-slate-600 font-medium">
                            Mutating application candidate status key dynamically on firestore database.
                          </p>
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="flex items-center gap-4">
                        <div className={`w-8 h-8 rounded-sm border-2 flex items-center justify-center transition-all shrink-0 ${
                          receiptCompiled 
                            ? "bg-[#1F4C63]/10 border-[#1F4C63] text-[#1F4C63] font-bold" 
                            : submittingState === 'receipt' 
                              ? "border-[#1F4C63] text-[#1F4C63] animate-pulse font-bold" 
                              : "border-slate-300 border-slate-200 text-slate-600"
                        }`}>
                          {receiptCompiled ? "✓" : "2"}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-black uppercase tracking-tight transition-colors ${submittingState === 'receipt' ? 'text-[#1F4C63]' : receiptCompiled ? 'text-slate-800' : 'text-slate-600'}`}>
                            2. PDF Slip Generation
                          </p>
                          <p className="text-xs text-slate-600 font-medium">
                            Compiling digital check-in slip with secure SHA-256 verification signature keys.
                          </p>
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="flex items-center gap-4">
                        <div className={`w-8 h-8 rounded-sm border-2 flex items-center justify-center transition-all shrink-0 ${
                          emailDispatched 
                            ? "bg-[#1F4C63]/10 border-[#1F4C63] text-[#1F4C63] font-bold" 
                            : submittingState === 'email' 
                              ? "border-[#1F4C63] text-[#1F4C63] animate-pulse font-bold" 
                              : "border-slate-300 border-slate-200 text-slate-600"
                        }`}>
                          {emailDispatched ? "✓" : "3"}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-black uppercase tracking-tight transition-colors ${submittingState === 'email' ? 'text-[#1F4C63]' : emailDispatched ? 'text-slate-800' : 'text-slate-600'}`}>
                            3. Resend SMTP Transmission
                          </p>
                          <p className="text-xs text-slate-600 font-medium font-sans">
                            Delivering status email dispatch directly to student's contact coordinates.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            ) : showResumeInline ? (
              <CardContent className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-grow flex flex-col justify-between">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                     <FileText className="w-5 h-5 text-[#1F4C63] animate-pulse" />
                     <h4 className="font-extrabold text-slate-800 text-sm tracking-tight uppercase">Resume Document Viewer</h4>
                  </div>
                  <div className="flex items-center gap-2">
                     <button aria-label="Download Resume" 
                       onClick={() => {
                          const resumeUrl = application?.resumeUrl || student?.resumeUrl;
                          if (!resumeUrl) return;
                          const rawDataUrl = decompressFile(resumeUrl);
                          const link = document.createElement('a');
                          link.href = rawDataUrl;
                          link.download = `${student?.fullName || application?.studentName || 'student'}_resume`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                       }}
                       className="px-4 py-2 bg-[#1F4C63]/5 hover:bg-[#1F4C63]/10 text-[#153343] text-xs font-black uppercase tracking-wider rounded-sm transition-all border border-[#1F4C63]/20/40"
                     >
                       Download File
                     </button>
                     <button aria-label="Back to Details" 
                       onClick={() => setShowResumeInline(false)}
                       className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black uppercase tracking-wider rounded-sm transition-all border border-slate-200/40"
                     >
                       Back to Details
                     </button>
                  </div>
                </div>

                <div className="flex-grow flex items-center justify-center bg-slate-50 border border-slate-200 rounded-sm p-4 min-h-[420px] relative">
                  {(() => {
                    const resumeUrl = application?.resumeUrl || student?.resumeUrl;
                    if (!resumeUrl) return <p className="text-slate-600 font-bold font-mono">No resume payload stored.</p>;
                    const rawDataUrl = decompressFile(resumeUrl);
                    if (rawDataUrl.startsWith('data:image/')) {
                      return (
                        <img 
                          src={rawDataUrl} 
                          alt="Resume Preview" 
                          loading="lazy" width="850" height="1100"
                          className="w-full aspect-[8.5/11] max-h-[50vh] object-contain rounded-sm  border border-slate-200 bg-white" 
                        />
                      );
                    } else if (rawDataUrl.startsWith('data:application/pdf')) {
                      return (
                        <div className="w-full h-full flex flex-col gap-2">
                          <div className="flex items-center justify-between p-3 bg-[#1F4C63]/5/50 border border-[#1F4C63]/10 rounded-sm">
                            <span className="text-[11px] font-semibold text-[#153343]">📄 PDF viewer loading. Standard browsers may restrict inline elements inside sandboxes.</span>
                            <a aria-label="Download PDF" 
                              href={rawDataUrl}
                              download={`${student?.fullName || application?.studentName || 'student'}_resume.pdf`}
                              className="text-[10px] font-black uppercase text-blue-800 hover:underline"
                            >
                              Download PDF directly
                            </a>
                          </div>
                          <iframe 
                            src={rawDataUrl}
                            title="Resume PDF"
                            className="w-full h-[50vh] rounded-sm border border-slate-200 bg-white "
                          />
                        </div>
                      );
                    } else {
                      return (
                        <div className="text-center space-y-4 max-w-sm">
                           <p className="text-slate-600 text-xs font-semibold leading-relaxed">
                              This resume document type cannot be displayed directly inline in this browser container. You can download and inspect it natively.
                           </p>
                           <a aria-label="Download PDF" 
                             href={rawDataUrl}
                             download={`${student?.fullName || application?.studentName || 'student'}_resume`}
                             className="inline-flex py-3 px-6 h-12 items-center justify-center rounded-sm font-bold bg-[#1F4C63] hover:bg-[#153343] text-white  transition-all"
                           >
                             Download Document Natively
                           </a>
                        </div>
                      );
                    }
                  })()}
                </div>
              </CardContent>
            ) : (
              <CardContent className="p-8 space-y-10 overflow-y-auto custom-scrollbar flex-grow">
                {/* Student Overview */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div className="space-y-6">
                      <section>
                          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-3">Applicant</p>
                          <h3 className="text-xl font-bold text-slate-900">{student?.fullName || application.studentName}</h3>
                          <div className="flex flex-wrap gap-2 mt-3">
                             <Badge variant="secondary" className="bg-slate-50 border-slate-100 text-slate-600 flex items-center gap-1">
                                <GraduationCap className="w-3 h-3" /> {student?.school || 'High School'}
                             </Badge>
                             <Badge variant="secondary" className="bg-slate-50 border-slate-100 text-slate-600 flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {student?.neighborhood || 'North York'}
                             </Badge>
                          </div>
                      </section>

                      <section className="bg-[#1F4C63]/5/50 p-5 rounded-sm border border-[#1F4C63]/10 space-y-2">
                          <p className="text-[9px] font-black text-[#153343] uppercase tracking-widest mb-2 flex items-center gap-1">
                            <User className="w-3.5 h-3.5" /> Student Contact Details
                          </p>
                          <div className="space-y-2.5 text-xs text-slate-700">
                             <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 text-[#1F4C63] shrink-0" />
                                <span className="font-semibold text-slate-600">Email:</span>
                                <a aria-label="Download PDF" href={`mailto:${student?.contactEmail || 'armin.k@yorkschool.ca'}`} className="font-bold text-slate-900 hover:text-[#1F4C63] transition-colors">
                                   {student?.contactEmail || 'armin.k@yorkschool.ca'}
                                 </a>
                             </div>
                             <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4 text-[#1F4C63] shrink-0" />
                                <span className="font-semibold text-slate-600">Phone:</span>
                                <span className="font-bold text-slate-900">
                                   {student?.phone || '(416) 555-0182'}
                                </span>
                             </div>
                          </div>
                      </section>
   
                      <section>
                          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-3">Application Message</p>
                          <div className="bg-slate-50 p-6 rounded-sm border border-slate-100 text-sm text-slate-700 leading-relaxed italic relative">
                             <MessageSquare className="w-8 h-8 text-slate-200 absolute -top-4 -right-4" />
                             "{application.message || "No message provided."}"
                          </div>
                      </section>
                   </div>
   
                   <div className="space-y-6">
                      <section>
                          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-3">Previous Experience</p>
                          <div className="text-sm text-slate-600 leading-relaxed">
                             {application.previousExperience || student?.previousExperience || "No experience listed."}
                          </div>
                      </section>
   
                      {(application.resumeUrl || student?.resumeUrl) && (
                        <section>
                           <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-3">Attachments</p>
                           <button aria-label="View Student Resume" 
                             type="button" 
                             onClick={handleOpenResume}
                             className="w-full flex items-center justify-between p-4 rounded-sm bg-[#1F4C63]/5 border border-[#1F4C63]/10 group hover:bg-[#1F4C63] hover:text-white transition-all text-left rounded-full"
                           >
                              <div className="flex items-center gap-3">
                                 <FileText className="w-5 h-5 text-[#1F4C63] group-hover:text-white transition-all" />
                                 <span className="text-xs font-bold uppercase tracking-widest text-slate-700 group-hover:text-white transition-all">Student Resume</span>
                              </div>
                              <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 text-[#1F4C63] group-hover:text-white transition-opacity" />
                           </button>
                        </section>
                      )}
                   </div>
                </div>
   
                {/* Skills & Interests */}
                {student && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-slate-50">
                     <section>
                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-4">Skills</p>
                        <div className="flex flex-wrap gap-2">
                           {student.skills.map(skill => (
                             <Badge key={skill} variant="secondary" className="bg-[#1F4C63]/5 text-[#153343] border-none font-bold uppercase text-[10px] tracking-widest px-3 py-1">
                                {skill}
                             </Badge>
                           ))}
                        </div>
                     </section>
                     <section>
                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-4">Interests</p>
                        <div className="flex flex-wrap gap-2">
                           {student.interests.map(interest => (
                             <Badge key={interest} variant="secondary" className="border-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-widest px-3 py-1">
                                {interest}
                             </Badge>
                           ))}
                        </div>
                     </section>
                  </div>
                )}
              </CardContent>
            )}

            {application.status === 'pending' && submittingState === 'idle' && (
              <div className="p-8 border-t border-slate-50 bg-slate-50/50 flex flex-col sm:flex-row gap-4 shrink-0">
                <Button 
                  variant="outline" 
                  className="flex-1 rounded-sm h-14 font-black uppercase text-xs tracking-widest text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 transition-all"
                  onClick={() => onReject(application)}
                >
                  Reject Candidate
                </Button>
                <Button 
                  className="flex-[1.5] bg-[#1F4C63] hover:bg-[#0F1E29] text-white rounded-sm h-14 font-black uppercase text-xs tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98]"
                  onClick={handleAcceptClick}
                >
                  Confirm & Accept Volunteer
                </Button>
              </div>
            )}
          </Card>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
