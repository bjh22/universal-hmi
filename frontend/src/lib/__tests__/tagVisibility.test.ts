/**
 * Tests for tagVisibility — builds per-tag visibility maps and evaluates
 * conditions against live tag values. Used to hide/show tags in TagPicker
 * and runtime widgets when conditional visibility is enabled.
 */
import { describe, it, expect } from 'vitest'
import {
  buildTagVisibilityMap,
  isTagVisible,
  parseVisibilityConditions,
} from '../tagVisibility'
import type { Tag, TagValue } from '../../types'

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: 1,
    name: 'Some.Tag',
    display_name: 'Some Tag',
    data_type: 'bool',
    visibility_enabled: false,
    visibility_conditions: null,
    ...overrides,
  } as Tag
}

function tv(name: string, value: unknown): TagValue {
  return {
    tag_id: 1, name, value,
    quality: 'good', timestamp: '2024-01-01T00:00:00Z',
  }
}

describe('buildTagVisibilityMap', () => {
  it('omits tags that do not have visibility enabled', () => {
    const tags = [
      makeTag({ name: 'A', visibility_enabled: false, visibility_conditions: '[{"tag":"X","operator":"==","value":true}]' }),
    ]
    expect(buildTagVisibilityMap(tags)).toEqual({})
  })

  it('includes enabled tags with valid conditions', () => {
    const tags = [
      makeTag({
        name: 'A',
        visibility_enabled: true,
        visibility_conditions: '[{"tag":"X","operator":"==","value":true}]',
      }),
    ]
    const map = buildTagVisibilityMap(tags)
    expect(map['A']).toHaveLength(1)
    expect(map['A'][0].operator).toBe('==')
  })

  it('accepts an already-parsed array', () => {
    const tags = [
      makeTag({
        name: 'B',
        visibility_enabled: true,
        visibility_conditions: [{ tag: 'X', operator: '>', value: 10 }] as unknown as string,
      }),
    ]
    const map = buildTagVisibilityMap(tags)
    expect(map['B'][0].value).toBe(10)
  })

  it('silently ignores malformed JSON', () => {
    const tags = [
      makeTag({
        name: 'C', visibility_enabled: true, visibility_conditions: 'not json',
      }),
    ]
    const map = buildTagVisibilityMap(tags)
    expect(map['C']).toBeUndefined()
  })

  it('omits tags with empty conditions array', () => {
    const tags = [
      makeTag({ name: 'D', visibility_enabled: true, visibility_conditions: '[]' }),
    ]
    expect(buildTagVisibilityMap(tags)).toEqual({})
  })
})

describe('isTagVisible', () => {
  it('defaults to visible when no conditions configured', () => {
    expect(isTagVisible('A', {}, {})).toBe(true)
  })

  it('visible when any condition matches (OR logic)', () => {
    const map = {
      'A': [
        { tag: 'X', operator: '==', value: 'go' },
        { tag: 'Y', operator: '==', value: true },
      ],
    }
    const values = { X: tv('X', 'no'), Y: tv('Y', true) }
    expect(isTagVisible('A', map, values)).toBe(true)
  })

  it('hidden when all conditions fail', () => {
    const map = {
      'A': [
        { tag: 'X', operator: '==', value: 'go' },
      ],
    }
    const values = { X: tv('X', 'stop') }
    expect(isTagVisible('A', map, values)).toBe(false)
  })

  it('missing tag values cause a condition to fail', () => {
    const map = { 'A': [{ tag: 'X', operator: '==', value: 'go' }] }
    expect(isTagVisible('A', map, {})).toBe(false)
  })

  it('supports numeric comparison operators', () => {
    const map = { 'A': [{ tag: 'X', operator: '>', value: 10 }] }
    expect(isTagVisible('A', map, { X: tv('X', 15) })).toBe(true)
    expect(isTagVisible('A', map, { X: tv('X', 5) })).toBe(false)
  })

  it('uses loose equality for bool/number interop', () => {
    const map = { 'A': [{ tag: 'X', operator: '==', value: 1 }] }
    expect(isTagVisible('A', map, { X: tv('X', true) })).toBe(true)
  })
})

describe('parseVisibilityConditions', () => {
  it('returns empty array for null/undefined', () => {
    expect(parseVisibilityConditions(null)).toEqual([])
    expect(parseVisibilityConditions(undefined)).toEqual([])
    expect(parseVisibilityConditions('')).toEqual([])
  })

  it('parses valid JSON', () => {
    const result = parseVisibilityConditions('[{"tag":"X","operator":"==","value":true}]')
    expect(result).toHaveLength(1)
    expect(result[0].tag).toBe('X')
  })

  it('returns empty array for malformed JSON', () => {
    expect(parseVisibilityConditions('nope')).toEqual([])
  })

  it('returns empty array when JSON is not an array', () => {
    expect(parseVisibilityConditions('{"not":"array"}')).toEqual([])
  })
})
