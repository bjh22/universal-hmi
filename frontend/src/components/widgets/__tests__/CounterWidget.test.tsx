/**
 * Tests for CounterWidget — integer readout widget.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CounterWidget } from '../CounterWidget'
import type { TagValue } from '../../../types'

function values(value: unknown): Record<string, TagValue> {
  return {
    'Count': { tag_id: 1, name: 'Count', value, quality: 'good', timestamp: 't' },
  }
}

describe('CounterWidget', () => {
  it('shows 0 when tag is absent', () => {
    render(<CounterWidget title="Parts" tag="Missing" tagValues={{}} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('renders integer values as-is', () => {
    render(<CounterWidget title="Parts" tag="Count" tagValues={values(42)} />)
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('rounds numeric values to integer', () => {
    render(<CounterWidget title="Parts" tag="Count" tagValues={values(7.7)} />)
    expect(screen.getByText('8')).toBeInTheDocument()
  })

  it('preserves non-numeric values as-is', () => {
    render(<CounterWidget title="Parts" tag="Count" tagValues={values('N/A')} />)
    expect(screen.getByText('N/A')).toBeInTheDocument()
  })

  it('renders title in chrome=full mode', () => {
    render(<CounterWidget title="Widget Count" tag="Count" tagValues={values(5)} chrome="full" />)
    expect(screen.getByText('Widget Count')).toBeInTheDocument()
  })

  it('hides title in chrome=none mode', () => {
    render(<CounterWidget title="Hidden" tag="Count" tagValues={values(5)} chrome="none" />)
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument()
  })
})
