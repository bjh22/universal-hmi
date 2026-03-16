/**
 * Tests for WidgetRenderer — widget type dispatch and unknown type handling.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WidgetRenderer } from '../WidgetRenderer'
import type { Widget, TagValue } from '../../../types'

function makeWidget(type: string, props: Record<string, unknown> = {}): Widget {
  return {
    id: 'w_test_1',
    type,
    x: 0, y: 0, w: 200, h: 100,
    props: { title: 'Test Widget', ...props },
  }
}

const emptyTagValues: Record<string, TagValue> = {}

describe('WidgetRenderer', () => {
  it('renders unknown widget type with error message', () => {
    const widget = makeWidget('nonexistent_type')
    render(<WidgetRenderer widget={widget} tagValues={emptyTagValues} />)
    expect(screen.getByText(/Unknown widget: nonexistent_type/)).toBeInTheDocument()
  })

  it('renders text_label widget', () => {
    const widget = makeWidget('text_label', { title: 'My Label', text: 'Hello World' })
    render(<WidgetRenderer widget={widget} tagValues={emptyTagValues} />)
    expect(screen.getByText('Hello World')).toBeInTheDocument()
  })

  it('renders status_indicator widget', () => {
    const tagValues: Record<string, TagValue> = {
      'test_tag': {
        tag_id: 1, name: 'test_tag', value: 'Running',
        quality: 'good', timestamp: '2024-01-01T00:00:00Z',
      },
    }
    const widget = makeWidget('status_indicator', {
      title: 'Status',
      tag: 'test_tag',
      mapping: { Running: { label: 'RUNNING', color: '#22c55e' } },
    })
    render(<WidgetRenderer widget={widget} tagValues={tagValues} />)
    expect(screen.getByText('RUNNING')).toBeInTheDocument()
  })

  it('renders gauge widget without crashing', () => {
    const tagValues: Record<string, TagValue> = {
      'speed': {
        tag_id: 1, name: 'speed', value: 75,
        quality: 'good', timestamp: '2024-01-01T00:00:00Z',
      },
    }
    const widget = makeWidget('gauge', {
      title: 'Speed',
      tag: 'speed',
      min: 0, max: 100,
    })
    const { container } = render(<WidgetRenderer widget={widget} tagValues={tagValues} />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders counter widget', () => {
    const tagValues: Record<string, TagValue> = {
      'count': {
        tag_id: 1, name: 'count', value: 42,
        quality: 'good', timestamp: '2024-01-01T00:00:00Z',
      },
    }
    const widget = makeWidget('counter', { title: 'Count', tag: 'count' })
    render(<WidgetRenderer widget={widget} tagValues={tagValues} />)
    expect(screen.getByText('42')).toBeInTheDocument()
  })
})
