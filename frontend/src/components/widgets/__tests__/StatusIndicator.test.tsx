/**
 * Tests for StatusIndicator widget.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusIndicator } from '../StatusIndicator'
import type { TagValue } from '../../../types'

function makeTagValues(value: unknown): Record<string, TagValue> {
  return {
    'status_tag': {
      tag_id: 1, name: 'status_tag', value,
      quality: 'good', timestamp: '2024-01-01T00:00:00Z',
    },
  }
}

describe('StatusIndicator', () => {
  it('shows mapped label for known value', () => {
    const mapping = {
      'Running': { label: 'RUNNING', color: '#22c55e' },
      'Stopped': { label: 'STOPPED', color: '#ef4444' },
    }
    render(
      <StatusIndicator
        title="Machine"
        tag="status_tag"
        tagValues={makeTagValues('Running')}
        mapping={mapping}
      />
    )
    expect(screen.getByText('RUNNING')).toBeInTheDocument()
  })

  it('shows raw value when no mapping matches', () => {
    render(
      <StatusIndicator
        title="Machine"
        tag="status_tag"
        tagValues={makeTagValues('Unknown')}
        mapping={{}}
      />
    )
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('shows dash when tag has no value', () => {
    render(
      <StatusIndicator
        title="Machine"
        tag="missing_tag"
        tagValues={{}}
        mapping={{}}
      />
    )
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('maps numeric values via string coercion', () => {
    const mapping = {
      '1': { label: 'ON', color: '#22c55e' },
      '0': { label: 'OFF', color: '#ef4444' },
    }
    render(
      <StatusIndicator
        title="Switch"
        tag="status_tag"
        tagValues={makeTagValues(1)}
        mapping={mapping}
      />
    )
    expect(screen.getByText('ON')).toBeInTheDocument()
  })

  it('maps boolean values via string coercion', () => {
    const mapping = {
      'true': { label: 'YES', color: '#22c55e' },
      'false': { label: 'NO', color: '#ef4444' },
    }
    render(
      <StatusIndicator
        title="Bool"
        tag="status_tag"
        tagValues={makeTagValues(true)}
        mapping={mapping}
      />
    )
    expect(screen.getByText('YES')).toBeInTheDocument()
  })

  it('renders title', () => {
    render(
      <StatusIndicator
        title="My Status"
        tag="status_tag"
        tagValues={makeTagValues('OK')}
      />
    )
    expect(screen.getByText('My Status')).toBeInTheDocument()
  })

  it('applies mapped color to background', () => {
    const mapping = {
      'Running': { label: 'RUNNING', color: '#22c55e' },
    }
    render(
      <StatusIndicator
        title="Machine"
        tag="status_tag"
        tagValues={makeTagValues('Running')}
        mapping={mapping}
      />
    )
    const el = screen.getByText('RUNNING')
    expect(el.getAttribute('style')).toContain('34, 197, 94')
  })

  it('uses default gray when no mapping color', () => {
    render(
      <StatusIndicator
        title="Machine"
        tag="status_tag"
        tagValues={makeTagValues('Unknown')}
        mapping={{}}
      />
    )
    const el = screen.getByText('Unknown')
    expect(el.getAttribute('style')).toContain('107, 114, 128')
  })
})
