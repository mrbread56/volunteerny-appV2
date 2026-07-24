import React from 'react';
import { Opportunity } from '../types';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { MapPin, Calendar, Clock, Bookmark, Share2, BadgeCheck, Compass, Sparkles } from 'lucide-react';
import { formatDate } from '../lib/utils';
import { Link } from 'react-router-dom';

interface OpportunityCardProps {
  opportunity: Opportunity;
  isSaved?: boolean;
  onSave?: (id: string) => void | Promise<void>;
  onShare?: (opp: Opportunity) => void;
  studentInterests?: string[]; // Optional interests to calculate dynamic match percentages
  key?: React.Key;
}

export default function OpportunityCard({ 
  opportunity, 
  isSaved, 
  onSave, 
  onShare,
  studentInterests = []
}: OpportunityCardProps) {
  
  // Calculate dynamic/motivating match percentage based on REAL overlapping skills/interests
  const getMatchPercentage = (): number => {
    if (studentInterests && studentInterests.length > 0 && opportunity.skillsNeeded && opportunity.skillsNeeded.length > 0) {
      const overlap = opportunity.skillsNeeded.filter(skill => 
        studentInterests.some(interest => interest.toLowerCase().includes(skill.toLowerCase()) || skill.toLowerCase().includes(interest.toLowerCase()))
      );
      if (overlap.length > 0) {
        return Math.round((overlap.length / opportunity.skillsNeeded.length) * 100);
      }
    }
    return 0;
  };

  const matchPercent = getMatchPercentage();

  return (
    <Card className="flex flex-col h-full bg-white rounded-sm border border-slate-200/50 hover:border-slate-300 hover: transition-all duration-300 group overflow-hidden relative">
      
      {/* Visual Design Header & Floating Bookmark Badge */}
      <div className="p-5 flex flex-col justify-between flex-grow w-full">
        
        {/* Badges Container */}
        <div className="flex items-center justify-between gap-1.5 mb-3.5">
          <div className="flex flex-wrap gap-1.5">
            <span className="px-2.5 py-0.5 rounded-sm text-[9px] font-black uppercase tracking-wider bg-[#1F4C63]/5 text-[#1F4C63] border border-[#1F4C63]/10">
              {opportunity.category}
            </span>
            {opportunity.exclusives?.map(exc => (
              <span key={exc} className="px-2.5 py-0.5 rounded-sm text-[9px] font-black uppercase tracking-wider bg-[#E08A3C]/10 text-[#E08A3C] text-[#E08A3C] border border-orange-100">
                {exc}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button 
              onClick={(e) => {
                e.preventDefault();
                onShare?.(opportunity);
              }}
              className="p-1.5 rounded-sm text-slate-600 hover:text-slate-600 hover:bg-slate-50 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Share Opportunity"
              aria-label="Share Opportunity"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={(e) => {
                e.preventDefault();
                onSave?.(opportunity.id);
              }}
              className={`p-1.5 rounded-sm transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${
                isSaved ? 'text-[#1F4C63] bg-[#1F4C63]/5' : 'text-slate-600 hover:text-[#1F4C63] hover:bg-[#1F4C63]/5'
              }`}
              title="Save to favorites"
              aria-label="Save to favorites"
            >
              <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-blue-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Brand Group (Organization + Safety badge) */}
        <div className="flex items-center gap-1.5 mb-2.5">
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wide truncate max-w-[150px]">
            {opportunity.orgName || 'Community Partner'}
          </span>
          <div className="flex items-center gap-0.5 bg-[#1F4C63]/5 text-[#1F4C63] px-1.5 py-0.5 rounded-sm border border-[#1F4C63]/10 text-[8px] font-black tracking-widest shrink-0">
             <BadgeCheck className="w-2.5 h-2.5" />
             <span>Vetted</span>
          </div>
        </div>

        {/* Title */}
        <Link to={`/student/opportunities/${opportunity.id}`} className="block">
          <h3 className="text-lg font-black text-slate-900 group-hover:text-[#1F4C63] transition-colors line-clamp-2 leading-snug min-h-[2.75rem] mb-3">
            {opportunity.title}
          </h3>
        </Link>

        {/* Match Percentage Pill - Only show for actual logged in students with positive skills matching */}
        {matchPercent > 0 && (
          <div className="mb-4 inline-flex items-center gap-1 px-2.5 py-1 rounded-sm bg-[#E08A3C]/10 text-[#E08A3C] border border-orange-100 text-[10px] font-extrabold w-fit shrink-0">
             <Sparkles className="w-3.5 h-3.5 text-[#E08A3C] animate-pulse" />
             <span>{matchPercent}% Skills Match</span>
          </div>
        )}

        {/* Details Checklist */}
        <div className="space-y-2.5 border-t border-slate-100 pt-3.5 mb-4">
          <div className="flex items-center gap-2.5 text-slate-600">
            <div className="p-1 bg-slate-50 rounded-sm shrink-0">
              <MapPin className="w-3.5 h-3.5 text-slate-600" />
            </div>
            <span className="text-xs font-semibold text-slate-600 truncate">{opportunity.location}</span>
          </div>
          
          <div className="flex items-center gap-2.5 text-slate-600">
            <div className="p-1 bg-slate-50 rounded-sm shrink-0">
              <Calendar className="w-3.5 h-3.5 text-slate-600" />
            </div>
            <span className="text-xs font-semibold text-slate-600">
              {opportunity.scheduleType === 'recurring' ? (
                <span className="flex items-center gap-1 hover:text-[#1F4C63]">
                  Recurring <span className="bg-[#1F4C63]/5 text-[#1F4C63] font-extrabold text-[8px] px-1 rounded">Weekly</span>
                </span>
              ) : opportunity.scheduleType === 'multiple' ? (
                <span className="flex items-center gap-1">
                  Multi-day <span className="bg-[#1F4C63]/5 text-[#1F4C63] font-extrabold text-[8px] px-1 rounded">{opportunity.shifts?.length || 0} dates</span>
                </span>
              ) : (
                formatDate(opportunity.dateTime?.toDate ? opportunity.dateTime.toDate() : opportunity.dateTime)
              )}
            </span>
          </div>

          <div className="flex items-center gap-2.5 text-slate-600">
            <div className="p-1 bg-slate-50 rounded-sm shrink-0">
              <Clock className="w-3.5 h-3.5 text-slate-600" />
            </div>
            <span className="text-xs font-semibold text-slate-600">{opportunity.timeCommitment}</span>
          </div>
        </div>

        {/* Student-Friendly Skills Tags list container as requested */}
        {opportunity.skillsNeeded && opportunity.skillsNeeded.length > 0 && (
          <div className="mb-4">
            <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-600 mb-1.5">Acquire Credentials</p>
            <div className="flex flex-wrap gap-1">
              {opportunity.skillsNeeded.slice(0, 3).map((skill, idx) => (
                <span key={idx} className="px-2 py-0.5 bg-slate-100 rounded text-[9px] font-semibold text-slate-600">
                  #{skill}
                </span>
              ))}
              {opportunity.skillsNeeded.length > 3 && (
                <span className="px-2 py-0.5 bg-slate-50 rounded text-[9px] font-extrabold text-[#1F4C63] shrink-0">
                  +{opportunity.skillsNeeded.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* High-Converting CTA action orange button as specified */}
        <div className="mt-auto pt-2">
          <Link to={`/student/opportunities/${opportunity.id}`} className="block">
            <Button className="w-full bg-[#E08A3C] hover:bg-[#E08A3C] text-white font-bold py-3 text-xs uppercase tracking-wide rounded-sm  cursor-pointer transition-all active:scale-[0.98]">
              View & Quick Apply
            </Button>
          </Link>
        </div>

      </div>
    </Card>
  );
}
