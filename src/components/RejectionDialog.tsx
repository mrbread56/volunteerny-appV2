import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { X, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface RejectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, note: string) => void;
  studentName: string;
}

const PRESET_REASONS = [
  "Position has been filled",
  "Schedule doesn't match our needs",
  "Looking for more specific experience",
  "Opportunity has been cancelled",
  "Incomplete application",
  "No reason provided (Silent rejection)"
];

export default function RejectionDialog({ isOpen, onClose, onConfirm, studentName }: RejectionDialogProps) {
  const [selectedReason, setSelectedReason] = useState('');
  const [note, setNote] = useState('');
  const [isOther, setIsOther] = useState(false);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalReason = isOther ? 'Other' : selectedReason;
    onConfirm(finalReason, note);
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-lg"
        >
          <Card className="border-none  rounded-sm overflow-hidden bg-white max-h-[90vh] flex flex-col">
            <CardHeader className="p-8 border-b border-slate-50 flex flex-row items-center justify-between shrink-0">
              <div>
                <CardTitle className="text-xl font-black text-slate-900 uppercase tracking-tight">Reject Application</CardTitle>
                <p className="text-xs text-slate-600 font-bold mt-1 uppercase tracking-widest leading-none">For {studentName}</p>
              </div>
              <button aria-label="Close" onClick={onClose} className="p-2 hover:bg-slate-100 rounded-sm transition-colors rounded-full">
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </CardHeader>
             <CardContent className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-grow min-h-0">
               <div className="bg-red-50 p-6 rounded-sm border border-red-100 flex gap-4 shrink-0">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <p className="text-xs text-red-700 leading-relaxed font-medium">
                     Please provide a reason for the rejection. This helps students improve their future applications.
                  </p>
               </div>

               <form id="rejection-form" onSubmit={handleSubmit} className="space-y-6 pb-2">
                 <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest pl-1">Primary Reason</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                       {PRESET_REASONS.map((reason) => (
                         <button
                           key={reason}
                           type="button"
                           onClick={() => {
                             setSelectedReason(reason);
                             setIsOther(false);
                           }}
                           className={`text-left p-4 rounded-sm border-2 transition-all text-xs font-bold leading-tight ${
                             selectedReason === reason && !isOther 
                               ? 'border-red-600 bg-red-50 text-red-700' 
                               : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-200'
                           }`}
                         >
                           {reason}
                         </button>
                       ))}
                       <button
                         type="button"
                         onClick={() => {
                           setIsOther(true);
                           setSelectedReason('');
                         }}
                         className={`text-left p-4 rounded-sm border-2 transition-all text-xs font-bold leading-tight ${
                           isOther 
                             ? 'border-red-600 bg-red-50 text-red-700' 
                             : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-200'
                         }`}
                       >
                         Other / Custom Reason
                       </button>
                    </div>
                 </div>

                 {(isOther || selectedReason) && (
                    <div className="space-y-3 animate-in fade-in slide-in- duration-300">
                       <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest pl-1">
                         {isOther ? "Typed Reason" : "Additional Note (Optional)"}
                       </p>
                       <textarea
                         className="w-full p-6 rounded-sm bg-slate-50 border-2 border-slate-100 focus:border-red-600 focus:ring-0 transition-all text-sm min-h-[100px] font-medium"
                         placeholder={isOther ? "Please explain why here..." : "Add a short encouraging note..."}
                         value={note}
                         onChange={(e) => setNote(e.target.value)}
                         required={isOther}
                       />
                    </div>
                 )}
               </form>
            </CardContent>

            <div className="p-8 border-t border-slate-50 bg-slate-50/50 flex gap-4 shrink-0">
               <Button type="button" variant="ghost" onClick={onClose} className="flex-1 rounded-sm h-14 font-black uppercase text-xs tracking-widest">
                  Cancel
               </Button>
               <Button 
                 form="rejection-form"
                 type="submit" 
                 className="flex-[2] bg-red-600 hover:bg-red-700 text-white rounded-sm h-14 font-black uppercase text-xs tracking-widest  shadow-red-100"
                 disabled={!selectedReason && !isOther}
               >
                  Confirm Rejection
               </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
