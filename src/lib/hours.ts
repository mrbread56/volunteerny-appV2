/**
 * The single definition of "how many hours has this student earned".
 *
 * Two representations of the same number exist in Firestore and they used to
 * disagree permanently:
 *
 *   students/{uid}.loggedHours  — the array every approval appends to
 *   students/{uid}.hours        — the scalar the leaderboard orders by
 *
 * Nothing ever wrote the scalar (its only writer, submitUserScore(), had zero
 * callers), so the rebuild ranked every student at 0. Both writers now recompute
 * the total through this function, and everything that displays a total reads it
 * through here too, so the two can no longer drift.
 */

export interface LoggedHourEntry {
  hours?: number | string | null;
  [key: string]: any;
}

/**
 * Sum a loggedHours array into a total.
 *
 * `Number(x || 0)` is NOT safe here: it returns NaN for any non-numeric entry
 * (a stray "" , "four", null inside an object), and that NaN would be written
 * straight into students/{uid}.hours as the student's leaderboard score.
 * Unparseable entries are skipped instead.
 */
export function totalLoggedHours(list: LoggedHourEntry[] | null | undefined): number {
  if (!Array.isArray(list)) return 0;
  const total = list.reduce((acc, entry) => {
    const value = Number(entry?.hours);
    return Number.isFinite(value) ? acc + value : acc;
  }, 0);
  // Floating-point addition of 0.5/0.1 style entries otherwise produces
  // 12.299999999999999 in the UI and in the ranked score.
  return Math.round(total * 100) / 100;
}
