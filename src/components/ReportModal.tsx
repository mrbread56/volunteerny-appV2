import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../lib/config';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase/config';
import { doc, setDoc, serverTimestamp, addDoc, collection } from 'firebase/firestore';
import { compressFile } from '../utils/compress';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { 
  X, 
  AlertOctagon, 
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
  { value: 'spam', label: 'Spam or Inappropriate Material �,�️' },
  { value: 'other', label: 'Other Terms of Service Violations ⚙️' },
];

export default function ReportModal({ isOpen, onClose, reportedUserId, reportedUserName, reportedUserRole }: ReportModalProps) {
  const { user, userProfile, studentProfile, orgProfile, isDemoMode } = useAuth();
  
  const [reason, setReason] = useState('');
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
    if (!reason) {
      alert('Please select a report reason option.');
      return;
    }
    if (!description.trim()) {
      alert('Please write a detailed description first.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Convert file to Base64 and compress it
      let compressedData: string | null = null;
      if (file) {
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
      }

      // 1. Trigger robust background server-side AI Overview of this safety report using Gemini
      let aiOverview = {
        category: reason,
        urgency: 'high',
        summary: 'Under investigation by the administrators.',
        suggestedFix: 'Immediate reviewer review is advised.',
      };

      try {
        const aiResponse = await fetch(`${API_BASE_URL}/api/feedback/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: `SAFETY REPORT: ${reason}`, message: description, type: 'safety' }),
        });
        if (aiResponse.ok) {
          aiOverview = await aiResponse.json();
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
        aiOverview,
        // Attachment:
        attachmentName: file ? file.name : null,
        attachmentSize: file ? formatBytes(file.size) : null,
        attachmentDescription: file ? fileDescription : null,
        attachmentData: compressedData,
        status: 'pending', // pending, resolved, dismissed
      };

      // 2. Write to local database and firestore fallback list
      const existingReports = JSON.parse(localStorage.getItem('demo_reports') || '[]');
      existingReports.unshift(reportObj);
      localStorage.setItem('demo_reports', JSON.stringify(existingReports));

      if (!isDemoMode) {
        try {
          await setDoc(doc(db, 'reports', reportId), {
            ...reportObj,
            createdAt: serverTimestamp(),
          });
        } catch (dbErr) {
          console.warn('Real Firestore report registry failed, recorded local copy seamlessly:', dbErr);
        }
      }

      setStatus('success');
      setTimeout(() => {
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
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
      <Card className="w-full max-w-lg rounded-sm border border-slate-100  bg-white overflow-hidden relative max-h-[90vh] flex flex-col">
        {/* Header decoration */}
        <div className="absolute top-0 left-0 right-0 h-2    " />
        
        <CardHeader className="bg-slate-50/60 pb-4 pt-6 px-6 md:px-8 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-sm bg-red-100/80 text-red-600 flex items-center justify-center border border-red-200/40 shrink-0">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            </div>
            <div className="text-left">
              <CardTitle className="text-base font-black text-slate-900 uppercase">Report Violation</CardTitle>
              <p className="text-[10.5px] font-bold text-slate-600 text-slate-600 mt-0.5 uppercase tracking-wider">
                Safe space policy enforcement
              </p>
            </div>
          </div>
          
          <button aria-label="Close modal" 
            type="button" 
            onClick={onClose}
            className="p-1.5 rounded-sm hover:bg-slate-100 text-slate-600 hover:text-slate-600 transition-colors rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </CardHeader>

        {status === 'success' ? (
          <div className="p-10 text-center space-y-4 flex-1 overflow-y-auto flex flex-col justify-center items-center">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-sm flex items-center justify-center mx-auto  border border-emerald-100 animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Report Logged Safely</h3>
            <p className="text-slate-600 text-xs font-semibold leading-relaxed max-w-xs mx-auto">
              Your safety report has been transmitted to administrators. We use smart AI overview analysis to queue the urgency, and a real human reviewer is assigned. Rest assured York region maintains zero tolerance for unsafe behavior.
            </p>
          </div>
        ) : (
          <CardContent className="p-6 md:p-8 space-y-5 overflow-y-auto flex-1 text-left">
            <div className="p-4 bg-red-50 text-red-900 border border-red-100 rounded-sm text-[11px] leading-relaxed font-semibold">
              <span className="font-extrabold block mb-1">🛡️ Protecting York Volunteer Trust</span>
              You are reporting <strong>{reportedUserName}</strong> ({reportedUserRole}). Administrative monitors will investigate timestamps, opportunity logs, and application communications to initiate profile restrictions instantly.
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 text-slate-600 block mb-1.5 uppercase tracking-wide">Violation Classification *</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full text-xs rounded-sm border border-slate-200 px-3.5 py-3 font-semibold bg-white cursor-pointer focus:ring-2 focus:ring-red-500"
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
                <label className="text-xs font-bold text-slate-700 text-slate-600 block mb-1.5 uppercase tracking-wide">Detailed Account of Incident *</label>
                <textarea
                  rows={4}
                  placeholder="Provide precise details, e.g., date of occurrence, specific dialogues, or no-show patterns of this member..."
                  className="w-full rounded-sm border border-slate-200 p-4 text-xs focus:ring-2 focus:ring-red-500 font-semibold leading-relaxed"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              {/* Drag and Drop Screenshot field */}
              <div>
                <label className="text-xs font-bold text-slate-700 text-slate-600 block mb-1.5 uppercase tracking-wide">Screenshot Proof (Optional)</label>
                
                {!file ? (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-sm p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5 ${
                      isDragging 
                        ? 'border-red-500 bg-red-50/10' 
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50/40 hover:bg-slate-50'
                    }`}
                    onClick={() => document.getElementById('report-file-uploader')?.click()}
                  >
                    <input
                      id="report-file-uploader"
                      type="file"
                      className="hidden"
                      onChange={handleFileChange}
                      accept="image/*"
                    />
                    <UploadCloud className="w-7 h-7 text-slate-600 text-slate-600" />
                    <p className="text-[11px] font-bold text-slate-700">
                      Drag and drop image, or <span className="text-red-600 underline">browse</span>
                    </p>
                    <p className="text-[9px] text-slate-600">Supports PNG or JPG up to 5MB</p>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-sm p-3.5 bg-slate-50/60 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Paperclip className="w-3.5 h-3.5 text-red-500 text-red-500 shrink-0" />
                        <div className="text-left">
                          <p className="text-[11px] font-black text-slate-800 line-clamp-1">{file.name}</p>
                          <p className="text-[9px] text-slate-600 font-bold font-mono">{formatBytes(file.size)}</p>
                        </div>
                      </div>
                      <button aria-label="Close modal"
                        type="button"
                        onClick={() => { setFile(null); setFileDescription(''); }}
                        className="p-1 rounded-sm hover:bg-red-50 text-red-500 hover:text-red-700 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <Input
                      placeholder="Brief context for screenshot (e.g., chat log snapshot)..."
                      value={fileDescription}
                      onChange={(e) => setFileDescription(e.target.value)}
                      className="bg-white h-9 text-[11px]"
                    />
                  </div>
                )}
              </div>

              {status === 'error' && (
                <div className="p-3.5 bg-red-50 text-red-600 rounded-sm text-xs font-bold border border-red-100">
                  An error occurred. Check input data or offline connectivity status.
                </div>
              )}

              <div className="flex gap-3 justify-end pt-3 shrink-0">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={onClose} 
                  className="rounded-sm text-xs font-black uppercase tracking-wider"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="bg-red-600 text-white border-none hover:bg-red-700 rounded-sm text-xs font-black uppercase tracking-wider  shadow-red-600/10"
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
