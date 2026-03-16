/**
 * Tests for GaugeWidget color thresholds and display modes.
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { GaugeWidget } from '../GaugeWidget'
import type { TagValue } from '../../../types'

function makeTagValues(value: number): Record<string, TagValue> {
  return {
    'test_tag': {
      tag_id: 1, name: 'test_tag', value,
      quality: 'good', timestamp: '2024-01-01T00:00:00Z',
    },
  }
}

describe('GaugeWidget', () => {
  it('renders bar mode by default', () => {
    const { container } = render(
      <GaugeWidget title="Test" tag="test_tag" tagValues={makeTagValues(50)} />
    )
    expect(container.firstChild).toBeTruthy()
  })

  it('displays correct value', () => {
    const { container } = render(
      <GaugeWidget
        title="Test"
        tag="test_tag"
        tagValues={makeTagValues(75.5)}
        decimalPlaces={1}
      />
    )
    expect(container.textContent).toContain('75.5')
  })

  it('shows 0 when tag value is missing', () => {
    const { container } = render(
      <GaugeWidget title="Test" tag="missing_tag" tagValues={{}} />
    )
    expect(container.textContent).toContain('0')
  })

  it('renders radial mode', () => {
    const { container } = render(
      <GaugeWidget
        title="Test"
        tag="test_tag"
        tagValues={makeTagValues(50)}
        displayMode="radial"
      />
    )
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('renders donut mode', () => {
    const { container } = render(
      <GaugeWidget
        title="Test"
        tag="test_tag"
        tagValues={makeTagValues(50)}
        displayMode="donut"
      />
    )
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('renders numeric mode', () => {
    const { container } = render(
      <GaugeWidget
        title="Test"
        tag="test_tag"
        tagValues={makeTagValues(42)}
        displayMode="numeric"
        decimalPlaces={0}
      />
    )
    expect(container.textContent).toContain('42')
  })

  it('renders vertical mode', () => {
    const { container } = render(
      <GaugeWidget
        title="Test"
        tag="test_tag"
        tagValues={makeTagValues(50)}
        displayMode="vertical"
      />
    )
    expect(container.firstChild).toBeTruthy()
  })

  it('shows units', () => {
    const { container } = render(
      <GaugeWidget
        title="Test"
        tag="test_tag"
        tagValues={makeTagValues(50)}
        units="RPM"
      />
    )
    expect(container.textContent).toContain('RPM')
  })

  it('shows title', () => {
    const { container } = render(
      <GaugeWidget
        title="Motor Speed"
        tag="test_tag"
        tagValues={makeTagValues(50)}
      />
    )
    expect(container.textContent).toContain('Motor Speed')
  })
})


// Test the getColor logic directly
describe('GaugeWidget color thresholds', () => {
  // The getColor function is not exported, but we can test its behavior
  // through the rendered output's style properties

  it('value below warning shows blue', () => {
    const { container } = render(
      <GaugeWidget
        title="Test"
        tag="test_tag"
        tagValues={makeTagValues(30)}
        warning={50}
        critical={80}
      />
    )
    // Check the value element has blue color
    const valueEl = container.querySelector('.font-bold')
    expect(valueEl).toBeTruthy()
    expect(valueEl!.getAttribute('style')).toContain('59, 130, 246')
  })

  it('value at warning shows amber', () => {
    const { container } = render(
      <GaugeWidget
        title="Test"
        tag="test_tag"
        tagValues={makeTagValues(60)}
        warning={50}
        critical={80}
      />
    )
    const valueEl = container.querySelector('.font-bold')
    expect(valueEl).toBeTruthy()
    expect(valueEl!.getAttribute('style')).toContain('245, 158, 11')
  })

  it('value at critical shows red', () => {
    const { container } = render(
      <GaugeWidget
        title="Test"
        tag="test_tag"
        tagValues={makeTagValues(90)}
        warning={50}
        critical={80}
      />
    )
    const valueEl = container.querySelector('.font-bold')
    expect(valueEl).toBeTruthy()
    expect(valueEl!.getAttribute('style')).toContain('239, 68, 68')
  })
})
