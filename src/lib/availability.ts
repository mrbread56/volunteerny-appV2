import type { Opportunity } from '../types';
import { normalizeAvailability } from './vocabularies';

/**
 * When an opportunity actually happens, expressed in the same eight slots a
 * student uses to say when they are free.
 *
 * DERIVED, not collected. Organisations already record a schedule — a date and
 * time for a one-off, or day-and-time shifts for a recurring posting — so
 * asking them to also tick an availability grid would be asking the same
 * question twice and inviting the two answers to disagree. No new field, no
 * schema change, no backfill.
 *
 * Slots rather than times, on purpose. Cross-referencing real start and end
 * times against a student's free-form availability is a combinatorial mess with
 * an illusory payoff: `startTime: '09:00'` carries no timezone and, for a
 * recurring posting, no date. Eight buckets and a set intersection is coarse,
 * honest, and cheap enough to run over the whole list on every keystroke.
 */

export const MORNING_END = 12;   // before noon
export const AFTERNOON_END = 17; // before 17:00

/** 'Sat'/'Sun' — the org form writes three-letter days. */
const WEEKEND_DAYS = new Set(['sat', 'sun', 'saturday', 'sunday']);

function slotFor(day: string | undefined, startTime: string | undefined): string | null {
  if (!startTime) return null;
  const hour = Number(String(startTime).split(':')[0]);
  if (!Number.isFinite(hour)) return null;

  const isWeekend = WEEKEND_DAYS.has(String(day || '').trim().toLowerCase());
  const part = hour < MORNING_END ? 'Mornings' : hour < AFTERNOON_END ? 'Afternoons' : 'Evenings';
  return `${isWeekend ? 'Weekend' : 'Weekday'} ${part}`;
}

/**
 * The slots an opportunity occupies.
 *
 * Recurring and multi-shift postings can occupy several. A single-date posting
 * derives its day from `dateTime`, which is the only place that information
 * exists for it.
 */
export function slotsForOpportunity(opp: Pick<Opportunity, 'shifts' | 'dateTime' | 'scheduleType'>): string[] {
  const out = new Set<string>();

  for (const shift of opp.shifts || []) {
    // A dated shift knows its own weekday; a recurring one carries `day`.
    let day = shift.day;
    if (!day && shift.date) {
      /*
       * Parsed as a LOCAL calendar date, not as UTC midnight.
       *
       * `new Date('2026-09-14')` is UTC midnight, so getDay() in Toronto
       * returned 0 — Sunday — for a Monday. Every dated shift was classified
       * one weekday early: Monday shifts advertised as weekend, Saturday shifts
       * as weekday. This is the same parse that made a shift DISPLAY the wrong
       * day, but here it decides which students see the posting at all and
       * which reason line they are shown, so a wrong answer is silent rather
       * than visible.
       */
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(shift.date).trim());
      if (m) {
        const [y, mo, dd] = [Number(m[1]), Number(m[2]), Number(m[3])];
        const d = new Date(y, mo - 1, dd);
        // Same round-trip guard as formatCalendarDate: the constructor rolls
        // impossible dates over instead of failing.
        if (d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === dd) {
          day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
        }
      }
    }
    const slot = slotFor(day, shift.startTime);
    if (slot) out.add(slot);
  }

  // A one-off posting has no shifts, only a dateTime.
  if (out.size === 0 && opp.dateTime) {
    const raw: any = opp.dateTime;
    const d = typeof raw?.toDate === 'function' ? raw.toDate() : new Date(raw);
    if (!Number.isNaN(d?.getTime?.())) {
      const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
      const slot = slotFor(day, `${String(d.getHours()).padStart(2, '0')}:00`);
      if (slot) out.add(slot);
    }
  }

  return [...out];
}

/**
 * Does a student's stated availability overlap the opportunity's?
 *
 * 'Flexible' on either side matches everything — it is the answer people give
 * when the grid does not fit them, and treating it as "no overlap" would hide
 * exactly the students and postings that are easiest to place.
 *
 * A student who has said nothing matches everything too. Silence is not a
 * constraint, and filtering someone out for not having filled in a form yet is
 * the opposite of useful.
 */
export function availabilityOverlaps(
  studentAvailability: string[] | undefined | null,
  opportunitySlots: string[],
): boolean {
  const mine = normalizeAvailability(studentAvailability);
  if (mine.length === 0) return true;
  if (mine.includes('Flexible')) return true;
  if (opportunitySlots.length === 0) return true;
  return opportunitySlots.some((slot) => mine.includes(slot));
}

/** Human-readable, for the "shown because…" line. Empty when nothing overlaps. */
export function describeOverlap(
  studentAvailability: string[] | undefined | null,
  opportunitySlots: string[],
): string {
  const mine = normalizeAvailability(studentAvailability);
  const hit = opportunitySlots.find((slot) => mine.includes(slot));
  if (hit) return `Runs ${hit.toLowerCase()}, when you are free`;
  if (mine.includes('Flexible')) return 'You said your availability is flexible';
  return '';
}
