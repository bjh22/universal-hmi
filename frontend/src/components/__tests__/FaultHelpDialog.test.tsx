/**
 * Tests for FaultHelpDialog — popup that shows alarm details + troubleshooting.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FaultHelpDialog } from '../FaultHelpDialog'
import type { AlarmData } from '../../types'

function makeAlarm(overrides: Partial<AlarmData> = {}): AlarmData {
  return {
    id: 1,
    tag_id: 10,
    tag_name: 'Motor.Fault',
    tag_display_name: 'Motor Fault',
    message: 'Overcurrent detected',
    severity: 'critical',
    state: 'active_unacked',
    triggered_at: '2024-01-01T00:00:00Z',
    acknowledged_at: null,
    acknowledged_by: null,
    trigger_value: 'true',
    ...overrides,
  }
}

describe('FaultHelpDialog', () => {
  it('renders severity, tag display name, and alarm message', () => {
    render(
      <FaultHelpDialog
        alarm={makeAlarm()}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
      />
    )
    expect(screen.getByText(/Critical — Motor Fault/)).toBeInTheDocument()
    expect(screen.getByText('Overcurrent detected')).toBeInTheDocument()
  })

  it('falls back to tag_name when display_name is absent', () => {
    render(
      <FaultHelpDialog
        alarm={makeAlarm({ tag_display_name: undefined })}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
      />
    )
    expect(screen.getByText(/Motor\.Fault/)).toBeInTheDocument()
  })

  it('renders help image when provided', () => {
    render(
      <FaultHelpDialog
        alarm={makeAlarm({ help_image: 'abc123' })}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
      />
    )
    const img = screen.getByAltText('Fault help') as HTMLImageElement
    expect(img.src).toContain('/api/media/abc123')
  })

  it('renders help text when provided', () => {
    render(
      <FaultHelpDialog
        alarm={makeAlarm({ help_text: 'Step 1: reset.\nStep 2: retry.' })}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
      />
    )
    expect(screen.getByText(/Step 1: reset/)).toBeInTheDocument()
  })

  it('acknowledge button visible for active_unacked alarms', () => {
    render(
      <FaultHelpDialog
        alarm={makeAlarm({ state: 'active_unacked' })}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /Acknowledge/i })).toBeInTheDocument()
  })

  it('acknowledge button hidden for already-acked alarms', () => {
    render(
      <FaultHelpDialog
        alarm={makeAlarm({ state: 'active_acked' })}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /^Acknowledge/i })).not.toBeInTheDocument()
  })

  it('dismiss button calls onDismiss', () => {
    const onDismiss = vi.fn()
    render(
      <FaultHelpDialog
        alarm={makeAlarm()}
        onAcknowledge={vi.fn()}
        onDismiss={onDismiss}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('acknowledge button triggers onAcknowledge and disables while pending', async () => {
    let resolveAck: () => void = () => {}
    const onAcknowledge = vi.fn(() => new Promise<void>(r => { resolveAck = r }))
    render(
      <FaultHelpDialog
        alarm={makeAlarm()}
        onAcknowledge={onAcknowledge}
        onDismiss={vi.fn()}
      />
    )
    const btn = screen.getByRole('button', { name: /^Acknowledge$/i })
    fireEvent.click(btn)

    // While the promise is unresolved, button shows "Acknowledging..." and is disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Acknowledging/i })).toBeDisabled()
    })

    resolveAck()
    await waitFor(() => expect(onAcknowledge).toHaveBeenCalledTimes(1))
  })
})
