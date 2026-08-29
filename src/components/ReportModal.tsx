import { useDialog } from '../hooks/useDialog';
import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../lib/config';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase/config';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { compressFile } from '../utils/compress';
import { uploadFileToStorage } from '../lib/storageUpload';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { 
  X, 
  UploadCloud, 
  Paperclip, 
  Trash2, 
  ShieldAlert, 
  CheckCircle2 
} from 'lucide-react';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportedUserId: string;
  reportedUserName: string;
  reportedUserRole: 'student' | 'organization';
}

const REPORT_REASONS = [
  { value: '', label: '-- Select Reason * --' },
  { value: 'misleading_post', label: 'Misleading or Fraudulent Post ⚠️' },
  { value: 'no_show', label: 'No-Shows or Unreliable Attendance ⏰' },
  { value: 'harassment', label: 'Safety Concern or Harassment 🛡️' },
  { value: 'spam', label: 'Spam or inappropriate material' },
  { value: 'other', label: 'Other Terms of Service Violations ⚙️' },
];

export default function ReportModal({ isOpen, onClose, reportedUserId, reportedUserName, reportedUserRole }: ReportModalProps) {
  const { user, userProfile, studentProfile, orgProfile, isDemoMode } = useAuth();
  
  const [reason, setReason] = useState('');
  // Validation lives in the form, not in a browser dialog. See handleSubmit.
  const [formError, setFormError] = useState<string | null>(null);
  // Held so it can be cleared on unmount and on reopen — see where it is set.
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isOpen) return;
    if (successTimer.current) {
      clearTimeout(successTimer.current);
      successTimer.current = null;
    }
  }, [isOpen]);
  useEffect(() => () => {
    if (successTimer.current) clearTimeout(successTimer.current);
  }, []);
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileDescription, setFileDescription] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (isOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  const dialogRef = useDialog(isOpen, onClose);

  if (!isOpen) return null;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // In-page, not alert(). This is a safety report — often about a minor —
    // and a blocking browser dialog is unstyled, unannounced to screen readers,
    // and loses whatever the person had typed from view while it is open.
    setFormError(null);
    if (!reason) {
      setFormError('Please choose a reason for this report.');
      return;
    }
    if (!description.trim()) {
      setFormError('Please describe what happened, so we can act on it.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Attachments go to Firebase Storage, not into the Firestore document.
      //
      // This used to read the file into a base64 data URI, LZ-compress it and
      // store it in reports/{id}.attachmentData — which put screenshots of
      // minors' accounts inside a document every developer-console listing
      // reads, and blew the 1 MiB document limit on larger screenshots.
      // Storage holds the bytes; the document only carries the URL.
      //
      // Demo mode keeps the old inline path because there is no real Firebase
      // project to upload to — and the demo copy never leaves localStorage.
      let attachmentUrl: string | null = null;
      let compressedData: string | null = null;
      if (file) {
        if (isDemoMode) {
          try {
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.readAsDataURL(file);
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = (err) => reject(err);
            });
            compressedData = compressFile(base64);
          } catch (fileErr) {
            console.error("Failed to read report attachment", fileErr);
          }
        } else {
          try {
            const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(-60);
            attachmentUrl = await uploadFileToStorage(
              file,
              `reports/${user?.uid || 'anonymous'}/${Date.now()}-${safeName}`,
            );
          } catch (fileErr) {
            console.error("Failed to upload report attachment", fileErr);
            setFormError('Your screenshot could not be uploaded. Please try again, or submit the report without it.');
            setIsSubmitting(false);
            return;
          }
        }
      }

      // 1. Trigger robust background server-side AI Overview of this safety report using Gemini
      /*
       * null when triage does not run, not invented text.
       *
       * The fallback used to be a hardcoded object saying "Under investigation
       * by the administrators" and "Immediate reviewer review is advised", and
       * the moderation queue renders those under a heading reading "AI Trust &
       * Safety Analysis". So a brand-new, unread report about an adult
       * displayed a summary saying it was already being handled. The queue
       * skips the block entirely when this is absent.
       */
      let aiOverview: any = null;

      try {
        // /api/feedback/analyze requires a bearer token. This request sent
        // none, so triage 401'd on every real report and every one of them was
        // filed with the hardcoded placeholder summary above — silently,
        // because a non-ok response just leaves the fallback in place.
        // FeedbackPage already sends the token; this call was the odd one out.
        const token = isDemoMode ? 'demo-mode-token-student' : await user?.getIdToken();
        const aiResponse = await fetch(`${API_BASE_URL}/api/feedback/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ subject: `SAFETY REPORT: ${reason}`, message: description, type: 'safety' }),
        });
        if (aiResponse.ok) {
          aiOverview = await aiResponse.json();
        } else {
          console.warn('AI triage for this safety report was rejected:', aiResponse.status, await aiResponse.text());
        }
      } catch (aiErr) {
        console.warn('AI evaluation failed for report, using fallback metadata:', aiErr);
      }

      // Generate report object
      const reportId = 'report_' + Math.random().toString(36).substring(2, 11);
      const reportObj = {
        id: reportId,
        reportingUserId: user?.uid || 'anonymous',
        reportingUserEmail: user?.email || 'anonymous@volunteernorthyork.indevs.in',
        reportingUserName: studentProfile?.fullName || orgProfile?.organizationName || user?.email || 'Anonymous Member',
        reportedUserId,
        reportedUserName,
        reportedUserRole,
        reason,
        description,
        createdAt: new Date().toISOString(),
        // Omitted, not null: isValidReport requires `is map` when present, and
        // absent is what tells the queue triage did not run.
        ...(aiOverview ? { aiOverview } : {}),
        // Attachment. Real reports carry only the Storage URL; the bytes live
        // in Firebase Storage under reports/{uid}/... (see storage.rules).
        // Demo reports keep the inline compressed data because they never
        // leave this browser.
        attachmentName: file ? file.name : null,
        attachmentSize: file ? formatBytes(file.size) : null,
        attachmentDescription: file ? fileDescription : null,
        attachmentUrl: attachmentUrl || null,
        attachmentData: compressedData,
        status: 'pending', // pending, resolved, dismissed
      };

      if (isDemoMode) {
        // Demo-only mirror. Real reports are NOT duplicated into localStorage:
        // they describe safety incidents involving real accounts, and a shared
        // or resold device has no business carrying them.
        const existingReports = JSON.parse(localStorage.getItem('demo_reports') || '[]');
        existingReports.unshift(reportObj);
        localStorage.setItem('demo_reports', JSON.stringify(existingReports));
      } else {
        try {
          // The rules validate attachment fields as `absent(x) || x is string`,
          // and a field set to null is PRESENT but not a string — so every
          // attachment-less report used to fail validation (and the old catch
          // swallowed it). Omit absent fields instead of nulling them.
          const docData: Record<string, unknown> = { ...reportObj, createdAt: serverTimestamp() };
          delete docData.attachmentData;
          if (!attachmentUrl) {
            delete docData.attachmentUrl;
            delete docData.attachmentName;
            delete docData.attachmentSize;
            delete docData.attachmentDescription;
          }
          await setDoc(doc(db, 'reports', reportId), docData);
        } catch (dbErr: any) {
          // Previously this was swallowed ("recorded local copy seamlessly"),
          // which meant a permission-denied looked exactly like a filed report
          // — and then the local copy was the only record, invisible to staff.
          console.error('Failed to file safety report in Firestore:', dbErr);
          setFormError(
            dbErr?.code === 'permission-denied'
              ? 'Your report could not be filed: you need to be signed in with a completed profile. Please sign in again and retry.'
              : 'Your report could not be filed. Please check your connection and try again.'
          );
          setIsSubmitting(false);
          return;
        }
      }

      setStatus('success');
      // Tracked so it can be cleared. This modal stays mounted at some call
      // sites, so a timer left running after the success panel was dismissed
      // fired later and closed the dialog mid-typing on the NEXT report,
      // discarding what had been written.
      successTimer.current = setTimeout(() => {
        // Reset states
        setReason('');
        setDescription('');
        setFile(null);
        setFileDescription('');
        setStatus('idle');
        onClose();
      }, 3000);
    } catch (err) {
      console.error('An error occurred during safety report logging:', err);
      setStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Report a user"
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn"
    >
      <Card className="w-full max-w-lg rounded-lg border border-line-light  bg-white overflow-hidden relative max-h-[90vh] flex flex-col">
        {/* Header decoration */}
        <div className="absolute top-0 left-0 right-0 h-2    " />
        
        <CardHeader className="bg-paper-2/60 pb-4 pt-6 px-6 md:px-8 border-b border-line-light flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg bg-red-100/80 text-red-600 flex items-center justify-center border border-red-200/40 shrink-0">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            </div>
            <div className="text-left">
              <CardTitle className="text-base font-bold text-ink uppercase">Report Violation</CardTitle>
              <p className="text-[10.5px] font-bold text-ink-muted text-ink-muted mt-0.5 uppercase tracking-wider">
                Safe space policy enforcement
              </p>
            </div>
          </div>
          
          <button aria-label="Close modal" 
            type="button" 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-ink-muted hover:text-ink-muted transition-colors rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </CardHeader>

        {status === 'success' ? (
          <div className="p-10 text-center space-y-4 flex-1 overflow-y-auto flex flex-col justify-center items-center">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center mx-auto border border-emerald-100 animate-in zoom-in-50 duration-500">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-ink uppercase tracking-tight">Report Logged Safely</h3>
            <p className="text-ink-muted text-xs font-semibold leading-relaxed max-w-xs mx-auto">
              {/*
                * Every clause of the previous version except "transmitted" was
                * unbacked: there is no assignee field in the schema, no alert,
                * no page, no email — the report waits in a queue until someone
                * opens the console. "York region" is a municipality with no
                * relationship to this platform. A minor reporting an unsafe
                * adult was told a named human was already on it, which is
                * exactly the reassurance that stops someone escalating to a
                * person who could actually help tonight.
                */}
              Your report has been saved and is in the moderation queue. A person reviews
              these by hand, so it may take a little time. If you or someone else is in
              immediate danger, do not wait for us: call 911, or Kids Help Phone on
              1-800-668-6868.
            </p>
          </div>
        ) : (
          <CardContent className="p-6 md:p-8 space-y-5 overflow-y-auto flex-1 text-left">
            {/*
              * This banner used to promise "Administrative monitors will
              * investigate timestamps, opportunity logs, and application
              * communications to initiate profile restrictions instantly",
              * under a heading about "York Volunteer Trust".
              *
              * None of that exists. The success panel above was corrected in an
              * earlier pass and this was not — and this is the worse of the two,
              * because it is what the student reads WHILE DECIDING whether
              * reporting here is enough. A frightened person told enforcement is
              * already automatic and instant does not then phone someone who
              * could actually help tonight. York region is also a municipality
              * with no relationship to this platform.
              */}
            <div className="p-4 bg-red-50 text-red-900 border border-red-100 rounded-lg text-xs leading-relaxed font-semibold">
              You are reporting <strong>{reportedUserName}</strong> ({reportedUserRole}). What you write goes to a
              moderation queue that a person reads by hand, so it may take a little time. Include dates, times and
              exactly what happened.
            </div>

            {/*
              * The crisis numbers, in EVERY state.
              *
              * They lived only inside the success panel, so the two paths that
              * fail before a report is saved — an attachment that will not
              * upload, and a denied write — both returned with the form still
              * showing and the student never saw them at all. At 11pm those
              * numbers were behind a successful database write.
              */}
            <div className="p-4 bg-white border-2 border-red-200 rounded-lg text-xs leading-relaxed">
              <span className="font-bold text-red-700 block mb-1">If you are in danger right now, do not wait for us</span>
              <span className="text-ink-soft">
                Call <strong>911</strong>, or Kids Help Phone on <strong>1-800-668-6868</strong> (text CONNECT to 686868).
                They answer 24 hours a day.
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* formError was SET in five places and rendered in none of them.
                  The two reachable paths are the fatal ones — a failed
                  attachment upload and a denied Firestore write — so a student
                  filing a safety report about an organization pressed Submit,
                  the spinner stopped, and absolutely nothing happened. The
                  report was never filed and they had no way to know. Of every
                  silent failure in this codebase this was the worst one to
                  have: these reports are about the safety of minors. */}
              {formError && (
                <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold p-3.5 rounded-lg leading-relaxed">
                  {formError}
                </div>
              )}
              <div>
                {/* htmlFor + id. These two labels were siblings of their
                    controls and wrapped nothing, so they named nothing: a
                    screen reader announced "combo box" and "edit text, blank"
                    on the form a student uses to report an adult. The suite
                    runs axe on every route but never opens a dialog, so no
                    check covered it. */}
                <label htmlFor="report-reason" className="text-xs font-bold text-ink-soft text-ink-muted block mb-1.5 uppercase tracking-wide">Violation Classification *</label>
                <select
                  id="report-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full text-xs rounded-lg border border-line px-3.5 py-3 font-semibold bg-white cursor-pointer focus:ring-2 focus:ring-red-500"
                  required
                >
                  {REPORT_REASONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="report-description" className="text-xs font-bold text-ink-soft text-ink-muted block mb-1.5 uppercase tracking-wide">Detailed Account of Incident *</label>
                <textarea
                  id="report-description"
                  rows={4}
                  placeholder="Provide precise details, e.g., date of occurrence, specific dialogues, or no-show patterns of this member..."
                  className="w-full rounded-lg border border-line p-4 text-xs focus:ring-2 focus:ring-red-500 font-semibold leading-relaxed"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              {/* Drag and Drop Screenshot field */}
              <div>
                <label className="text-xs font-bold text-ink-soft text-ink-muted block mb-1.5 uppercase tracking-wide">Screenshot Proof (Optional)</label>
                
                {/* The drop zone stays a div — it cannot be a <button>, because
                    a button may not contain the <input type="file">. What was
                    broken is that the input was `display:none`, which makes it
                    UNFOCUSABLE, and the div had no role, tabIndex or key
                    handler. So attaching a screenshot to a safety report was
                    mouse-only, with no alternative path anywhere.
                    `sr-only` hides the input visually while leaving it in the
                    tab order, and the <label> below is wired to it — the
                    standard accessible file-input pattern. */}
                {!file ? (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5 focus-within:ring-2 focus-within:ring-red-500 ${
                      isDragging 
                        ? 'border-red-500 bg-red-50/10' 
                        : 'border-line hover:border-slate-300 bg-paper-2/40 hover:bg-paper-2'
                    }`}
                    onClick={() => document.getElementById('report-file-uploader')?.click()}
                  >
                    <input
                      id="report-file-uploader"
                      type="file"
                      className="sr-only"
                      onChange={handleFileChange}
                      accept="image/*"
                    />
                    <UploadCloud className="w-7 h-7 text-ink-muted text-ink-muted" />
                    <p className="text-xs font-bold text-ink-soft">
                      Drag and drop image, or{' '}
                      <label htmlFor="report-file-uploader" className="text-red-600 underline cursor-pointer">
                        browse
                      </label>
                    </p>
                    <p className="text-xs text-ink-muted">Supports PNG or JPG up to 5MB</p>
                  </div>
                ) : (
                  <div className="border border-line rounded-lg p-3.5 bg-paper-2/60 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Paperclip className="w-3.5 h-3.5 text-red-600 text-red-600 shrink-0" />
                        <div className="text-left">
                          <p className="text-xs font-bold text-ink-soft line-clamp-1">{file.name}</p>
                          <p className="text-xs text-ink-muted font-bold font-mono">{formatBytes(file.size)}</p>
                        </div>
                      </div>
                      {/* Was aria-label="Close modal", identical to the real
                          close button — a screen-reader user heard two "Close
                          modal" buttons and could delete their own evidence
                          trying to shut the dialog. */}
                      <button aria-label="Remove attached screenshot"
                        type="button"
                        onClick={() => { setFile(null); setFileDescription(''); }}
                        className="p-1 rounded-lg hover:bg-red-50 text-red-600 hover:text-red-700 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <Input
                      aria-label="Brief context for the attached screenshot"
                      placeholder="Brief context for screenshot (e.g., chat log snapshot)..."
                      value={fileDescription}
                      onChange={(e) => setFileDescription(e.target.value)}
                      className="bg-white h-9 text-xs"
                    />
                  </div>
                )}
              </div>

              {status === 'error' && (
                <div className="p-3.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold border border-red-100">
                  An error occurred. Check input data or offline connectivity status.
                </div>
              )}

              <div className="flex gap-3 justify-end pt-3 shrink-0">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={onClose} 
                  className="rounded-lg text-xs font-semibold uppercase"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="bg-red-600 text-white border-none hover:bg-red-700 rounded-lg text-xs font-semibold uppercase  shadow-red-600/10"
                  isLoading={isSubmitting}
                >
                  Submit Violation Report
                </Button>
              </div>
            </form>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
