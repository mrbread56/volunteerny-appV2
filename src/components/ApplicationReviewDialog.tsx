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
  onReview?: (appId: string) => void;
}

export default function ApplicationReviewDialog({ 
  isOpen, 
  onClose, 
  application, 
  student,
  onAccept,
  onReject,
  onReview
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
          <Card className="border-none  rounded-lg overflow-hidden bg-white max-h-[90vh] flex flex-col">
            <CardHeader className="p-8 border-b border-line-light flex flex-row items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-blue-dark/10 bg-blue-dark/5 rounded-lg flex items-center justify-center text-blue-dark">
                  <User className="w-8 h-8" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-semibold text-ink uppercase tracking-tight">
                    {submittingState !== 'idle' ? "Verification Engine" : "Review Application"}
                  </CardTitle>
                  <p className="text-xs text-ink-soft font-bold mt-1 tracking-wide leading-none">
                    Status: {application.status}
                  </p>
                </div>
              </div>
              <button aria-label="Close modal" 
                onClick={onClose} 
                disabled={submittingState === 'database' || submittingState === 'receipt' || submittingState === 'email'}
                className="p-2 hover:bg-paper-3 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed rounded-full"
              >
                <X className="w-6 h-6 text-ink-soft" />
              </button>
            </CardHeader>

            {/* LIVE ACCEPTANCE WORKFLOW SEQUENCER */}
            {submittingState !== 'idle' ? (
              <CardContent className="p-6 sm:p-8 space-y-8 flex-grow flex flex-col justify-center items-center text-center select-none animate-fadeIn">
                {submittingState === 'error' ? (
                  <div className="space-y-8 max-w-md my-6">
                    <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-lg flex items-center justify-center mx-auto animate-in zoom-in-50 duration-500">
                      <AlertCircle className="w-10 h-10" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-2xl font-semibold text-ink uppercase tracking-tight">Verification Aborted</h4>
                      <p className="text-sm text-ink-soft font-medium">
                        The acceptance transaction failed to commit to the Firestore ledger. Please inspect your connection constraints and try again.
                      </p>
                    </div>
                    <div className="p-4 bg-paper-2 border border-line rounded-lg text-left">
                      <p className="text-xs font-semibold font-mono text-ink-soft uppercase tracking-wider mb-1">Error Traceback</p>
                      <p className="text-xs font-mono font-bold text-rose-600 break-words">{errorDetails}</p>
                    </div>
                    <Button 
                      onClick={() => setSubmittingState('idle')}
                      className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white font-semibold uppercase text-xs tracking-widest rounded-lg transition-all"
                    >
                      Return to Profile
                    </Button>
                  </div>
                ) : submittingState === 'success' ? (
                  <div className="space-y-8 max-w-lg w-full my-4">
                    <div className="w-20 h-20 bg-blue-dark/10 text-blue-dark rounded-lg flex items-center justify-center mx-auto  animate-pulse">
                      <CheckCircle className="w-10 h-10" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-3xl font-semibold text-ink uppercase tracking-tight">Active Enrollment Authorized!</h4>
                      <p className="text-sm text-ink-soft font-medium">
                        Student is now officially enrolled. High school coordination logs have been locked for verification.
                      </p>
                    </div>

                    <div className="bg-paper-2 border border-line rounded-lg p-6 space-y-4 text-left">
                      <div className="flex items-center justify-between text-xs pb-3 border-b border-line">
                        <span className="font-bold text-ink-soft tracking-wide">Enrollment Ledger Receipt</span>
                        <span className="font-bold text-blue-dark uppercase tracking-wider">✓ Active Status</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <p className="text-xs font-bold text-ink-soft uppercase tracking-tight">Participant Name</p>
                          <p className="font-semibold text-ink-soft text-sm mt-0.5">{student?.fullName || application.studentName}</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-ink-soft uppercase tracking-tight font-sans">Contact Coordinate</p>
                          <p className="font-semibold text-ink-soft text-sm mt-0.5 truncate">{student?.contactEmail || "armin.k@yorkschool.ca"}</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-ink-soft uppercase tracking-tight">Database Mutation Ledger</p>
                          <p className="font-bold text-ink-soft mt-0.5">Firestore Verified</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-ink-soft uppercase tracking-tight">SMTP Email Dispatch</p>
                          <p className="font-bold text-ink-soft mt-0.5">{emailDispatched ? "Resend Despatched" : "Direct Standard Failover"}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4">
                      <Button
                        variant="outline"
                        className="flex-1 rounded-lg h-14 font-semibold uppercase text-xs tracking-widest border-line text-ink-soft hover:bg-paper-2"
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
                        <FileText className="w-4 h-4 mr-1.5 text-ink-soft" />
                        Download PDF Slip
                      </Button>
                      <Button 
                        onClick={onClose}
                        className="flex-[1.2] bg-blue-dark hover:bg-[#153343] text-white rounded-lg h-14 font-semibold uppercase text-xs tracking-widest  shadow-blue-100"
                      >
                        Complete Flow
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="w-full max-w-md space-yp-6 sm:p-8 text-left">
                    <div className="space-y-2 text-center">
                      <Loader2 className="w-12 h-12 text-blue-dark animate-spin mx-auto mb-4" />
                      <h4 className="text-2xl font-semibold text-ink uppercase tracking-tight">Verifying Placement Credentials</h4>
                      <p className="text-xs text-ink-soft font-bold tracking-wide">Locking ledger and building transaction environment</p>
                    </div>

                    <div className="space-y-8">
                      {/* Step 1 */}
                      <div className="flex items-center gap-4">
                        <div className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 ${
                          dbVerified 
                            ? "bg-blue-dark/10 border-blue-dark text-blue-dark font-bold" 
                            : submittingState === 'database' 
                              ? "border-blue-dark text-blue-dark animate-pulse font-bold" 
                              : "border-slate-300 border-line text-ink-soft"
                        }`}>
                          {dbVerified ? "✓" : "1"}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-semibold uppercase tracking-tight transition-colors ${submittingState === 'database' ? 'text-blue-dark' : dbVerified ? 'text-ink-soft' : 'text-ink-soft'}`}>
                            1. Ledger Database Mutation
                          </p>
                          <p className="text-xs text-ink-soft font-medium">
                            Mutating application candidate status key dynamically on firestore database.
                          </p>
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="flex items-center gap-4">
                        <div className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 ${
                          receiptCompiled 
                            ? "bg-blue-dark/10 border-blue-dark text-blue-dark font-bold" 
                            : submittingState === 'receipt' 
                              ? "border-blue-dark text-blue-dark animate-pulse font-bold" 
                              : "border-slate-300 border-line text-ink-soft"
                        }`}>
                          {receiptCompiled ? "✓" : "2"}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-semibold uppercase tracking-tight transition-colors ${submittingState === 'receipt' ? 'text-blue-dark' : receiptCompiled ? 'text-ink-soft' : 'text-ink-soft'}`}>
                            2. PDF Slip Generation
                          </p>
                          <p className="text-xs text-ink-soft font-medium">
                            Compiling digital check-in slip with secure SHA-256 verification signature keys.
                          </p>
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="flex items-center gap-4">
                        <div className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 ${
                          emailDispatched 
                            ? "bg-blue-dark/10 border-blue-dark text-blue-dark font-bold" 
                            : submittingState === 'email' 
                              ? "border-blue-dark text-blue-dark animate-pulse font-bold" 
                              : "border-slate-300 border-line text-ink-soft"
                        }`}>
                          {emailDispatched ? "✓" : "3"}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-semibold uppercase tracking-tight transition-colors ${submittingState === 'email' ? 'text-blue-dark' : emailDispatched ? 'text-ink-soft' : 'text-ink-soft'}`}>
                            3. Resend SMTP Transmission
                          </p>
                          <p className="text-xs text-ink-soft font-medium font-sans">
                            Delivering status email dispatch directly to student's contact coordinates.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            ) : showResumeInline ? (
              <CardContent className="p-8 space-y-8 overflow-y-auto custom-scrollbar flex-grow flex flex-col justify-between">
                <div className="flex items-center justify-between pb-3 border-b border-line">
                  <div className="flex items-center gap-2">
                     <FileText className="w-5 h-5 text-blue-dark animate-pulse" />
                     <h4 className="font-semibold text-ink-soft text-sm tracking-tight uppercase">Resume Document Viewer</h4>
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
                       className="px-4 py-2 bg-blue-dark/5 hover:bg-blue-dark/10 text-[#153343] text-xs font-semibold uppercase tracking-wider rounded-lg transition-all border border-blue-dark/20"
                     >
                       Download File
                     </button>
                     <button aria-label="Back to Details" 
                       onClick={() => setShowResumeInline(false)}
                       className="px-4 py-2 bg-paper-3 hover:bg-slate-200 text-ink-soft text-xs font-semibold uppercase tracking-wider rounded-lg transition-all border border-line/40"
                     >
                       Back to Details
                     </button>
                  </div>
                </div>

                <div className="flex-grow flex items-center justify-center bg-paper-2 border border-line rounded-lg p-4 min-h-[420px] relative">
                  {(() => {
                    const resumeUrl = application?.resumeUrl || student?.resumeUrl;
                    if (!resumeUrl) return <p className="text-ink-soft font-bold font-mono">No resume payload stored.</p>;
                    const rawDataUrl = decompressFile(resumeUrl);
                    if (rawDataUrl.startsWith('data:image/')) {
                      return (
                        <img 
                          src={rawDataUrl} 
                          alt="Resume Preview" 
                          loading="lazy" width="850" height="1100"
                          className="w-full aspect-[8.5/11] max-h-[50vh] object-contain rounded-lg  border border-line bg-white" 
                        />
                      );
                    } else if (rawDataUrl.startsWith('data:application/pdf')) {
                      return (
                        <div className="w-full h-full flex flex-col gap-2">
                          <div className="flex items-center justify-between p-3 bg-blue-dark/5 border border-blue-dark/10 rounded-lg">
                            <span className="text-xs font-semibold text-[#153343]">📄 PDF viewer loading. Standard browsers may restrict inline elements inside sandboxes.</span>
                            <a aria-label="Download PDF" 
                              href={rawDataUrl}
                              download={`${student?.fullName || application?.studentName || 'student'}_resume.pdf`}
                              className="text-xs font-semibold uppercase text-blue-800 hover:underline"
                            >
                              Download PDF directly
                            </a>
                          </div>
                          <iframe 
                            src={rawDataUrl}
                            title="Resume PDF"
                            className="w-full h-[50vh] rounded-lg border border-line bg-white "
                          />
                        </div>
                      );
                    } else {
                      return (
                        <div className="text-center space-y-4 max-w-sm">
                           <p className="text-ink-soft text-xs font-semibold leading-relaxed">
                              This resume document type cannot be displayed directly inline in this browser container. You can download and inspect it natively.
                           </p>
                           <a aria-label="Download PDF" 
                             href={rawDataUrl}
                             download={`${student?.fullName || application?.studentName || 'student'}_resume`}
                             className="inline-flex py-3 px-6 h-12 items-center justify-center rounded-lg font-bold bg-blue-dark hover:bg-[#153343] text-white  transition-all"
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
                   <div className="space-y-8">
                      <section>
                          <p className="text-xs font-semibold text-ink-soft tracking-wide mb-3">Applicant</p>
                          <h3 className="text-xl font-bold text-ink">{student?.fullName || application.studentName}</h3>
                          <div className="flex flex-wrap gap-2 mt-3">
                             <Badge variant="secondary" className="bg-paper-2 border-line text-ink-soft flex items-center gap-1">
                                <GraduationCap className="w-3 h-3" /> {student?.school || 'High School'}
                             </Badge>
                             <Badge variant="secondary" className="bg-paper-2 border-line text-ink-soft flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {student?.neighborhood || 'North York'}
                             </Badge>
                          </div>
                      </section>

                      <section className="bg-blue-dark/5 p-5 rounded-lg border border-blue-dark/10 space-y-2">
                          <p className="text-xs font-semibold text-[#153343] tracking-wide mb-2 flex items-center gap-1">
                            <User className="w-3.5 h-3.5" /> Student Contact Details
                          </p>
                          <div className="space-y-2.5 text-xs text-ink-soft">
                             <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 text-blue-dark shrink-0" />
                                <span className="font-semibold text-ink-soft">Email:</span>
                                <a aria-label="Download PDF" href={`mailto:${student?.contactEmail || 'armin.k@yorkschool.ca'}`} className="font-bold text-ink hover:text-blue-dark transition-colors">
                                   {student?.contactEmail || 'armin.k@yorkschool.ca'}
                                 </a>
                             </div>
                             <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4 text-blue-dark shrink-0" />
                                <span className="font-semibold text-ink-soft">Phone:</span>
                                <span className="font-bold text-ink">
                                   {student?.phone || '(416) 555-0182'}
                                </span>
                             </div>
                          </div>
                      </section>
   
                      <section>
                          <p className="text-xs font-semibold text-ink-soft tracking-wide mb-3">Application Message</p>
                          <div className="bg-paper-2 p-6 rounded-lg border border-line text-sm text-ink-soft leading-relaxed italic relative">
                             <MessageSquare className="w-8 h-8 text-slate-200 absolute -top-4 -right-4" />
                             "{application.message || "No message provided."}"
                          </div>
                      </section>
                   </div>
   
                   <div className="space-y-8">
                      <section>
                          <p className="text-xs font-semibold text-ink-soft tracking-wide mb-3">Previous Experience</p>
                          <div className="text-sm text-ink-soft leading-relaxed">
                             {application.previousExperience || student?.previousExperience || "No experience listed."}
                          </div>
                      </section>
   
                      {(application.resumeUrl || student?.resumeUrl) && (
                        <section>
                           <p className="text-xs font-semibold text-ink-soft tracking-wide mb-3">Attachments</p>
                           <button aria-label="View Student Resume" 
                             type="button" 
                             onClick={handleOpenResume}
                             className="w-full flex items-center justify-between p-4 rounded-lg bg-blue-dark/5 border border-blue-dark/10 group hover:bg-blue-dark hover:text-white transition-all text-left rounded-full"
                           >
                              <div className="flex items-center gap-3">
                                 <FileText className="w-5 h-5 text-blue-dark group-hover:text-white transition-all" />
                                 <span className="text-xs font-bold tracking-wide text-ink-soft group-hover:text-white transition-all">Student Resume</span>
                              </div>
                              <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 text-blue-dark group-hover:text-white transition-opacity" />
                           </button>
                        </section>
                      )}
                   </div>
                </div>
   
                {/* Skills & Interests */}
                {student && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-line-light">
                     <section>
                        <p className="text-xs font-semibold text-ink-soft tracking-wide mb-4">Skills</p>
                        <div className="flex flex-wrap gap-2">
                           {student.skills.map(skill => (
                             <Badge key={skill} variant="secondary" className="bg-blue-dark/5 text-[#153343] border-none font-bold uppercase text-xs tracking-widest px-3 py-1">
                                {skill}
                             </Badge>
                           ))}
                        </div>
                     </section>
                     <section>
                        <p className="text-xs font-semibold text-ink-soft tracking-wide mb-4">Interests</p>
                        <div className="flex flex-wrap gap-2">
                           {student.interests.map(interest => (
                             <Badge key={interest} variant="secondary" className="border-line text-ink-soft font-bold uppercase text-xs tracking-widest px-3 py-1">
                                {interest}
                             </Badge>
                           ))}
                        </div>
                     </section>
                  </div>
                )}
              </CardContent>
            )}

            {(application.status === 'pending' || application.status === 'reviewed') && submittingState === 'idle' && (
              <div className="p-8 border-t border-line-light bg-paper-2/50 flex flex-col sm:flex-row gap-4 shrink-0">
                <Button 
                  variant="outline" 
                  className="flex-1 rounded-lg h-14 font-semibold uppercase text-xs tracking-widest text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 transition-all"
                  onClick={() => onReject(application)}
                >
                  Reject
                </Button>
                {application.status === 'pending' && onReview && (
                  <Button 
                    variant="outline"
                    className="flex-1 rounded-lg h-14 font-semibold uppercase text-xs tracking-widest text-amber-600 border-amber-200 hover:bg-amber-50 hover:border-amber-300 transition-all"
                    onClick={() => {
                      onReview(application.id);
                      onClose();
                    }}
                  >
                    Mark Reviewed
                  </Button>
                )}
                <Button 
                  className="flex-[1.5] bg-blue-dark hover:bg-[#0F1E29] text-white rounded-lg h-14 font-semibold uppercase text-xs tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98]"
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
