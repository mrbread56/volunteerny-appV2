import React, { useRef, useState, useEffect } from 'react';
import { ShieldCheck, Printer, Clipboard, Clock, CheckCircle, FileText, Download, Mail, Check, Loader2 } from 'lucide-react';
import { Button } from './ui/Button';
import { sendTransactionalEmail } from '../lib/emailService';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  application: {
    id: string;
    opportunityTitle?: string;
    studentName?: string;
    studentEmail?: string;
    studentGrade?: string;
    studentSchool?: string;
    appliedAt?: any;
    status: string;
    message?: string;
  };
  organizationName?: string;
}

export default function ReceiptModal({ isOpen, onClose, application, organizationName = "York Volunteer Partner" }: ReceiptModalProps) {
  const receiptRef = useRef<HTMLDivElement>(null);
  
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

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

  const handlePrint = () => {
    const printContent = receiptRef.current?.innerHTML;
    if (!printContent) return;

    const originalContent = document.body.innerHTML;
    const printWindow = window.open('', '', 'height=600,width=800');
    
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Enrollment Receipt - ${application.studentName || 'Volunteer'}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              @media print {
                body { padding: 40px; background: white; color: black; }
                .no-print { display: none !important; }
              }
            </style>
          </head>
          <body>
            <div>${printContent}</div>
            <script>
              window.onload = function() {
                window.print();
                window.close();
              }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  // Construct readable validation dates and tokens
  const formattedDate = application.appliedAt 
    ? (application.appliedAt?.seconds 
        ? new Date(application.appliedAt.seconds * 1000).toLocaleDateString(undefined, { dateStyle: 'long' }) 
        : new Date(application.appliedAt).toLocaleDateString(undefined, { dateStyle: 'long' }))
    : new Date().toLocaleDateString(undefined, { dateStyle: 'long' });

  const generatedSerial = `YVR-${application.id.substr(0, 6).toUpperCase()}-${(application.studentName || 'VOL').substring(0, 3).toUpperCase()}-${new Date().getFullYear()}`;

  const handleSendEmailReceipt = async () => {
    setIsSendingEmail(true);
    setEmailStatus(null);
    try {
      const res = await sendTransactionalEmail({
        to: application.studentEmail || "student@example.com",
        subject: `📄 [Receipt Confirmation] ${application.opportunityTitle || 'Community Service Participation'}`,
        templateName: 'application_status',
        templateData: {
          studentName: application.studentName || 'Student',
          oppTitle: application.opportunityTitle || 'Community Service Participation',
          orgName: organizationName,
          status: 'accepted',
          note: `Verification Receipt. Placement Serial: ${generatedSerial}. Verification Date: ${formattedDate}. Verified & Secured.`
        }
      });
      if (res.success) {
        setEmailStatus("Emailed!");
      } else {
        setEmailStatus("Failed email");
      }
    } catch (e: any) {
      setEmailStatus("Failed email");
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-white rounded-sm max-w-lg w-full overflow-hidden  border border-slate-100 flex flex-col max-h-[90vh]">
        
        {/* Receipt content wrapper */}
        <div className="p-3 sm:p-8 overflow-y-auto flex-1 space-y-6">
          <div ref={receiptRef} className="bg-[#FAF9F6] border-2 border-dashed border-slate-200 rounded-sm p-4.5 sm:p-6 text-slate-800 space-y-6 relative overflow-hidden">
            {/* Top Security Cutouts on the sides for simulated ticket feel */}
            <div className="absolute -left-3 top-1/2 -mt-3 w-6 h-6 rounded-sm bg-white border-r border-slate-200" />
            <div className="absolute -right-3 top-1/2 -mt-3 w-6 h-6 rounded-sm bg-white border-l border-slate-200" />
            
            {/* Header branding */}
            <div className="text-center space-y-1 pb-4 border-b-2 border-dotted border-slate-200 border-slate-200">
              <span className="text-[9px] font-black uppercase text-[#1F4C63] tracking-widest bg-[#1F4C63]/5/80 px-3 py-1 rounded-sm border border-[#1F4C63]/20 inline-block">
                Verification Receipt
              </span>
              <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">YORK VOLUNTEER TRUST</h1>
              <p className="text-[10px] text-slate-600 font-bold tracking-widest uppercase">Safe Space Voluntary Enrollment Slip</p>
            </div>

            {/* Official verification stamp */}
            <div className="flex items-center justify-between gap-4 bg-white/80 backdrop-blur-sm p-4 rounded-sm border border-[#1F4C63]/10">
              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-600 uppercase tracking-widest font-extrabold block">ENROLLMENT STATUS</span>
                <span className="text-[#1F4C63] font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-sm bg-[#1F4C63] animate-ping" />
                  CONFIRMED & ACCEPTED
                </span>
              </div>
              <div className="w-10 h-10 rounded-sm bg-[#1F4C63]/10 flex items-center justify-center text-[#1F4C63]">
                <ShieldCheck className="w-6 h-6" />
              </div>
            </div>

            {/* Structured details */}
            <div className="space-y-4 text-xs font-semibold leading-relaxed">
              <div className="grid grid-cols-2 gap-4 pb-3 border-b border-slate-200/50">
                <div>
                  <span className="text-[9px] text-slate-600 uppercase tracking-widest block font-extrabold">Student Volunteer</span>
                  <p className="text-slate-900 font-extrabold">{application.studentName || 'Volunteer Student'}</p>
                </div>
                <div>
                  <span className="text-[9px] text-slate-600 uppercase tracking-widest block font-extrabold">Contact Profile</span>
                  <p className="text-slate-700 font-mono text-[11px] truncate">{application.studentEmail || 'N/A'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pb-3 border-b border-slate-200/50">
                <div>
                  <span className="text-[9px] text-slate-600 uppercase tracking-widest block font-extrabold">Primary Institution</span>
                  <p className="text-slate-800 font-bold">{application.studentSchool || 'York Region Secondary'}</p>
                </div>
                <div>
                  <span className="text-[9px] text-slate-600 uppercase tracking-widest block font-extrabold">Academic Cohort</span>
                  <p className="text-slate-700 font-bold">Grade {application.studentGrade || 'Secondary'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-1 pb-3 border-b border-slate-200/50">
                <span className="text-[9px] text-slate-600 uppercase tracking-widest block font-extrabold">Hosting Organization</span>
                <p className="text-slate-900 font-extrabold text-xs">{organizationName}</p>
              </div>

              <div className="grid grid-cols-1 gap-1 pb-3 border-b border-slate-200/50">
                <span className="text-[9px] text-slate-600 uppercase tracking-widest block font-extrabold">Opportunity Placement</span>
                <p className="text-[#FF6B35] font-black text-xs uppercase">{application.opportunityTitle || 'Community Service'}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[9px] text-slate-600 uppercase tracking-widest block font-extrabold">Enrollment Date</span>
                  <p className="text-slate-800 font-bold">{formattedDate}</p>
                </div>
                <div>
                  <span className="text-[9px] text-slate-600 uppercase tracking-widest block font-extrabold">Placement Serial</span>
                  <p className="text-slate-800 font-mono font-bold leading-none">{generatedSerial}</p>
                </div>
              </div>
            </div>

            {/* Security Barcode */}
            <div className="pt-4 border-t-2 border-slate-200/50 text-center space-y-1">
              <div className="font-mono text-xl tracking-[0.2em] font-light text-slate-600 flex justify-center h-8 select-none overflow-hidden select-none">
                |||||| | |||||||| |||| || | || ||||| | |||
              </div>
              <span className="font-mono text-[9px] tracking-widest text-slate-600 text-slate-600">
                SECURE-ID: {application.id.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 flex flex-col gap-3">
          {emailStatus && (
            <div className="text-center text-[10px] font-black text-emerald-600 uppercase tracking-widest p-2 bg-emerald-50 border border-emerald-200 rounded-sm mb-1 animate-in zoom-in-95">
              📧 {emailStatus}
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button 
              variant="outline"
              className="flex-1 font-black uppercase text-[10px] tracking-wider py-3 rounded-sm flex items-center justify-center gap-1.5 bg-white border-slate-200"
              onClick={handlePrint}
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>Print PDF</span>
            </Button>
            
            <Button 
              variant="outline"
              disabled={isSendingEmail}
              className="flex-1 font-black uppercase text-[10px] tracking-wider py-3 rounded-sm flex items-center justify-center gap-1.5 bg-white border-slate-200"
              onClick={handleSendEmailReceipt}
            >
              {isSendingEmail ? (
                <Loader2 className="w-4 h-4 text-slate-600 animate-spin" />
              ) : (
                <Mail className="w-4 h-4 text-slate-600" />
              )}
              <span>{isSendingEmail ? "Sending..." : "Email Receipt"}</span>
            </Button>

            <Button 
              className="flex-1 font-black uppercase text-[10px] tracking-wider py-3 rounded-sm bg-[#1F4C63] hover:bg-[#153343] text-white  shadow-blue-500/10"
              onClick={onClose}
            >
              Close
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
