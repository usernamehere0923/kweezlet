import type { DayStats } from "../../worker/stats";

/**
 * Turning the per-day rows of GET /api/stats into what the charts take:
 * days as they are, days summed per week, and a running total for the
 * progress line. Labels come from the day itself (dayLabel), so the caller
 * only picks which rows to show.
 */

/** The day as the charts label it: "Oct 5" in en, "5. Okt." in de-CH. */
export function dayLabel(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(`${day}T00:00:00Z`));
}

/** The Monday of the day's calendar week, YYYY-MM-DD (Swiss weeks start Monday). */
export function weekStart(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

/** The rows summed per calendar week; each week is labelled by its Monday. */
export function byWeek(days: DayStats[]): DayStats[] {
  const weeks: DayStats[] = [];
  for (const day of days) {
    const monday = weekStart(day.day);
    const last = weeks[weeks.length - 1];
    if (last && last.day === monday) {
      weeks[weeks.length - 1] = {
        day: monday,
        cards: last.cards + day.cards,
        correct: last.correct + day.correct,
        wrong: last.wrong + day.wrong,
        learned: last.learned + day.learned,
        seconds: last.seconds + day.seconds,
      };
    } else {
      // The first day of a week stands for it; its own numbers start the sum.
      weeks.push({ ...day, day: monday });
    }
  }
  return weeks;
}

/** A running total of cards learned, starting from `before` the window. */
export function cumulative(days: DayStats[], before: number): number[] {
  let total = before;
  return days.map((day) => (total += day.learned));
}
