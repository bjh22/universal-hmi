/**
 * Tests for ToggleWidget — on/off switch with two-way tag binding.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToggleWidget } from '../ToggleWidget'
import type { TagValue } from '../../../types'

const apiMocks = vi.hoisted(() => ({ writeTag: vi.fn() }))
vi.mock('../../../lib/api', () => ({ api: apiMocks }))

beforeEach(() => {
  apiMocks.writeTag.mockReset().mockResolvedValue(undefined)
})

function values(value: unknown): Record<string, TagValue> {
  return {
    'Motor.Run': { tag_id: 1, name: 'Motor.Run', value, quality: 'good', timestamp: 't' },
  }
}

describe('ToggleWidget', () => {
  it('shows OFF when tag value is false', () => {
    render(<ToggleWidget title="Motor" tag="Motor.Run" tagValues={values(false)} />)
    expect(screen.getByText('OFF')).toBeInTheDocument()
    expect(screen.queryByText('ON')).not.toBeInTheDocument()
  })

  it('shows ON when tag value is true', () => {
    render(<ToggleWidget title="Motor" tag="Motor.Run" tagValues={values(true)} />)
    expect(screen.getByText('ON')).toBeInTheDocument()
  })

  it('shows OFF when tag has no value', () => {
    render(<ToggleWidget title="Motor" tag="Missing" tagValues={{}} />)
    expect(screen.getByText('OFF')).toBeInTheDocument()
  })

  it('coerces truthy non-boolean values to ON', () => {
    render(<ToggleWidget title="Motor" tag="Motor.Run" tagValues={values(1)} />)
    expect(screen.getByText('ON')).toBeInTheDocument()
  })

  it('click writes the inverted value', async () => {
    render(<ToggleWidget title="Motor" tag="Motor.Run" tagValues={values(false)} />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(apiMocks.writeTag).toHaveBeenCalledWith('Motor.Run', true))
  })

  it('click from ON writes false', async () => {
    render(<ToggleWidget title="Motor" tag="Motor.Run" tagValues={values(true)} />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(apiMocks.writeTag).toHaveBeenCalledWith('Motor.Run', false))
  })

  it('renders title with chrome=full', () => {
    render(<ToggleWidget title="My Motor" tag="X" tagValues={{}} chrome="full" />)
    expect(screen.getByText('My Motor')).toBeInTheDocument()
  })

  it('hides title with chrome=none', () => {
    render(<ToggleWidget title="Invisible" tag="X" tagValues={{}} chrome="none" />)
    expect(screen.queryByText('Invisible')).not.toBeInTheDocument()
  })
})
