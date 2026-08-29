import { useDialog } from '../hooks/useDialog';
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { X, User, MapPin, GraduationCap, FileText, MessageSquare, ExternalLink, Mail, Phone, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Application, StudentProfile } from '../types';
import { Badge } from './ui/Badge';
import EmailDeliveryNote from './ui/EmailDeliveryNote';
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

  const dialogRef = useDialog(isOpen, onClose);

  if (!isOpen || !application) return null;

  const handleOpenResume = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowResumeInline(true);
  };

  const handleAcceptClick = async () => {
    try {
      setSubmittingState('database');
      
      const res = await onAccept(application.id);

      // The applicants page defers its write by 5s so the toast can offer Undo.
      // Undoing, or acting on the same applicant again inside that window,
      // settles this promise as unsuccessful — but nothing failed, so showing
      // the red "critical error" panel would be a lie. Just close.
      if (res.error === "undone" || res.error === "superseded") {
        setSubmittingState('idle');
        onClose();
        return;
      }

      if (!res.success) {
        throw new Error(res.error || "Failed to update record in Firestore database context.");
      }

      // Straight to the result. There were three artificial sleeps here — an
      // 800ms floor plus two 850ms "stages" animating a ladder of things that
      // had all already finished — so accepting one applicant took two and a
      // half seconds of watching fake progress. Twelve applicants was a minute
      // and a half of theatre. Worse, this modal renders over the Undo toast at
      // the same z-index, so the delay actively hid the one control that was
      // still useful during it.
      setDbVerified(true);
      setReceiptCompiled(res.receiptGenerated);
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
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Review volunteer application"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      >
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
                    {submittingState !== 'idle' ? "Accepting applicant" : "Review Application"}
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
                      <h4 className="text-2xl font-semibold text-ink uppercase tracking-tight">We couldn't accept this student</h4>
                      <p className="text-sm text-ink-soft font-medium">
                        The change didn't save. Check your internet connection and try again — nothing was sent to the student.
                      </p>
                    </div>
                    <div className="p-4 bg-paper-2 border border-line rounded-lg text-left">
                      <p className="text-xs font-semibold font-mono text-ink-soft uppercase tracking-wider mb-1">Details (in case you need to tell us)</p>
                      <p className="text-xs font-mono font-bold text-rose-600 break-words">{errorDetails}</p>
                    </div>
                    <Button 
                      onClick={() => setSubmittingState('idle')}
                      className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white font-semibold uppercase text-xs tracking-widest rounded-lg transition-all"
                    >
                      Back to the application
                    </Button>
                  </div>
                ) : submittingState === 'success' ? (
                  <div className="p-8 space-y-8 max-w-lg w-full mx-auto overflow-y-auto custom-scrollbar flex-grow my-4">
                    <div className="w-20 h-20 bg-blue-dark/10 text-blue-dark rounded-lg flex items-center justify-center mx-auto  animate-pulse">
                      <CheckCircle className="w-10 h-10" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-3xl font-semibold text-ink uppercase tracking-tight">Student accepted</h4>
                      {/* The outcome of the send decides the sentence.
                          emailDispatched was already captured and then used
                          only to decide whether to show the spam-folder tip, so
                          this claimed the student had been emailed even when
                          notifyApplicant had returned success: false — which it
                          does for an unapproved org, a missing address, a rate
                          limit, or a Resend rejection. An accepted student was
                          never told, and the coordinator had been assured they
                          were, so nobody followed up and the placement quietly
                          failed to start. */}
                      <p className="text-sm text-ink-soft font-medium">
                        {emailDispatched
                          ? 'Accepted. We have emailed the student, and their placement now shows in your applicants list.'
                          : 'Accepted, and their placement now shows in your applicants list. We could not email them, so please contact them directly.'}
                      </p>
                      {emailDispatched && (
                        <div className="text-left max-w-sm mx-auto pt-1">
                          <EmailDeliveryNote who="the student's" />
                        </div>
                      )}
                    </div>

                    <div className="bg-paper-2 border border-line rounded-lg p-6 space-y-4 text-left">
                      <div className="flex items-center justify-between text-xs pb-3 border-b border-line">
                        <span className="font-bold text-ink-soft tracking-wide">Summary</span>
                        <span className="font-bold text-blue-dark uppercase tracking-wider">✓ Active Status</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <p className="text-xs font-bold text-ink-soft uppercase tracking-tight">Participant Name</p>
                          <p className="font-semibold text-ink-soft text-sm mt-0.5">{student?.fullName || application.studentName}</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-ink-soft uppercase tracking-tight font-sans">Email</p>
                          {/* No invented fallback. This read `|| "armin.k@yorkschool.ca"`,
                              a demo fixture — and because no student form collects
                              contactEmail and the review endpoint deliberately omits it,
                              that fallback was what EVERY real organization saw. */}
                          <p className="font-semibold text-ink-soft text-sm mt-0.5 truncate">{student?.contactEmail || "Not shared"}</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-ink-soft uppercase tracking-tight">Saved</p>
                          <p className="font-bold text-ink-soft mt-0.5">Saved</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-ink-soft uppercase tracking-tight">Email to student</p>
                          <p className="font-bold text-ink-soft mt-0.5">{emailDispatched ? "Sent" : "Not sent. Contact them yourself so they know they have a place."}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4">
                      <Button
                        variant="outline"
                        className="flex-1 rounded-lg h-14 font-semibold uppercase text-xs tracking-widest border-line text-ink-soft hover:bg-paper-2"
                        onClick={() => {
                          const resumeUrl = student?.resumeUrl || application?.resumeUrl;
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
                            setErrorDetails("This applicant has not attached a resume.");
                          }
                        }}
                      >
                        <FileText className="w-4 h-4 mr-1.5 text-ink-soft" />
                        Download résumé
                      </Button>
                      <Button 
                        onClick={onClose}
                        className="flex-[1.2] bg-blue-dark hover:bg-[#153343] text-white rounded-lg h-14 font-semibold uppercase text-xs tracking-widest  shadow-blue-100"
                      >
                        Done
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="w-full max-w-md space-yp-6 sm:p-8 text-left">
                    <div className="space-y-2 text-center">
                      <Loader2 className="w-12 h-12 text-blue-dark animate-spin mx-auto mb-4" />
                      <h4 className="text-2xl font-semibold text-ink uppercase tracking-tight">Accepting…</h4>
                      <p className="text-xs text-ink-soft font-bold tracking-wide">This will only take a moment</p>
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
                            1. Saving the decision
                          </p>
                          <p className="text-xs text-ink-soft font-medium">
                            Recording that you accepted this applicant.
                          </p>
                        </div>
                      </div>

                      {/* These three steps used to read "Ledger Database
                          Mutation", "PDF Slip Generation ... with secure
                          SHA-256 verification signature keys" and "Resend SMTP
                          Transmission", to a volunteer coordinator at a small
                          charity. Two of them were also false: no PDF is
                          produced anywhere (the receipt is HTML rendered on
                          demand) and the only SHA-256 in this codebase hashes
                          MFA recovery codes. The accept path writes a status
                          and a timestamp and sends an email. Say that. */}
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
                            2. Preparing the receipt
                          </p>
                          <p className="text-xs text-ink-soft font-medium">
                            Getting the placement record ready to open or print.
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
                            3. Emailing the student
                          </p>
                          <p className="text-xs text-ink-soft font-medium font-sans">
                            Sending the decision to the address on their account.
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
                          const resumeUrl = student?.resumeUrl || application?.resumeUrl;
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
                    const resumeUrl = student?.resumeUrl || application?.resumeUrl;
                    if (!resumeUrl) return <p className="text-ink-soft font-bold font-mono">No resume payload stored.</p>;
                    const rawDataUrl = decompressFile(resumeUrl);
                    // Storage URLs (current uploads) render through the same
                    // branch as inline PDF data URIs: browsers display a PDF at
                    // an https URL in an iframe just like a data URI. Legacy
                    // resumes stored as base64 keep working unchanged.
                    if (rawDataUrl.startsWith('data:image/') || /\.(png|jpe?g|gif|webp)([?#].*)?$/i.test(rawDataUrl)) {
                      return (
                        <img 
                          src={rawDataUrl} 
                          alt="Resume Preview" 
                          loading="lazy" width="850" height="1100"
                          className="w-full aspect-[8.5/11] max-h-[50vh] object-contain rounded-lg  border border-line bg-white" 
                        />
                      );
                    } else if (rawDataUrl.startsWith('data:application/pdf') || rawDataUrl.startsWith('https://') || rawDataUrl.startsWith('http://')) {
                      return (
                        <div className="w-full h-full flex flex-col gap-2">
                          <div className="flex items-center justify-between p-3 bg-blue-dark/5 border border-blue-dark/10 rounded-lg">
                            <span className="text-xs font-semibold text-[#153343]">📄 PDF viewer loading. Standard browsers may restrict inline elements inside sandboxes.</span>
                            <a aria-label="Download PDF" 
                              href={rawDataUrl}
                              download={`${student?.fullName || application?.studentName || 'student'}_resume.pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold uppercase text-blue-800 hover:underline"
                            >
                              Download PDF directly
                            </a>
                          </div>
                          {/* sandbox + referrerPolicy, matching AttachmentPreview.
                              This frame takes ANY https/http/data: value in
                              resumeUrl with no extension test, so it frames
                              strictly more than its sibling did while carrying
                              none of its protection. Without a sandbox, a
                              framed HTML document can navigate the
                              coordinator's top-level window off-site in the
                              middle of a decision about a minor.
                              allow-same-origin without allow-scripts keeps the
                              browser's PDF viewer working. */}
                          <iframe 
                            src={rawDataUrl}
                            title="Resume PDF"
                            sandbox="allow-same-origin"
                            referrerPolicy="no-referrer"
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
                          {/* These two lines used to fall back to a demo student's
                              address and phone number — shown as a live mailto: to
                              every organization reviewing a real application, because
                              neither field is ever populated for a real student. An
                              organization following it emailed a stranger. Volunteers
                              are contacted through the platform instead. */}
                          <div className="space-y-2.5 text-xs text-ink-soft">
                             {student?.contactEmail ? (
                               <div className="flex items-center gap-2">
                                  <Mail className="w-4 h-4 text-blue-dark shrink-0" />
                                  <span className="font-semibold text-ink-soft">Email:</span>
                                  <a href={`mailto:${student.contactEmail}`} className="font-bold text-ink hover:text-blue-dark transition-colors">
                                     {student.contactEmail}
                                   </a>
                               </div>
                             ) : (
                               <div className="flex items-start gap-2">
                                  <Mail className="w-4 h-4 text-blue-dark shrink-0 mt-px" />
                                  <span className="leading-relaxed">
                                    Volunteers are contacted through Volunteer North York.
                                    Accepting this application emails them automatically.
                                  </span>
                               </div>
                             )}
                             {student?.phone && (
                               <div className="flex items-center gap-2">
                                  <Phone className="w-4 h-4 text-blue-dark shrink-0" />
                                  <span className="font-semibold text-ink-soft">Phone:</span>
                                  <span className="font-bold text-ink">{student.phone}</span>
                               </div>
                             )}
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
                     {/* `?? []`, because these came straight off a Firestore
                         document. A student whose profile predates these fields
                         or who skipped onboarding threw here, and a throw in
                         render takes the whole dialog to the error boundary —
                         so the organization could not review that applicant at
                         all. An empty list is the honest rendering. */}
                     <section>
                        <p className="text-xs font-semibold text-ink-soft tracking-wide mb-4">Skills</p>
                        <div className="flex flex-wrap gap-2">
                           {(student.skills ?? []).length === 0 ? (
                             <span className="text-[13px] text-ink-muted">Not listed</span>
                           ) : (student.skills ?? []).map(skill => (
                             <Badge key={skill} variant="secondary" className="bg-blue-dark/5 text-[#153343] border-none font-bold uppercase text-xs tracking-widest px-3 py-1">
                                {skill}
                             </Badge>
                           ))}
                        </div>
                     </section>
                     <section>
                        <p className="text-xs font-semibold text-ink-soft tracking-wide mb-4">Interests</p>
                        <div className="flex flex-wrap gap-2">
                           {(student.interests ?? []).length === 0 ? (
                             <span className="text-[13px] text-ink-muted">Not listed</span>
                           ) : (student.interests ?? []).map(interest => (
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
                    /* amber-700: #E17100 measured 3.11:1 here, and this is 12px text. */
                    className="flex-1 rounded-lg h-14 font-semibold uppercase text-xs tracking-widest text-amber-700 border-amber-200 hover:bg-amber-50 hover:border-amber-300 transition-all"
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
