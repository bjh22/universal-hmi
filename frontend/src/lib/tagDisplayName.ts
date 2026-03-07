import type { Tag } from '../types';

/** Look up the display name for a tag. Falls back to the raw tag name. */
export function getTagDisplayName(tagName: string, tags: Tag[]): string {
  const tag = tags.find(t => t.name === tagName);
  return tag?.description || tagName;
}

/** Build a lookup map for performance when resolving many tags. */
export function buildTagDisplayNameMap(tags: Tag[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const tag of tags) {
    map[tag.name] = tag.description || tag.name;
  }
  return map;
}
