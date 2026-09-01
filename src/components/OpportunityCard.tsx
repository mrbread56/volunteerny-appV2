import React from 'react';
import { Opportunity } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { MapPin, Calendar, Clock, Bookmark, Share2, Sparkles } from 'lucide-react';
import { formatDate } from '../lib/utils';
import { Link } from 'react-router-dom';

interface OpportunityCardProps {
  opportunity: Opportunity;
  isSaved?: boolean;
  onSave?: (id: string) => void | Promise<void>;
  onShare?: (opp: Opportunity) => void;
  /** Sentences from getMatchResult, in contribution order. */
  matchReasons?: string[];
  eligibility?: 'eligible' | 'likely-ineligible' | 'unknown';
  key?: React.Key;
}

export default function OpportunityCard({ 
  opportunity, 
  isSaved, 
  onSave, 
  onShare,
  matchReasons,
  eligibility,
}: OpportunityCardProps) {
  

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
              <span key={exc} className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber/10 text-amber-dark border border-amber/30">
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
              <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-blue-dark' : ''}`} />
            </button>
          </div>
        </div>

        {/* Brand Group (Organization + Safety badge) */}
        <div className="flex items-center gap-1.5 mb-2.5">
          <span className="text-xs font-bold text-ink-soft uppercase tracking-wide truncate max-w-[150px]">
            {opportunity.orgName || 'Community Partner'}
          </span>
          {/*
            * The VETTED pill used to render here unconditionally.
            *
            * It carried no verification field, because neither
            * OpportunityCardProps nor Opportunity has one — it was a literal
            * that appeared beside every organisation's name on every card. A
            * posting can only be CREATED by an approved organisation, but
            * nothing revoked the badge afterwards, so it stayed at its most
            * confident on exactly the organisations a student most needed
            * warning about: the ones suspended after a safety report.
            *
            * Suspension now closes an organisation's postings, so a visible
            * card genuinely does come from a currently-approved organisation.
            * The claim is still not made on the card, because the card cannot
            * check it and a trust signal a component cannot verify is the kind
            * of thing that quietly becomes false again.
            */}
        </div>

        {/* Title */}
        <Link to={`/student/opportunities/${opportunity.id}`} className="block">
          <h3 className="text-lg font-bold text-ink group-hover:text-blue-dark transition-colors line-clamp-2 leading-snug min-h-[2.75rem] mb-3">
            {opportunity.title}
          </h3>
        </Link>

        {/* Why this one is here.
            This was a "% SKILLS MATCH" pill that compared the student's
            INTERESTS against the opportunity's skillsNeeded — two different
            vocabularies — so a student interested in "Technology" got no credit
            for the skill "Computer & Tech", and the number shown was measuring
            something nobody had asked for. These sentences come from the same
            function that produced the ranking, so they cannot disagree with it.
            Top two only: more turns an explanation into a wall. */}
        {(matchReasons || []).length > 0 && (
          <ul className="mb-4 space-y-1 shrink-0">
            {(matchReasons || []).slice(0, 2).map((reason) => (
              <li key={reason} className="flex items-start gap-1.5 text-xs text-ink-soft">
                <Sparkles className="w-3.5 h-3.5 text-amber-dark shrink-0 mt-px" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        )}

        {eligibility === 'likely-ineligible' && (
          <div className="mb-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 text-xs font-semibold w-fit shrink-0">
            You may not qualify for this one
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
                  Recurring <span className="bg-blue-dark/5 text-blue-dark font-semibold text-xs px-1 rounded">Weekly</span>
                </span>
              ) : opportunity.scheduleType === 'multiple' ? (
                <span className="flex items-center gap-1">
                  Multi-day <span className="bg-blue-dark/5 text-blue-dark font-semibold text-xs px-1 rounded">{opportunity.shifts?.length || 0} dates</span>
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
            <p className="text-xs font-semibold tracking-wide text-ink-soft mb-1.5">Skills they're looking for</p>
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

        {/* The "View details" button is gone.
            The whole card is already a link to the same place (line 102), so
            this was a second target for one destination. Its className was also
            the clearest example of a page routing around the design system: it
            overrode the primary variant's navy with orange so the list CTA and
            the detail CTA were different colours in one funnel, then nulled its
            own hover with `hover:bg-amber-dark` (identical to the base), then
            changed colour on CARD hover rather than button hover, then
            reinstated the press-scale Button.tsx deliberately removed, and
            overrode the size token's type. Nine such overrides in one string.

            Removing it also gives the card back its bottom padding rather than
            a full-width block a student must aim at. */}

      </div>
    </Card>
  );
}
