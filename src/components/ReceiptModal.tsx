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
    <div className="fixed inset-0 bg-paper-3/45 backdrop-blur-sm flex items-center justify-center zp-6 sm:p-8 animate-fadeIn">
      <div className="bg-white rounded-lg max-w-lg w-full overflow-hidden  border border-line flex flex-col max-h-[90vh]">
        
        {/* Receipt content wrapper */}
        <div className="p-3 sm:p-8 overflow-y-auto flex-1 space-y-8">
          <div ref={receiptRef} className="bg-[#FAF9F6] border-2 border-dashed border-line rounded-lg p-4.5 sm:p-6 text-ink-soft space-y-8 relative overflow-hidden">
            {/* Top Security Cutouts on the sides for simulated ticket feel */}
            <div className="absolute -left-3 top-1/2 -mt-3 w-6 h-6 rounded-lg bg-white border-r border-line" />
            <div className="absolute -right-3 top-1/2 -mt-3 w-6 h-6 rounded-lg bg-white border-l border-line" />
            
            {/* Header branding */}
            <div className="text-center space-y-1 pb-4 border-b-2 border-dotted border-line border-line">
              <span className="text-xs font-semibold uppercase text-[#1F4C63] tracking-widest bg-[#1F4C63]/5/80 px-3 py-1 rounded-lg border border-[#1F4C63]/20 inline-block">
                Verification Receipt
              </span>
              <h1 className="text-xl font-semibold text-ink tracking-tight uppercase">YORK VOLUNTEER TRUST</h1>
              <p className="text-xs text-ink-soft font-bold tracking-widest uppercase">Safe Space Voluntary Enrollment Slip</p>
            </div>

            {/* Official verification stamp */}
            <div className="flex items-center justify-between gap-4 bg-white/80 backdrop-blur-sm p-4 rounded-lg border border-[#1F4C63]/10">
              <div className="space-y-0.5">
                <span className="text-xs text-ink-soft tracking-wide font-semibold block">ENROLLMENT STATUS</span>
                <span className="text-[#1F4C63] font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-lg bg-[#1F4C63] animate-ping" />
                  CONFIRMED & ACCEPTED
                </span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#1F4C63]/10 flex items-center justify-center text-[#1F4C63]">
                <ShieldCheck className="w-6 h-6" />
              </div>
            </div>

            {/* Structured details */}
            <div className="space-y-4 text-xs font-semibold leading-relaxed">
              <div className="grid grid-cols-2 gap-4 pb-3 border-b border-line/50">
                <div>
                  <span className="text-xs text-ink-soft tracking-wide block font-semibold">Student Volunteer</span>
                  <p className="text-ink font-semibold">{application.studentName || 'Volunteer Student'}</p>
                </div>
                <div>
                  <span className="text-xs text-ink-soft tracking-wide block font-semibold">Contact Profile</span>
                  <p className="text-ink-soft font-mono text-xs truncate">{application.studentEmail || 'N/A'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pb-3 border-b border-line/50">
                <div>
                  <span className="text-xs text-ink-soft tracking-wide block font-semibold">Primary Institution</span>
                  <p className="text-ink-soft font-bold">{application.studentSchool || 'York Region Secondary'}</p>
                </div>
                <div>
                  <span className="text-xs text-ink-soft tracking-wide block font-semibold">Academic Cohort</span>
                  <p className="text-ink-soft font-bold">Grade {application.studentGrade || 'Secondary'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-1 pb-3 border-b border-line/50">
                <span className="text-xs text-ink-soft tracking-wide block font-semibold">Hosting Organization</span>
                <p className="text-ink font-semibold text-xs">{organizationName}</p>
              </div>

              <div className="grid grid-cols-1 gap-1 pb-3 border-b border-line/50">
                <span className="text-xs text-ink-soft tracking-wide block font-semibold">Opportunity Placement</span>
                <p className="text-[#FF6B35] font-semibold text-xs uppercase">{application.opportunityTitle || 'Community Service'}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-ink-soft tracking-wide block font-semibold">Enrollment Date</span>
                  <p className="text-ink-soft font-bold">{formattedDate}</p>
                </div>
                <div>
                  <span className="text-xs text-ink-soft tracking-wide block font-semibold">Placement Serial</span>
                  <p className="text-ink-soft font-mono font-bold leading-none">{generatedSerial}</p>
                </div>
              </div>
            </div>

            {/* Security Barcode */}
            <div className="pt-4 border-t-2 border-line/50 text-center space-y-1">
              <div className="font-mono text-xl tracking-wide font-light text-ink-soft flex justify-center h-8 select-none overflow-hidden select-none">
                |||||| | |||||||| |||| || | || ||||| | |||
              </div>
              <span className="font-mono text-xs tracking-widest text-ink-soft text-ink-soft">
                SECURE-ID: {application.id.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="p-6 bg-paper-2 border-t border-line flex flex-col gap-3">
          {emailStatus && (
            <div className="text-center text-xs font-semibold text-emerald-600 tracking-wide p-2 bg-emerald-50 border border-emerald-200 rounded-lg mb-1 animate-in zoom-in-95">
              📧 {emailStatus}
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button 
              variant="outline"
              className="flex-1 font-semibold uppercase text-xs tracking-wider py-3 rounded-lg flex items-center justify-center gap-1.5 bg-white border-line"
              onClick={handlePrint}
            >
              <Printer className="w-4 h-4 text-ink-soft" />
              <span>Print PDF</span>
            </Button>
            
            <Button 
              variant="outline"
              disabled={isSendingEmail}
              className="flex-1 font-semibold uppercase text-xs tracking-wider py-3 rounded-lg flex items-center justify-center gap-1.5 bg-white border-line"
              onClick={handleSendEmailReceipt}
            >
              {isSendingEmail ? (
                <Loader2 className="w-4 h-4 text-ink-soft animate-spin" />
              ) : (
                <Mail className="w-4 h-4 text-ink-soft" />
              )}
              <span>{isSendingEmail ? "Sending..." : "Email Receipt"}</span>
            </Button>

            <Button 
              className="flex-1 font-semibold uppercase text-xs tracking-wider py-3 rounded-lg bg-[#1F4C63] hover:bg-[#153343] text-white  shadow-blue-500/10"
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
