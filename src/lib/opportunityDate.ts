const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type Shift = { date?: string; day?: string; startTime: string; endTime: string };

/**
 * The date an opportunity actually happens.
 *
 * Both the create and the edit page used to write
 * `scheduleType === 'single' ? new Date(dateTime) : serverTimestamp()`, so every
 * multi-shift and weekly-recurring opportunity stored **the moment it was
 * posted** as its event date. A weekly Monday-evening role posted on a
 * Wednesday afternoon showed students "Wed, Aug 13, 2:47 p.m." on the card, on
 * the detail page, and in the organization's own calendar link — a real date,
 * confidently wrong, with nothing to hint it was wrong.
 *
 * There is a correct answer in both cases and it is cheap:
 *
 *   multiple  — the earliest shift that has a date, at its start time.
 *   recurring — the next occurrence of the earliest selected weekday, at its
 *               start time. A weekly event has no single calendar date, so the
 *               next session is the useful one to sort and display by.
 *
 * Falls back to `now` only when the shift data is unusable, which is the old
 * behaviour and no worse than it.
 */
export function resolveOpportunityDate(
  scheduleType: 'single' | 'multiple' | 'recurring',
  dateTimeLocal: string,
  shifts: Shift[],
  from: Date = new Date(),
): Date {
  if (scheduleType === 'single') {
    const d = new Date(dateTimeLocal);
    return Number.isNaN(d.getTime()) ? from : d;
  }

  if (scheduleType === 'multiple') {
    const dated = (shifts || [])
      .filter((s) => s?.date)
      .map((s) => new Date(`${s.date}T${s.startTime || '09:00'}`))
      .filter((d) => !Number.isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    return dated[0] ?? from;
  }

  // recurring
  const candidates = (shifts || [])
    .map((s) => ({ idx: DAYS.indexOf(s?.day || ''), start: s?.startTime || '09:00' }))
    .filter((c) => c.idx >= 0)
    .map(({ idx, start }) => {
      const [h, m] = start.split(':').map(Number);
      const next = new Date(from);
      next.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
      // Days until that weekday. 0 would mean today — only keep it if the start
      // time has not already passed, otherwise roll to next week.
      let delta = (idx - next.getDay() + 7) % 7;
      if (delta === 0 && next.getTime() <= from.getTime()) delta = 7;
      next.setDate(next.getDate() + delta);
      return next;
    })
    .sort((a, b) => a.getTime() - b.getTime());

  return candidates[0] ?? from;
}
