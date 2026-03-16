/**
 * Tests for useDesignMode hook — editor state machine.
 */
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDesignMode, generateWidgetId } from '../useDesignMode'
import type { Widget } from '../../types'

function makeWidget(overrides: Partial<Widget> = {}): Widget {
  return {
    id: generateWidgetId(),
    type: 'gauge',
    x: 0, y: 0, w: 100, h: 100,
    props: { title: 'Test' },
    ...overrides,
  }
}

describe('useDesignMode', () => {
  // ── Mode toggle ──
  describe('mode toggle', () => {
    it('starts in non-editing mode', () => {
      const { result } = renderHook(() => useDesignMode())
      expect(result.current.editing).toBe(false)
    })

    it('enters edit mode with widgets', () => {
      const { result } = renderHook(() => useDesignMode())
      const widgets = [makeWidget()]
      act(() => result.current.enterEditMode(widgets))
      expect(result.current.editing).toBe(true)
      expect(result.current.widgets).toHaveLength(1)
    })

    it('exits edit mode and clears selection', () => {
      const { result } = renderHook(() => useDesignMode())
      act(() => result.current.enterEditMode([makeWidget()]))
      act(() => result.current.select(result.current.widgets[0].id))
      act(() => result.current.exitEditMode())
      expect(result.current.editing).toBe(false)
      expect(result.current.selectedIds.size).toBe(0)
    })
  })

  // ── Selection ──
  describe('selection', () => {
    it('selects a single widget', () => {
      const { result } = renderHook(() => useDesignMode())
      const w = makeWidget()
      act(() => result.current.enterEditMode([w]))
      act(() => result.current.select(w.id))
      expect(result.current.selectedIds.has(w.id)).toBe(true)
    })

    it('additive select toggles in/out', () => {
      const { result } = renderHook(() => useDesignMode())
      const w1 = makeWidget()
      const w2 = makeWidget()
      act(() => result.current.enterEditMode([w1, w2]))
      act(() => result.current.select(w1.id))
      act(() => result.current.select(w2.id, true))
      expect(result.current.selectedIds.size).toBe(2)
      act(() => result.current.select(w1.id, true))
      expect(result.current.selectedIds.size).toBe(1)
      expect(result.current.selectedIds.has(w2.id)).toBe(true)
    })

    it('selectAll selects all widgets', () => {
      const { result } = renderHook(() => useDesignMode())
      const widgets = [makeWidget(), makeWidget(), makeWidget()]
      act(() => result.current.enterEditMode(widgets))
      act(() => result.current.selectAll())
      expect(result.current.selectedIds.size).toBe(3)
    })

    it('clearSelection empties selection', () => {
      const { result } = renderHook(() => useDesignMode())
      const w = makeWidget()
      act(() => result.current.enterEditMode([w]))
      act(() => result.current.select(w.id))
      act(() => result.current.clearSelection())
      expect(result.current.selectedIds.size).toBe(0)
    })

    it('selectMultiple sets exact selection', () => {
      const { result } = renderHook(() => useDesignMode())
      const widgets = [makeWidget(), makeWidget(), makeWidget()]
      act(() => result.current.enterEditMode(widgets))
      act(() => result.current.selectMultiple([widgets[0].id, widgets[2].id]))
      expect(result.current.selectedIds.size).toBe(2)
    })
  })

  // ── Widget CRUD ──
  describe('widget CRUD', () => {
    it('adds a widget', () => {
      const { result } = renderHook(() => useDesignMode())
      act(() => result.current.enterEditMode([]))
      const w = makeWidget()
      act(() => result.current.addWidget(w))
      expect(result.current.widgets).toHaveLength(1)
      expect(result.current.dirty).toBe(true)
    })

    it('updates a widget', () => {
      const { result } = renderHook(() => useDesignMode())
      const w = makeWidget()
      act(() => result.current.enterEditMode([w]))
      act(() => result.current.updateWidget(w.id, { x: 50 }))
      expect(result.current.widgets[0].x).toBe(50)
    })

    it('updates widget props', () => {
      const { result } = renderHook(() => useDesignMode())
      const w = makeWidget()
      act(() => result.current.enterEditMode([w]))
      act(() => result.current.updateWidgetProps(w.id, { title: 'New Title' }))
      expect(result.current.widgets[0].props.title).toBe('New Title')
    })

    it('deletes selected widgets', () => {
      const { result } = renderHook(() => useDesignMode())
      const w1 = makeWidget()
      const w2 = makeWidget()
      act(() => result.current.enterEditMode([w1, w2]))
      act(() => result.current.select(w1.id))
      act(() => result.current.deleteSelected())
      expect(result.current.widgets).toHaveLength(1)
      expect(result.current.widgets[0].id).toBe(w2.id)
    })

    it('moves a widget', () => {
      const { result } = renderHook(() => useDesignMode())
      const w = makeWidget({ x: 0, y: 0 })
      act(() => result.current.enterEditMode([w]))
      act(() => result.current.moveWidget(w.id, 100, 200))
      expect(result.current.widgets[0].x).toBe(100)
      expect(result.current.widgets[0].y).toBe(200)
    })

    it('resizes a widget with min size', () => {
      const { result } = renderHook(() => useDesignMode())
      const w = makeWidget({ w: 100, h: 100 })
      act(() => result.current.enterEditMode([w], 'absolute'))
      act(() => result.current.resizeWidget(w.id, 20, 20))
      // Min size is 40 in absolute mode
      expect(result.current.widgets[0].w).toBe(40)
      expect(result.current.widgets[0].h).toBe(40)
    })
  })

  // ── Undo/Redo ──
  describe('undo/redo', () => {
    it('starts with canUndo=false', () => {
      const { result } = renderHook(() => useDesignMode())
      expect(result.current.canUndo).toBe(false)
      expect(result.current.canRedo).toBe(false)
    })

    it('can undo after adding a widget', () => {
      const { result } = renderHook(() => useDesignMode())
      act(() => result.current.enterEditMode([]))
      act(() => result.current.addWidget(makeWidget()))
      expect(result.current.canUndo).toBe(true)
      act(() => result.current.undo())
      expect(result.current.widgets).toHaveLength(0)
    })

    it('can redo after undo', () => {
      const { result } = renderHook(() => useDesignMode())
      act(() => result.current.enterEditMode([]))
      const w = makeWidget()
      act(() => result.current.addWidget(w))
      act(() => result.current.undo())
      expect(result.current.canRedo).toBe(true)
      act(() => result.current.redo())
      expect(result.current.widgets).toHaveLength(1)
    })

    it('new change clears redo stack', () => {
      const { result } = renderHook(() => useDesignMode())
      act(() => result.current.enterEditMode([]))
      act(() => result.current.addWidget(makeWidget()))
      act(() => result.current.undo())
      expect(result.current.canRedo).toBe(true)
      act(() => result.current.addWidget(makeWidget()))
      expect(result.current.canRedo).toBe(false)
    })
  })

  // ── Clipboard ──
  describe('clipboard', () => {
    it('copy then paste duplicates with offset', () => {
      const { result } = renderHook(() => useDesignMode())
      const w = makeWidget({ x: 50, y: 50 })
      act(() => result.current.enterEditMode([w], 'absolute'))
      act(() => result.current.select(w.id))
      act(() => result.current.copySelected())
      act(() => result.current.paste())
      expect(result.current.widgets).toHaveLength(2)
      // Pasted widget has offset
      const pasted = result.current.widgets[1]
      expect(pasted.x).toBe(70)
      expect(pasted.y).toBe(70)
      expect(pasted.id).not.toBe(w.id)
    })

    it('cut removes and enables paste', () => {
      const { result } = renderHook(() => useDesignMode())
      const w = makeWidget()
      act(() => result.current.enterEditMode([w], 'absolute'))
      act(() => result.current.select(w.id))
      act(() => result.current.cutSelected())
      expect(result.current.widgets).toHaveLength(0)
      act(() => result.current.paste())
      expect(result.current.widgets).toHaveLength(1)
    })

    it('duplicate creates copy with offset', () => {
      const { result } = renderHook(() => useDesignMode())
      const w = makeWidget({ x: 10, y: 10 })
      act(() => result.current.enterEditMode([w], 'absolute'))
      act(() => result.current.select(w.id))
      act(() => result.current.duplicateSelected())
      expect(result.current.widgets).toHaveLength(2)
    })
  })

  // ── Z-order ──
  describe('z-order', () => {
    it('bringToFront moves selected to end', () => {
      const { result } = renderHook(() => useDesignMode())
      const w1 = makeWidget()
      const w2 = makeWidget()
      const w3 = makeWidget()
      act(() => result.current.enterEditMode([w1, w2, w3]))
      act(() => result.current.select(w1.id))
      act(() => result.current.bringToFront())
      const ids = result.current.widgets.map(w => w.id)
      expect(ids[ids.length - 1]).toBe(w1.id)
    })

    it('sendToBack moves selected to start', () => {
      const { result } = renderHook(() => useDesignMode())
      const w1 = makeWidget()
      const w2 = makeWidget()
      const w3 = makeWidget()
      act(() => result.current.enterEditMode([w1, w2, w3]))
      act(() => result.current.select(w3.id))
      act(() => result.current.sendToBack())
      const ids = result.current.widgets.map(w => w.id)
      expect(ids[0]).toBe(w3.id)
    })

    it('bringForward swaps with next', () => {
      const { result } = renderHook(() => useDesignMode())
      const w1 = makeWidget()
      const w2 = makeWidget()
      const w3 = makeWidget()
      act(() => result.current.enterEditMode([w1, w2, w3]))
      act(() => result.current.select(w1.id))
      act(() => result.current.bringForward())
      const ids = result.current.widgets.map(w => w.id)
      expect(ids[0]).toBe(w2.id)
      expect(ids[1]).toBe(w1.id)
    })

    it('sendBackward swaps with previous', () => {
      const { result } = renderHook(() => useDesignMode())
      const w1 = makeWidget()
      const w2 = makeWidget()
      const w3 = makeWidget()
      act(() => result.current.enterEditMode([w1, w2, w3]))
      act(() => result.current.select(w3.id))
      act(() => result.current.sendBackward())
      const ids = result.current.widgets.map(w => w.id)
      expect(ids[1]).toBe(w3.id)
      expect(ids[2]).toBe(w2.id)
    })
  })

  // ── Alignment ──
  describe('alignment', () => {
    it('align left aligns to leftmost widget', () => {
      const { result } = renderHook(() => useDesignMode())
      const w1 = makeWidget({ x: 10, y: 0, w: 50, h: 50 })
      const w2 = makeWidget({ x: 100, y: 0, w: 50, h: 50 })
      act(() => result.current.enterEditMode([w1, w2]))
      act(() => result.current.selectAll())
      act(() => result.current.align('left'))
      expect(result.current.widgets[0].x).toBe(10)
      expect(result.current.widgets[1].x).toBe(10)
    })

    it('align right aligns to rightmost edge', () => {
      const { result } = renderHook(() => useDesignMode())
      const w1 = makeWidget({ x: 10, y: 0, w: 50, h: 50 })
      const w2 = makeWidget({ x: 100, y: 0, w: 50, h: 50 })
      act(() => result.current.enterEditMode([w1, w2]))
      act(() => result.current.selectAll())
      act(() => result.current.align('right'))
      // maxX = 100 + 50 = 150, w1 should be at 150-50=100, w2 at 150-50=100
      expect(result.current.widgets[0].x).toBe(100)
      expect(result.current.widgets[1].x).toBe(100)
    })

    it('requires at least 2 selected', () => {
      const { result } = renderHook(() => useDesignMode())
      const w1 = makeWidget({ x: 10 })
      act(() => result.current.enterEditMode([w1]))
      act(() => result.current.select(w1.id))
      act(() => result.current.align('left'))
      // Should be no-op since only 1 selected
      expect(result.current.widgets[0].x).toBe(10)
    })
  })

  // ── Distribution ──
  describe('distribution', () => {
    it('distribute horizontal evenly spaces widgets', () => {
      const { result } = renderHook(() => useDesignMode())
      const w1 = makeWidget({ x: 0, y: 0, w: 50, h: 50 })
      const w2 = makeWidget({ x: 50, y: 0, w: 50, h: 50 })
      const w3 = makeWidget({ x: 200, y: 0, w: 50, h: 50 })
      act(() => result.current.enterEditMode([w1, w2, w3]))
      act(() => result.current.selectAll())
      act(() => result.current.distribute('horizontal'))
      const xs = result.current.widgets.map(w => w.x).sort((a, b) => a - b)
      expect(xs[0]).toBe(0)
      expect(xs[1]).toBe(100)
      expect(xs[2]).toBe(200)
    })

    it('requires at least 3 selected', () => {
      const { result } = renderHook(() => useDesignMode())
      const w1 = makeWidget({ x: 0 })
      const w2 = makeWidget({ x: 100 })
      act(() => result.current.enterEditMode([w1, w2]))
      act(() => result.current.selectAll())
      act(() => result.current.distribute('horizontal'))
      // Should be no-op
      expect(result.current.widgets[0].x).toBe(0)
    })
  })

  // ── Lock ──
  describe('lock', () => {
    it('locked widget cannot be moved', () => {
      const { result } = renderHook(() => useDesignMode())
      const w = makeWidget({ x: 0, y: 0 })
      act(() => result.current.enterEditMode([w]))
      act(() => result.current.toggleLock(w.id))
      expect(result.current.lockedIds.has(w.id)).toBe(true)
      act(() => result.current.moveWidget(w.id, 100, 100))
      expect(result.current.widgets[0].x).toBe(0)
    })

    it('locked widget skipped on delete', () => {
      const { result } = renderHook(() => useDesignMode())
      const w1 = makeWidget()
      const w2 = makeWidget()
      act(() => result.current.enterEditMode([w1, w2]))
      act(() => result.current.toggleLock(w1.id))
      act(() => result.current.selectAll())
      act(() => result.current.deleteSelected())
      expect(result.current.widgets).toHaveLength(1)
      expect(result.current.widgets[0].id).toBe(w1.id)
    })

    it('toggleLock toggles on and off', () => {
      const { result } = renderHook(() => useDesignMode())
      const w = makeWidget()
      act(() => result.current.enterEditMode([w]))
      act(() => result.current.toggleLock(w.id))
      expect(result.current.lockedIds.has(w.id)).toBe(true)
      act(() => result.current.toggleLock(w.id))
      expect(result.current.lockedIds.has(w.id)).toBe(false)
    })
  })

  // ── Zoom ──
  describe('zoom', () => {
    it('clamps zoom to 0.5-2 range', () => {
      const { result } = renderHook(() => useDesignMode())
      act(() => result.current.setZoom(0.1))
      expect(result.current.zoom).toBe(0.5)
      act(() => result.current.setZoom(5))
      expect(result.current.zoom).toBe(2)
    })
  })
})
