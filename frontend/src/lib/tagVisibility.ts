import type { Tag, TagValue, VisibilityCondition } from '../types';

/**
 * Map from tag name → parsed visibility conditions.
 * Only contains entries for tags with visibility_enabled=true and non-empty conditions.
 */
export type TagVisibilityMap = Record<string, VisibilityCondition[]>;

/**
 * Build a TagVisibilityMap from a list of tags.
 * Parses the JSON visibility_conditions string for each tag that has visibility enabled.
 */
export function buildTagVisibilityMap(tags: Tag[]): TagVisibilityMap {
  const map: TagVisibilityMap = {};
  for (const tag of tags) {
    if (tag.visibility_enabled && tag.visibility_conditions) {
      try {
        const raw = typeof tag.visibility_conditions === 'string'
          ? JSON.parse(tag.visibility_conditions)
          : tag.visibility_conditions;
        if (Array.isArray(raw) && raw.length > 0) {
          map[tag.name] = raw;
        }
      } catch { /* ignore parse errors */ }
    }
  }
  return map;
}

/**
 * Evaluate whether a tag is visible based on its visibility conditions.
 * Returns true if:
 *   - The tag has no entry in the visibility map (no conditions configured)
 *   - ANY condition evaluates to true (OR logic)
 * Returns false if all conditions evaluate to false.
 */
export function isTagVisible(
  tagName: string,
  tagVisibilityMap: TagVisibilityMap,
  tagValues: Record<string, TagValue>,
): boolean {
  const conditions = tagVisibilityMap[tagName];
  if (!conditions || conditions.length === 0) return true;

  return conditions.some(cond => {
    const tv = tagValues[cond.tag];
    if (!tv) return false;
    return evaluateCondition(tv.value, cond.operator, cond.value);
  });
}

function evaluateCondition(actual: unknown, operator: string, expected: unknown): boolean {
  // Use loose equality for cross-type comparisons (bool/number interop)
  switch (operator) {
    case '==': return actual == expected;
    case '!=': return actual != expected;
    case '>':  return Number(actual) > Number(expected);
    case '<':  return Number(actual) < Number(expected);
    case '>=': return Number(actual) >= Number(expected);
    case '<=': return Number(actual) <= Number(expected);
    default: return true;
  }
}

/**
 * Parse a visibility_conditions JSON string into an array.
 */
export function parseVisibilityConditions(raw: string | null | undefined): VisibilityCondition[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
