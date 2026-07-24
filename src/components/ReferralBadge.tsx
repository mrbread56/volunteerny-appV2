import React from 'react';
import { Award, Medal, Trophy } from 'lucide-react';
import { cn } from '../lib/utils';

interface ReferralBadgeProps {
  count: number;
  className?: string;
}

export default function ReferralBadge({ count, className }: ReferralBadgeProps) {
  if (count < 3) return null;

  let config = {
    label: "Community Ambassador",
    icon: <Medal className="w-4 h-4 text-[#cd7f32]" />,
    bg: "bg-orange-50",
    border: "border-[#cd7f32]/20",
    text: "text-[#cd7f32]"
  };

  if (count >= 10) {
    config = {
      label: "Master Connector",
      icon: <Trophy className="w-4 h-4 text-yellow-500" />,
      bg: "bg-yellow-50",
      border: "border-yellow-500/20",
      text: "text-yellow-600"
    };
  } else if (count >= 5) {
    config = {
      label: "Super Ambassador",
      icon: <Award className="w-4 h-4 text-slate-400" />,
      bg: "bg-slate-50",
      border: "border-slate-400/20",
      text: "text-slate-600"
    };
  }

  return (
    <div className={cn(
      "flex items-center gap-1.5 px-3 py-1 rounded-full border shadow-sm transition-all hover:-translate-y-0.5",
      config.bg,
      config.border,
      className
    )}>
      {config.icon}
      <span className={cn("text-[10px] font-black uppercase tracking-wider", config.text)}>
        {config.label}
      </span>
    </div>
  );
}
