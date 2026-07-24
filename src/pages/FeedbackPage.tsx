import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../lib/config';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase/config';
import { doc, setDoc, serverTimestamp, collection, getDocs, query, where } from 'firebase/firestore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { compressFile } from '../utils/compress';
import { 
  Send, 
  Sparkles, 
  MessageSquare, 
  AlertTriangle, 
  Lightbulb, 
  UploadCloud, 
  Paperclip, 
  CheckCircle2, 
  Trash2, 
  Clock, 
  UserCheck 
} from 'lucide-react';

const FEEDBACK_TYPES = [
  { value: '', label: '-- Choose Feedback Category * --' },
  { value: 'bug', label: 'Report a Bug 🐞' },
  { value: 'feature', label: 'Suggest a Feature 💡' },
  { value: 'ux', label: 'User Experience (UX) Idea 🎨' },
  { value: 'other', label: 'Other Support Ticket ⚙' },
];

export default function FeedbackPage() {
  const { user, userProfile, isDemoMode } = useAuth();
  const [type, setType] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedFeedback, setSubmittedFeedback] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [myFeedbacks, setMyFeedbacks] = useState<any[]>([]);

  // Drag-and-drop attachment file states
  const [file, setFile] = useState<File | null>(null);
  const [fileDescription, setFileDescription] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Load previous feeds on mount/submit
  useEffect(() => {
    loadMyFeedbacks();
  }, [user, isDemoMode]);

  const loadMyFeedbacks = async () => {
    const userId = user?.uid || 'anonymous';
    try {
      if (isDemoMode) {
        const demoFeedbacks = JSON.parse(localStorage.getItem('demo_feedbacks') || '[]');
        const filtered = demoFeedbacks.filter((fb: any) => fb.userId === userId);
        setMyFeedbacks(filtered);
      } else {
        const q = query(collection(db, 'feedbacks'), where('userId', '==', userId));
        const fbSnap = await getDocs(q);
        const fbList = fbSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as any));
        
        fbList.sort((a, b) => {
          const tA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime();
          const tB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime();
          return tB - tA;
        });
        setMyFeedbacks(fbList);
      }
    } catch (err) {
      console.warn('Error fetching personal feedbacks, using fallback local array:', err);
      const demoFeedbacks = JSON.parse(localStorage.getItem('demo_feedbacks') || '[]');
      const filtered = demoFeedbacks.filter((fb: any) => fb.userId === userId);
      setMyFeedbacks(filtered);
    }
  };

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

  const handleRemoveFile = () => {
    setFile(null);
    setFileDescription('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!type) {
      setError('Please choose a feedback category first.');
      return;
    }
    if (!subject || !message) {
      setError('Please fill in both the Subject and Detailed Description fields.');
      return;
    }

    setIsSubmitting(true);
    setError('');

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
          console.error("Failed to read feedback attachment", fileErr);
        }
      }

      // 1. Trigger server-side secure Gemini analysis of this feedback for control room logs
      let aiOverview = {
        category: type,
        urgency: 'medium',
        summary: 'Your feedback will be reviewed manually by our developer team shortly.',
        suggestedFix: 'Under analysis.',
      };

      try {
        const token = await user?.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/feedback/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ subject, message, type }),
        });
        if (response.ok) {
          const aiData = await response.json();
          aiOverview = aiData;
        }
      } catch (aiErr) {
        console.warn('AI Analysis failed, saving standard metadata fallback:', aiErr);
      }

      // 2. Draft complete feedback document schema
      const feedbackId = 'fb_' + Math.random().toString(36).substring(2, 11);
      const feedbackObj = {
        id: feedbackId,
        userId: user?.uid || 'anonymous',
        userEmail: user?.email || 'guest@volunteernorthyork.indevs.in',
        userRole: userProfile?.role || 'visitor',
        type,
        subject,
        message,
        createdAt: new Date().toISOString(),
        aiOverview,
        // File Attachment parameters:
        attachmentName: file ? file.name : null,
        attachmentSize: file ? formatBytes(file.size) : null,
        attachmentDescription: file ? fileDescription : null,
        attachmentData: compressedData,
        developerReply: null,
        repliedAt: null,
      };

      if (isDemoMode) {
        const demoFeedbacks = JSON.parse(localStorage.getItem('demo_feedbacks') || '[]');
        demoFeedbacks.unshift(feedbackObj);
        localStorage.setItem('demo_feedbacks', JSON.stringify(demoFeedbacks));
      } else {
        await setDoc(doc(db, 'feedbacks', feedbackId), {
          ...feedbackObj,
          createdAt: serverTimestamp(),
        });
      }

      // Clear input values safely
      setSubmittedFeedback(feedbackObj);
      setType('');
      setSubject('');
      setMessage('');
      setFile(null);
      setFileDescription('');
      
      // Reload tickets log list
      loadMyFeedbacks();
    } catch (err: any) {
      console.error('Error submitting feedback:', err);
      setError('An error occurred while transmitting your report. Please check back later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-12 px-6 space-y-8 bg-white">
      <div className="max-w-xl space-y-2">
        <h1 className="text-[1.5rem] font-semibold text-ink tracking-[-0.02em]">Feedback & Support</h1>
        <p className="text-ink-soft text-[13px] leading-relaxed">
          Found a bug or have a feature suggestion? Submit a ticket and track responses below.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {submittedFeedback ? (
            <Card className="rounded-sm border border-orange-100  overflow-hidden bg-white animate-fadeIn">
              <div className="p-8 text-center space-y-5">
                <div className="w-16 h-16 bg-[#E08A3C]/10 text-[#E08A3C] rounded-sm flex items-center justify-center mx-auto  border border-orange-100 animate-pulse">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black text-slate-900">Feedback Submitted Successfully!</h3>
                  <p className="text-slate-600 text-sm leading-relaxed max-w-md mx-auto font-medium">
                    This feedback has been submitted successfully. It will be reviewed by admin or our developer team shortly.
                  </p>
                  <p className="text-[11px] text-slate-600 font-mono">
                    Ticket ID reference: #{submittedFeedback.id}
                  </p>
                </div>
                <div className="pt-2">
                  <Button 
                    onClick={() => setSubmittedFeedback(null)} 
                    className="bg-slate-900 border-none text-white hover:bg-slate-800 rounded-sm px-6 py-2.5 text-xs font-black uppercase tracking-wider"
                  >
                    Send Another Ticket
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="rounded-sm border border-slate-100  overflow-hidden bg-white">
              <CardHeader className="border-b border-line py-6">
                <CardTitle className="text-[16px] flex items-center gap-2 text-ink font-semibold">
                  <MessageSquare className="w-4 h-4 text-[#1F4C63]" /> Support Ticket
                </CardTitle>
                <p className="text-[12px] text-ink-muted mt-1">
                  Categorize and detail your report.
                </p>
              </CardHeader>
              <CardContent className="p-6 md:p-8 pt-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <Select
                    label="Category Classification"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    options={FEEDBACK_TYPES}
                    required
                  />

                  {type === 'ux' && (
                    <div className="p-4 bg-[#1F4C63]/5/70 text-blue-900 text-xs rounded-sm border border-[#1F4C63]/10 leading-relaxed font-semibold animate-fadeIn">
                      <span className="font-extrabold block mb-1">💡 What does "UX" mean?</span> 
                      <strong>UX</strong> stands for <strong>User Experience</strong>. It represents how easy, natural, and friendly the website is to navigate. Submit a UX ticket if you feel a page is confusing, if buttons are hard to click on a phone, or if you have suggestions on how we can improve the layout styling!
                    </div>
                  )}

                  <Input
                    label="Subject Title"
                    placeholder="Briefly describe the ticket, e.g., Map pin draggable loading lag..."
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                  />

                  <div className="flex flex-col gap-2">
                    <label className="text-[13px] font-medium text-ink">Detailed Description</label>
                    <textarea
                      rows={5}
                      placeholder="Please describe the issue or suggestion in detail..."
                      className="w-full border border-line p-3.5 text-[14px] text-ink focus:outline-none focus:border-[#1F4C63] focus:ring-1 focus:ring-[#1F4C63] transition-colors"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      required
                    />
                  </div>

                  {/* Attachment Section */}
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-slate-700">Attach Screenshot or Document (Optional)</label>
                    
                    {!file ? (
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`border-2 border-dashed rounded-sm p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                          isDragging 
                            ? 'border-[#1F4C63] bg-[#1F4C63]/5/20' 
                            : 'border-slate-200 hover:border-slate-300 bg-slate-50/40 hover:bg-slate-50'
                        }`}
                        onClick={() => document.getElementById('file-uploader-element')?.click()}
                      >
                        <input
                          id="file-uploader-element"
                          type="file"
                          className="hidden"
                          onChange={handleFileChange}
                          accept="image/*,application/pdf"
                        />
                        <UploadCloud className="w-8 h-8 text-slate-600 animate-pulse" />
                        <p className="text-xs font-bold text-slate-700">
                          Drag and drop file here, or <span className="text-[#1F4C63] underline">browse computer</span>
                        </p>
                        <p className="text-[10px] text-slate-600">Supports PNG, JPG, or PDF up to 5MB</p>
                      </div>
                    ) : (
                      <div className="border border-slate-200 rounded-sm p-4 bg-slate-50/60 flex flex-col gap-3 animate-fadeIn">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Paperclip className="w-4 h-4 text-[#1F4C63] shrink-0" />
                            <div className="text-left">
                              <p className="text-xs font-black text-slate-800 line-clamp-1">{file.name}</p>
                              <p className="text-[10px] text-slate-600 font-bold font-mono">{formatBytes(file.size)}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleRemoveFile}
                            className="p-1.5 rounded-full hover:bg-red-50 text-red-500 text-red-500 transition-colors"
                            title="Remove file"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* File Description */}
                        <div className="space-y-1 text-left">
                          <label className="text-[11px] font-extrabold text-slate-600 tracking-wide uppercase">File Description</label>
                          <Input
                            placeholder="Brief description of the snapshot/document context..."
                            value={fileDescription}
                            onChange={(e) => setFileDescription(e.target.value)}
                            className="bg-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {error && (
                    <div className="p-4 rounded-sm bg-red-50 text-red-600 text-red-600 text-xs font-bold border border-red-100">
                      {error}
                    </div>
                  )}

                  <Button type="submit" className="w-full h-12" isLoading={isSubmitting}>
                    <Send className="w-4 h-4 mr-2" /> Send Ticket to Admin
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="md:col-span-1 space-y-6">
          <Card className="p-6 border border-slate-100 rounded-sm bg-white space-y-4 ">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#1F4C63]" /> Response Expectations
            </h3>
            <p className="text-xs leading-relaxed text-slate-600 font-semibold">
              Our team operates standard hours. Tickets generally receive manual diagnostic responses within 24 to 48 hours. Please check the "My Submitted Tickets" index below regularly to check feedback outcomes and messages.
            </p>
          </Card>

          <Card className="p-6 border border-slate-100 rounded-sm bg-white space-y-4 ">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#E08A3C]" /> Service Policy
            </h3>
            <p className="text-xs leading-relaxed text-slate-600 font-semibold">
              We strictly audit spam or duplicate submissions. Ensure detailed reports to help maintain an accessible community environment for all high school students and public organizations around York region.
            </p>
          </Card>
        </div>
      </div>

      {/* NEW INTERACTIVE "MY SUBMITTED TICKETS" REPLY TRAIL SECTION */}
      <div className="pt-4 border-t border-line space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-[1.25rem] font-semibold text-ink tracking-[-0.02em]">My Tickets</h2>
            <p className="text-[12px] text-ink-muted">
              Track progress and view replies from administrators.
            </p>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-slate-100 border border-slate-200 rounded-sm text-slate-600">
            {myFeedbacks.length} Tickets Found
          </span>
        </div>

        {myFeedbacks.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 border border-slate-200 rounded-sm text-slate-600 font-semibold text-xs py-12 max-w-md mx-auto space-y-3">
            <MessageSquare className="w-8 h-8 mx-auto text-slate-600 animate-pulse" />
            <h4 className="text-slate-700 font-bold">No tickets logged yet</h4>
            <p className="text-slate-600 font-medium px-4">
              Your submitted support inquiries, feature ideas, and system bugs will render here instantly alongside admin replies.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {myFeedbacks.map((fb) => (
              <Card key={fb.id} className="rounded-sm border border-slate-200  bg-white overflow-hidden relative group hover:border-[#1F4C63]/30 transition-all duration-300">
                <div className={`absolute top-0 left-0 w-1.5 h-full ${fb.developerReply ? 'bg-[#1F4C63]' : 'bg-[#1F4C63]'}`} />
                
                <CardContent className="p-6 md:p-8 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                          fb.type === 'bug' ? 'bg-red-50 text-red-600 text-red-600 border border-red-100' :
                          fb.type === 'feature' ? 'bg-[#E08A3C]/10 text-[#E08A3C] border border-orange-100' :
                          fb.type === 'ux' ? 'bg-[#1F4C63]/5 text-[#1F4C63] border border-[#1F4C63]/10' :
                          'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {fb.type?.toUpperCase() || 'SUPPORT'}
                        </span>
                        
                        <span className="text-[10px] text-slate-600 font-mono font-bold">Ticket: #{fb.id}</span>
                        
                        <span className="flex items-center gap-1 text-[10px] text-slate-600 ml-1">
                          <Clock className="w-3 h-3 text-slate-600" />
                          {new Date(fb.createdAt?.seconds ? fb.createdAt.seconds * 1000 : fb.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      
                      <h3 className="text-base font-bold text-slate-900 group-hover:text-[#1F4C63] transition-colors leading-snug pt-1">
                        {fb.subject}
                      </h3>
                    </div>

                    <span className={`self-start text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-sm ${
                      fb.developerReply 
                        ? 'bg-[#1F4C63]/10 text-[#1F4C63] border border-[#1F4C63]/20' 
                        : 'bg-[#E08A3C]/10/60 text-amber-800 border-amber-200/40 border animate-pulse'
                    }`}>
                      {fb.developerReply ? 'Replied' : 'Pending Review'}
                    </span>
                  </div>

                  <p className="text-slate-600 text-xs leading-relaxed font-semibold bg-slate-50/75 p-4 rounded-sm border border-slate-100 ">
                    "{fb.message}"
                  </p>

                  {/* Display attachment info to student/user if attached */}
                  {fb.attachmentName && (
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-sm px-4 py-2.5 text-xs animate-fadeIn">
                      <Paperclip className="w-3.5 h-3.5 text-[#1F4C63] shrink-0" />
                      <span className="font-bold text-slate-700 font-mono text-[10.5px]">
                        Attachment: {fb.attachmentName} ({fb.attachmentSize})
                      </span>
                      {fb.attachmentDescription && (
                        <span className="text-slate-600 font-semibold font-sans italic text-[11px] border-l border-slate-200 pl-2">
                          "{fb.attachmentDescription}"
                        </span>
                      )}
                    </div>
                  )}
                  {/* DISPLAY DEVELOPER REPLY */}
                  {fb.developerReply ? (
                    <div className="border border-[#1F4C63]/20 bg-[#1F4C63]/5 p-5 rounded-sm space-y-2.5 animate-fadeIn">
                      <div className="flex items-center gap-1.5 text-[#0F1E29] font-black text-xs uppercase tracking-wider">
                        <UserCheck className="w-4 h-4 text-[#1F4C63] animate-bounce" />
                        <span>Official Support Reply</span>
                      </div>
                      <p className="text-xs text-slate-800 font-semibold leading-relaxed">
                        {fb.developerReply}
                      </p>
                      <span className="block text-[9px] text-[#1F4C63] font-mono font-bold">
                        RESPONSE TIMESTAMP: {new Date(fb.repliedAt).toLocaleString()}
                      </span>
                    </div>
                  ) : (
                    <div className="bg-[#FAF9F6] border border-orange-100/60 rounded-sm px-5 py-4 text-[11.5px] text-slate-600 font-semibold flex flex-col gap-2 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-[#E08A3C]/10/10 rounded-sm blur-xl" />
                      <div className="flex items-center gap-2 font-black uppercase tracking-wider text-[10px] text-[#E08A3C]">
                        <span className="w-2 h-2 rounded-sm bg-[#E08A3C] animate-pulse" />
                        <span>Logged safely under review</span>
                      </div>
                      <p className="leading-relaxed">
                        This ticket is logged safely and is being reviewed by our administrative team. We use smart routing credentials and helpers behind-the-scenes to speed up triage, but every submission is securely overviewed and manually signed off by a real human engineer.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

