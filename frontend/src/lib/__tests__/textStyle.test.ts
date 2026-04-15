/**
 * Tests for textStyle — CSS prop builder used by all widgets.
 */
import { describe, it, expect } from 'vitest'
import { textStyleToCSS } from '../textStyle'

describe('textStyleToCSS', () => {
  it('returns undefined for undefined input', () => {
    expect(textStyleToCSS(undefined)).toBeUndefined()
  })

  it('returns undefined for empty style object', () => {
    expect(textStyleToCSS({})).toBeUndefined()
  })

  it('converts fontSize to px string', () => {
    expect(textStyleToCSS({ fontSize: 14 })).toEqual({ fontSize: '14px' })
  })

  it('passes fontFamily/color/fontWeight through unchanged', () => {
    expect(textStyleToCSS({
      fontFamily: 'Inter',
      fontWeight: 700,
      color: '#ff0000',
    })).toEqual({
      fontFamily: 'Inter',
      fontWeight: 700,
      color: '#ff0000',
    })
  })

  it('maps italic=true to fontStyle: italic', () => {
    expect(textStyleToCSS({ italic: true })).toEqual({ fontStyle: 'italic' })
  })

  it('omits italic: false', () => {
    expect(textStyleToCSS({ italic: false })).toBeUndefined()
  })

  it('combines multiple properties', () => {
    expect(textStyleToCSS({
      fontFamily: 'Arial',
      fontSize: 18,
      fontWeight: 600,
      color: '#333',
      italic: true,
    })).toEqual({
      fontFamily: 'Arial',
      fontSize: '18px',
      fontWeight: 600,
      color: '#333',
      fontStyle: 'italic',
    })
  })
})
