import type { Widget } from '../types';

/**
 * Resolve a relative tag reference against a prefix.
 * Tags starting with "." are relative: ".speed" + "Moves.clampOpen" → "Moves.clampOpen.speed"
 * Tags without a leading "." are absolute and returned unchanged.
 */
export function resolveTag(tag: string, prefix: string | undefined): string {
  if (!prefix || !tag.startsWith('.')) return tag;
  return prefix + tag;
}

/** Tag-related string keys on widget.props */
const PROP_TAG_KEYS = ['tag', 'writeTag', 'targetTag', 'availabilityTag', 'performanceTag', 'qualityTag', 'oeeTag', 'tagPrefix'] as const;

/**
 * Return a cloned widget with all tag-related props resolved against a prefix.
 * Only clones if at least one tag is relative (starts with "."). Otherwise returns
 * the original widget for zero-allocation in the common non-template case.
 */
export function resolveWidgetTags(widget: Widget, prefix: string | undefined): Widget {
  if (!prefix) return widget;

  const p = widget.props as Record<string, unknown>;
  let hasRelative = false;

  // Check top-level widget tag fields
  if (widget.visibleTag?.startsWith('.')) hasRelative = true;
  if (widget.enabledTag?.startsWith('.')) hasRelative = true;

  // Check props tag fields
  if (!hasRelative) {
    for (const key of PROP_TAG_KEYS) {
      if (typeof p[key] === 'string' && (p[key] as string).startsWith('.')) {
        hasRelative = true;
        break;
      }
    }
  }

  // Check array props (trend tags, control_group controls)
  if (!hasRelative && Array.isArray(p.tags)) {
    for (const t of p.tags) {
      if (t?.tag && typeof t.tag === 'string' && t.tag.startsWith('.')) { hasRelative = true; break; }
    }
  }
  if (!hasRelative && Array.isArray(p.controls)) {
    for (const c of p.controls) {
      if (c?.tag && typeof c.tag === 'string' && c.tag.startsWith('.')) { hasRelative = true; break; }
    }
  }

  if (!hasRelative) return widget;

  // Clone and resolve
  const newProps: Record<string, unknown> = { ...p };

  for (const key of PROP_TAG_KEYS) {
    if (typeof newProps[key] === 'string') {
      newProps[key] = resolveTag(newProps[key] as string, prefix);
    }
  }

  // Resolve array tag references
  if (Array.isArray(newProps.tags)) {
    newProps.tags = (newProps.tags as Array<{ tag?: string }>).map(t =>
      t?.tag && typeof t.tag === 'string' && t.tag.startsWith('.')
        ? { ...t, tag: resolveTag(t.tag, prefix) }
        : t
    );
  }
  if (Array.isArray(newProps.controls)) {
    newProps.controls = (newProps.controls as Array<{ tag?: string }>).map(c =>
      c?.tag && typeof c.tag === 'string' && c.tag.startsWith('.')
        ? { ...c, tag: resolveTag(c.tag, prefix) }
        : c
    );
  }

  return {
    ...widget,
    visibleTag: widget.visibleTag ? resolveTag(widget.visibleTag, prefix) : widget.visibleTag,
    enabledTag: widget.enabledTag ? resolveTag(widget.enabledTag, prefix) : widget.enabledTag,
    props: newProps,
  };
}

/**
 * Resolve an array of tag name strings against a prefix.
 * Used by memo comparators that need resolved names for tag value diffing.
 */
export function resolveTagNames(tagNames: string[], prefix: string | undefined): string[] {
  if (!prefix) return tagNames;
  return tagNames.map(t => resolveTag(t, prefix));
}
