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
    <Card className="flex flex-col h-full bg-white rounded-xl border border-line/50 hover:border-blue-dark/30 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group overflow-hidden relative">
      
      {/* Visual Design Header & Floating Bookmark Badge */}
      <div className="p-5 flex flex-col justify-between flex-grow w-full">
        
        {/* Badges Container */}
        <div className="flex items-center justify-between gap-1.5 mb-3.5">
          <div className="flex flex-wrap gap-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-dark/5 text-blue-dark border border-blue-dark/10">
              {opportunity.category}
            </span>
            {opportunity.exclusives?.map(exc => (
              <span key={exc} className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber/10 text-amber-dark border border-orange-100">
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
              className="p-1.5 rounded-lg text-ink-soft hover:text-ink-soft hover:bg-paper-2 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
              title="Share Opportunity"
              aria-label="Share Opportunity"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button 
              onClick={(e) => {
                e.preventDefault();
                onSave?.(opportunity.id);
              }}
              className={`p-1.5 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center ${
                isSaved ? 'text-blue-dark bg-blue-dark/5' : 'text-ink-soft hover:text-blue-dark hover:bg-blue-dark/5'
              }`}
              title="Save to favorites"
              aria-label="Save to favorites"
            >
              <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-blue-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Brand Group (Organization + Safety badge) */}
        <div className="flex items-center gap-1.5 mb-2.5">
          <span className="text-xs font-bold text-ink-soft uppercase tracking-wide truncate max-w-[150px]">
            {opportunity.orgName || 'Community Partner'}
          </span>
          <div className="flex items-center gap-0.5 bg-blue-dark/5 text-blue-dark px-1.5 py-0.5 rounded-full border border-blue-dark/10 text-[8px] font-bold tracking-widest shrink-0">
             <BadgeCheck className="w-2.5 h-2.5" />
             <span>VETTED</span>
          </div>
        </div>

        {/* Title */}
        <Link to={`/student/opportunities/${opportunity.id}`} className="block">
          <h3 className="text-lg font-bold text-ink group-hover:text-blue-dark transition-colors line-clamp-2 leading-snug min-h-[2.75rem] mb-3">
            {opportunity.title}
          </h3>
        </Link>

        {/* Match Percentage Pill - Only show for actual logged in students with positive skills matching */}
        {matchPercent > 0 && (
          <div className="mb-4 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber/10 text-amber-dark border border-orange-100 text-xs font-bold w-fit shrink-0">
             <Sparkles className="w-3.5 h-3.5 text-amber-dark animate-pulse" />
             <span>{matchPercent}% SKILLS MATCH</span>
          </div>
        )}

        {/* Details Checklist */}
        <div className="space-y-3 border-t border-line pt-3.5 mb-4">
          <div className="flex items-center gap-2.5 text-ink-soft">
            <div className="p-1 bg-paper-2 rounded-md shrink-0">
              <MapPin className="w-3.5 h-3.5 text-ink-soft" />
            </div>
            <span className="text-xs font-medium text-ink-soft truncate">{opportunity.location}</span>
          </div>
          
          <div className="flex items-center gap-2.5 text-ink-soft">
            <div className="p-1 bg-paper-2 rounded-lg shrink-0">
              <Calendar className="w-3.5 h-3.5 text-ink-soft" />
            </div>
            <span className="text-xs font-semibold text-ink-soft">
              {opportunity.scheduleType === 'recurring' ? (
                <span className="flex items-center gap-1 hover:text-blue-dark">
                  Recurring <span className="bg-blue-dark/5 text-blue-dark font-semibold text-[8px] px-1 rounded">Weekly</span>
                </span>
              ) : opportunity.scheduleType === 'multiple' ? (
                <span className="flex items-center gap-1">
                  Multi-day <span className="bg-blue-dark/5 text-blue-dark font-semibold text-[8px] px-1 rounded">{opportunity.shifts?.length || 0} dates</span>
                </span>
              ) : (
                // formatDate returns '' when there is no usable date (it used
                // to throw and blank the page). Say so rather than showing a
                // gap where a date should be.
                formatDate(opportunity.dateTime?.toDate ? opportunity.dateTime.toDate() : opportunity.dateTime)
                  || 'Date to be announced'
              )}
            </span>
          </div>

          <div className="flex items-center gap-2.5 text-ink-soft">
            <div className="p-1 bg-paper-2 rounded-lg shrink-0">
              <Clock className="w-3.5 h-3.5 text-ink-soft" />
            </div>
            <span className="text-xs font-semibold text-ink-soft">{opportunity.timeCommitment}</span>
          </div>
        </div>

        {/* Student-Friendly Skills Tags list container as requested */}
        {opportunity.skillsNeeded && opportunity.skillsNeeded.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold tracking-wide text-ink-soft mb-1.5">Acquire Credentials</p>
            <div className="flex flex-wrap gap-1">
              {opportunity.skillsNeeded.slice(0, 3).map((skill, idx) => (
                <span key={idx} className="px-2 py-0.5 bg-paper-3 rounded text-xs font-semibold text-ink-soft">
                  #{skill}
                </span>
              ))}
              {opportunity.skillsNeeded.length > 3 && (
                <span className="px-2 py-0.5 bg-paper-2 rounded text-xs font-semibold text-blue-dark shrink-0">
                  +{opportunity.skillsNeeded.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* High-Converting CTA action orange button as specified */}
        <div className="mt-auto pt-2">
          <Link to={`/student/opportunities/${opportunity.id}`} className="block">
            {/* White on #E08A3C measured 2.67:1 — this is the primary CTA on
                every card. amber-dark (#A85E22) clears AA at 4.87:1. */}
            <Button className="w-full bg-amber-dark hover:bg-amber-dark text-white font-bold py-3 text-xs uppercase tracking-wide rounded-lg cursor-pointer transition-all active:scale-[0.98] group-hover:bg-blue-dark flex items-center justify-center gap-2">
              <span>View & Quick Apply</span>
              <span className="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300">→</span>
            </Button>
          </Link>
        </div>

      </div>
    </Card>
  );
}
