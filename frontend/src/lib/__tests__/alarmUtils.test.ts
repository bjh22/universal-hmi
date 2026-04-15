/**
 * Tests for alarmUtils — severity color/border class mappings.
 *
 * Small surface but these constants are referenced across AppShell, Dashboard,
 * AlarmMarquee, and FaultHelpDialog. A rename or typo here breaks alarm display
 * in multiple places; this test guards the keys.
 */
import { describe, it, expect } from 'vitest'
import { severityColors, severityBorders } from '../alarmUtils'

describe('alarmUtils', () => {
  it('exports a color class for each severity', () => {
    for (const severity of ['critical', 'warning', 'info']) {
      expect(severityColors[severity]).toBeDefined()
      expect(severityColors[severity]).toMatch(/^text-/)
    }
  })

  it('exports a border class for each severity', () => {
    for (const severity of ['critical', 'warning', 'info']) {
      expect(severityBorders[severity]).toBeDefined()
      expect(severityBorders[severity]).toMatch(/^border-/)
    }
  })

  it('uses distinct colors per severity', () => {
    const unique = new Set(Object.values(severityColors))
    expect(unique.size).toBe(Object.keys(severityColors).length)
  })
})
