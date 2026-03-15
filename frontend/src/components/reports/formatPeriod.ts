const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format raw period strings from the analytics API into readable labels.
 *   "2026-03-15" → "Mar 15"
 *   "2026-W11"   → "Week 11"
 *   "2026-03"    → "Mar 2026"
 */
export function formatPeriodLabel(period: string): string {
  // Weekly: "2026-W11"
  const weekMatch = period.match(/^\d{4}-W(\d+)$/);
  if (weekMatch) return `Week ${parseInt(weekMatch[1], 10)}`;

  // Monthly: "2026-03"
  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const monthIdx = parseInt(monthMatch[2], 10) - 1;
    return `${MONTH_SHORT[monthIdx]} ${monthMatch[1]}`;
  }

  // Daily: "2026-03-15"
  const dayMatch = period.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dayMatch) {
    const monthIdx = parseInt(dayMatch[2], 10) - 1;
    const day = parseInt(dayMatch[3], 10);
    return `${MONTH_SHORT[monthIdx]} ${day}`;
  }

  return period;
}
