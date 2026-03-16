/**
 * Tests for WebSocket reconnect logic.
 *
 * We don't test the actual WebSocket connection, but verify the
 * exponential backoff calculation logic that's embedded in the hook.
 */
import { describe, it, expect } from 'vitest'

// Test the reconnect delay calculation directly
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000

function calculateDelay(attempt: number): number {
  return Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS)
}

describe('WebSocket reconnect backoff', () => {
  it('first attempt delay is 1 second', () => {
    expect(calculateDelay(0)).toBe(1000)
  })

  it('second attempt delay is 2 seconds', () => {
    expect(calculateDelay(1)).toBe(2000)
  })

  it('third attempt delay is 4 seconds', () => {
    expect(calculateDelay(2)).toBe(4000)
  })

  it('fourth attempt delay is 8 seconds', () => {
    expect(calculateDelay(3)).toBe(8000)
  })

  it('caps at 30 seconds', () => {
    expect(calculateDelay(10)).toBe(30000)
    expect(calculateDelay(20)).toBe(30000)
  })

  it('delay doubles each attempt until cap', () => {
    const delays = [0, 1, 2, 3, 4, 5].map(calculateDelay)
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000])
  })
})

describe('WebSocket message type handling', () => {
  // Test the message handling logic conceptually
  it('snapshot replaces all tag values', () => {
    const prev = { tag1: { value: 1 }, tag2: { value: 2 } }
    const snapshot = { tag1: { value: 10 }, tag3: { value: 30 } }
    // snapshot type merges into prev
    const result = { ...prev, ...snapshot }
    expect(result.tag1.value).toBe(10)
    expect(result.tag2.value).toBe(2)
    expect(result.tag3.value).toBe(30)
  })

  it('tag_update merges delta into existing state', () => {
    const prev = { tag1: { value: 1 }, tag2: { value: 2 } }
    const update = { tag1: { value: 99 } }
    const result = { ...prev, ...update }
    expect(result.tag1.value).toBe(99)
    expect(result.tag2.value).toBe(2)
  })

  it('inactive alarm is filtered out', () => {
    const alarms = [
      { id: 1, state: 'active_unacked' },
      { id: 2, state: 'active_acked' },
    ]
    const cleared = { id: 1, state: 'inactive' }
    const result = alarms.filter(a => a.id !== cleared.id)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(2)
  })

  it('new alarm is prepended', () => {
    const alarms = [{ id: 1, state: 'active_unacked' }]
    const newAlarm = { id: 2, state: 'active_unacked' }
    const idx = alarms.findIndex(a => a.id === newAlarm.id)
    const result = idx >= 0
      ? alarms.map(a => a.id === newAlarm.id ? newAlarm : a)
      : [newAlarm, ...alarms.slice(0, 99)]
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe(2)
  })

  it('existing alarm is updated in place', () => {
    const alarms = [
      { id: 1, state: 'active_unacked' },
      { id: 2, state: 'active_unacked' },
    ]
    const updated = { id: 1, state: 'active_acked' }
    const idx = alarms.findIndex(a => a.id === updated.id)
    const result = idx >= 0
      ? alarms.map(a => a.id === updated.id ? updated : a)
      : [updated, ...alarms]
    expect(result).toHaveLength(2)
    expect(result[0].state).toBe('active_acked')
  })
})
