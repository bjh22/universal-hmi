/**
 * Tests for CommandButton — action button for tag writes and script execution.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CommandButton } from '../CommandButton'

const apiMocks = vi.hoisted(() => ({
  writeTag: vi.fn(),
  executeScript: vi.fn(),
}))
vi.mock('../../../lib/api', () => ({
  api: apiMocks,
}))

beforeEach(() => {
  apiMocks.writeTag.mockReset().mockResolvedValue(undefined)
  apiMocks.executeScript.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CommandButton', () => {
  it('renders title text', () => {
    render(<CommandButton title="Start Motor" tag="Motor.Start" value={true} />)
    expect(screen.getByRole('button', { name: /Start Motor/i })).toBeInTheDocument()
  })

  it('click writes configured value to tag', async () => {
    render(<CommandButton title="Start" tag="Motor.Start" value={true} />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(apiMocks.writeTag).toHaveBeenCalledWith('Motor.Start', true)
    })
  })

  it('click executes script when script prop is provided', async () => {
    render(<CommandButton title="Seq" script="write_tag('A',1)" />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(apiMocks.executeScript).toHaveBeenCalledWith("write_tag('A',1)")
    })
    // Should not also call writeTag
    expect(apiMocks.writeTag).not.toHaveBeenCalled()
  })

  it('confirm=true shows browser confirm and aborts on cancel', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<CommandButton title="Delete All" tag="Danger" value={1} confirm />)
    fireEvent.click(screen.getByRole('button'))
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Delete All'))
    expect(apiMocks.writeTag).not.toHaveBeenCalled()
  })

  it('confirm=true proceeds when user accepts', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<CommandButton title="Delete All" tag="Danger" value={1} confirm />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(apiMocks.writeTag).toHaveBeenCalledWith('Danger', 1))
  })

  it('button is disabled and shows "Working..." while pending', async () => {
    let resolve: () => void = () => {}
    apiMocks.writeTag.mockReturnValueOnce(new Promise<void>(r => { resolve = r }))

    render(<CommandButton title="Start" tag="X" value={1} />)
    const btn = screen.getByRole('button')
    fireEvent.click(btn)
    await waitFor(() => expect(btn).toBeDisabled())
    expect(screen.getByText(/Working/i)).toBeInTheDocument()
    resolve()
    await waitFor(() => expect(btn).not.toBeDisabled())
  })

  it('swallows API errors silently (no throw up to React)', async () => {
    apiMocks.writeTag.mockRejectedValueOnce(new Error('401'))
    render(<CommandButton title="Boom" tag="X" value={1} />)
    fireEvent.click(screen.getByRole('button'))
    // Test passes as long as the error doesn't escape (would show up as an
    // unhandled rejection / React error boundary otherwise)
    await waitFor(() => expect(apiMocks.writeTag).toHaveBeenCalled())
    // Button re-enables after failure
    await waitFor(() => expect(screen.getByRole('button')).not.toBeDisabled())
  })
})
