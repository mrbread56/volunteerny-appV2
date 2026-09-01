import { useDialog } from '../hooks/useDialog';
import  { useRef, useState, useEffect } from 'react';
import { ShieldCheck, Printer, Mail, Loader2 } from 'lucide-react';
import { Button } from './ui/Button';
import { sendTransactionalEmail } from '../lib/emailService';
import { cn } from '../lib/utils';

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

  const dialogRef = useDialog(isOpen, onClose);

  if (!isOpen) return null;

  const handlePrint = () => {
    const printContent = receiptRef.current?.innerHTML;
    if (!printContent) return;

    const printWindow = window.open('', '', 'height=600,width=800');
    
    if (printWindow) {
      // The title is set via document.title AFTER the write, not interpolated
      // into the markup. studentName comes from the application document and
      // the student writes their own name, so `</title><script>…` in a name
      // field executed in the ORGANIZATION's browser every time they printed
      // that student's receipt. Assigning to .title treats the value as text.
      printWindow.document.write(`
        <html>
          <head>
            <title>Enrollment Receipt</title>
            <style>
              body { 
                font-family: system-ui, -apple-system, sans-serif;
                line-height: 1.5;
                color: #000;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
              }
              .text-center { text-align: center; }
              .text-xs { font-size: 0.75rem; }
              .text-xl { font-size: 1.25rem; }
              .font-semibold, .font-bold { font-weight: 600; }
              .uppercase { text-transform: uppercase; }
              .grid { display: grid; }
              .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
              .gap-4 { gap: 1rem; }
              .pb-3 { padding-bottom: 0.75rem; }
              .border-b { border-bottom: 1px solid #e5e7eb; }
              .text-ink-soft { color: #4b5563; }
              .font-mono { font-family: monospace; }
              .pt-4 { padding-top: 1rem; }
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
      // Text, not markup — this is the escaping.
      printWindow.document.title = `Enrollment Receipt - ${application.studentName || 'Volunteer'}`;
      printWindow.document.close();
    }
  };

  // Construct readable validation dates and tokens
  const formattedDate = application.appliedAt 
    ? (application.appliedAt?.seconds 
        ? new Date(application.appliedAt.seconds * 1000).toLocaleDateString(undefined, { dateStyle: 'long' }) 
        : new Date(application.appliedAt).toLocaleDateString(undefined, { dateStyle: 'long' }))
    : new Date().toLocaleDateString(undefined, { dateStyle: 'long' });

  /*
   * The application id, presented as what it is.
   *
   * This was `YVR-<id>-<NAME>-<year>`, generated fresh at render, stored
   * nowhere and checkable by nobody, and it was labelled "Reference number" on
   * a document badged "Verified & Secured" and emailed as a "Verification
   * Receipt". server/emailTemplates.ts records the identical invention being
   * deleted from the hours email for exactly this reason: a trust claim the
   * system cannot back is worse than no claim at all.
   *
   * The id is real and does identify the record, so it stays. What goes is the
   * costume: no invented prefix, no fake year suffix, and no language implying
   * anyone can verify it.
   */
  const applicationRef = application.id;

  const handleSendEmailReceipt = async () => {
    // No placeholder recipient.
    //
    // This was `application.studentEmail || "student@example.com"`, and
    // applications never store studentEmail — the apply form does not write it.
    // The student's own dashboard injects it before opening this modal, so that
    // path works; the organization's two call sites pass the raw Firestore
    // document, so every receipt an organization sent went to the literal
    // sandbox address while the button reported "Emailed!". Refuse instead of
    // lying about where it went.
    if (!application.studentEmail) {
      setEmailStatus("No address on file");
      return;
    }
    setIsSendingEmail(true);
    setEmailStatus(null);
    try {
      const res = await sendTransactionalEmail({
        to: application.studentEmail,
        subject: `📄 [Receipt Confirmation] ${application.opportunityTitle || 'Community Service Participation'}`,
        templateName: 'application_status',
        templateData: {
          studentName: application.studentName || 'Student',
          oppTitle: application.opportunityTitle || 'Community Service Participation',
          orgName: organizationName,
          status: 'accepted',
          // No "Verified & Secured", and no "Verification Receipt". Nothing
          // verifies this and nothing can: there is no lookup, no signature and
          // no record of the reference anywhere. It is a confirmation that the
          // placement was accepted, which is true and is enough.
          note: `Placement confirmation. Reference: ${applicationRef}. Accepted on ${formattedDate}. `
            + `This is not an official school document. You still need your school board's own community involvement form, signed by your supervisor.`
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
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Record of accepted application"
      className="fixed inset-0 bg-paper-3/45 backdrop-blur-sm flex items-center justify-center z-50 p-6 sm:p-8 animate-fadeIn"
    >
      <div className="bg-white rounded-lg max-w-lg w-full overflow-hidden  border border-line flex flex-col max-h-[90vh]">
        
        {/* Receipt content wrapper */}
        <div className="p-3 sm:p-8 overflow-y-auto flex-1 space-y-8">
          <div ref={receiptRef} className="bg-[#FAF9F6] border-2 border-dashed border-line rounded-lg p-4.5 sm:p-6 text-ink-soft space-y-8 relative overflow-hidden">
            {/* Top Security Cutouts on the sides for simulated ticket feel */}
            <div className="absolute -left-3 top-1/2 -mt-3 w-6 h-6 rounded-lg bg-white border-r border-line" />
            <div className="absolute -right-3 top-1/2 -mt-3 w-6 h-6 rounded-lg bg-white border-l border-line" />
            
            {/* Header branding */}
            <div className="text-center space-y-1 pb-4 border-b-2 border-dotted border-line border-line">
              <span className="text-xs font-semibold uppercase text-blue-dark tracking-widest bg-blue-dark/5 px-3 py-1 rounded-lg border border-blue-dark/20 inline-block">
                Placement Record
              </span>
              <h1 className="text-xl font-semibold text-ink tracking-tight uppercase">Volunteer North York</h1>
              <p className="text-xs text-ink-soft font-bold tracking-widest uppercase">Record of accepted application</p>
            </div>

            {/* Official verification stamp */}
            <div className="flex items-center justify-between gap-4 bg-white/80 backdrop-blur-sm p-4 rounded-lg border border-blue-dark/10">
              <div className="space-y-0.5">
                <span className="text-xs text-ink-soft tracking-wide font-semibold block">PLACEMENT STATUS</span>
                <span className="text-blue-dark font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-lg bg-blue-dark " />
                  CONFIRMED & ACCEPTED
                </span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-dark/10 flex items-center justify-center text-blue-dark">
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
                  <span className="text-xs text-ink-soft tracking-wide block font-semibold">Email</span>
                  <p className="text-ink-soft font-mono text-xs truncate">{application.studentEmail || 'N/A'}</p>
                </div>
              </div>

              {/*
                * Rendered only when the values are actually present.
                *
                * These were `application.studentSchool || 'York Region
                * Secondary'` and `Grade {application.studentGrade ||
                * 'Secondary'}`. Nothing writes either field: the apply payload
                * omits them and firestore.rules' hasOnly on applications makes
                * writing them impossible, so the fallbacks were not fallbacks —
                * they were the only values an organisation ever saw. Every
                * receipt printed by an org stated the volunteer attends "York
                * Region Secondary" in "Grade Secondary": invented identity data
                * on a serial-numbered document badged "Verified & Secured".
                *
                * This same file already refuses to send when the email is
                * missing rather than inventing one. The two fields beside it
                * were left doing the opposite.
                */}
              {(application.studentSchool || application.studentGrade) && (
                <div className="grid grid-cols-2 gap-4 pb-3 border-b border-line/50">
                  {application.studentSchool && (
                    <div>
                      <span className="text-xs text-ink-soft tracking-wide block font-semibold">School</span>
                      <p className="text-ink-soft font-bold">{application.studentSchool}</p>
                    </div>
                  )}
                  {application.studentGrade && (
                    <div>
                      <span className="text-xs text-ink-soft tracking-wide block font-semibold">Grade</span>
                      <p className="text-ink-soft font-bold">Grade {application.studentGrade}</p>
                    </div>
                  )}
                </div>
              )}

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
                  <span className="text-xs text-ink-soft tracking-wide block font-semibold">Accepted on</span>
                  <p className="text-ink-soft font-bold">{formattedDate}</p>
                </div>
                <div>
                  <span className="text-xs text-ink-soft tracking-wide block font-semibold">Reference</span>
                  <p className="text-ink-soft font-mono font-bold leading-none break-all">{applicationRef}</p>
                </div>
              </div>
            </div>

            {/*
              * The pipe art that used to sit here is gone.
              *
              * It was labelled "Security Barcode" and drew a fixed, hardcoded
              * row of bars that encoded nothing and scanned as nothing. On a
              * document a student hands to a guidance office, a barcode is a
              * claim that someone can check this — and nobody can. Marking it
              * aria-hidden fixed the screen-reader noise and left the visual
              * lie in place for everybody else.
              *
              * What replaces it is the sentence the printed hours transcript
              * already carries, and which this receipt did not.
              */}
            <div className="pt-4 border-t-2 border-line/50 text-center space-y-2">
              <span className="font-mono text-xs tracking-widest text-ink-soft block">
                Reference: {applicationRef}
              </span>
              <p className="text-xs text-ink-muted leading-relaxed max-w-sm mx-auto">
                This is a record of an accepted placement. It is not an official
                school document. You still need your school board's own community
                involvement form, signed by your supervisor.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="p-6 bg-paper-2 border-t border-line flex flex-col gap-3">
          {/* Coloured by OUTCOME. This rendered every value in emerald with a
              📧 prefix, including "Failed email" and "No address on file" — so
              an organization pressing Email Receipt for a student with no
              address on file got a green confirmation box and reasonably
              concluded it had been sent. */}
          {emailStatus && (() => {
            const sent = emailStatus === 'Emailed!';
            return (
              <div
                role={sent ? undefined : 'alert'}
                className={cn(
                  'text-center text-xs font-semibold tracking-wide p-2 border rounded-lg mb-1 animate-in zoom-in-95',
                  sent
                    ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                    : 'text-red-700 bg-red-50 border-red-200',
                )}
              >
                {sent ? '📧 ' : ''}{emailStatus}
              </div>
            );
          })()}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button 
              variant="outline"
              className="flex-1 font-semibold uppercase text-xs tracking-wider py-3 rounded-lg flex items-center justify-center gap-1.5 bg-white border-line"
              onClick={handlePrint}
            >
              <Printer className="w-4 h-4 text-ink-soft" />
              <span>Print</span>
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
              className="flex-1 font-semibold uppercase text-xs tracking-wider py-3 rounded-lg bg-blue-dark hover:bg-[#153343] text-white "
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
