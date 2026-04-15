/**
 * Tests for GitPanel — Version control UI on the Projects page.
 *
 * The component drives almost entirely through the `api` module, so we mock
 * that at the module level. Covers: non-repo fallback, status render,
 * commit/push/pull flows, refresh, and the diff expansion behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GitPanel } from '../GitPanel'
import type { GitStatus, GitCommitEntry } from '../../types'

// Mock the api module — GitPanel only imports { api } from '../lib/api'.
// vi.hoisted gives our mocks a stable identity hoisted above the vi.mock call.
const mocks = vi.hoisted(() => ({
  getGitStatus: vi.fn(),
  getGitLog: vi.fn(),
  getGitDiff: vi.fn(),
  gitCommit: vi.fn(),
  gitPush: vi.fn(),
  gitPull: vi.fn(),
}))
vi.mock('../../lib/api', () => ({
  api: mocks,
}))

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.getGitLog.mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

function makeStatus(overrides: Partial<GitStatus> = {}): GitStatus {
  return {
    available: true,
    branch: 'main',
    dirty: false,
    changed_files: [],
    has_remote: false,
    ahead: 0,
    behind: 0,
    ...overrides,
  }
}

describe('GitPanel — non-repo state', () => {
  it('shows setup instructions when projects dir is not a git repo', async () => {
    mocks.getGitStatus.mockResolvedValue({ available: false, reason: 'Not a git repo' })
    render(<GitPanel onSaveFirst={vi.fn()} disabled={false} />)

    await waitFor(() => {
      expect(screen.getByText(/Version Control/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/HMI_PROJECTS_DIR/)).toBeInTheDocument()
  })
})

describe('GitPanel — active repo', () => {
  it('renders branch name and clean state', async () => {
    mocks.getGitStatus.mockResolvedValue(makeStatus({ branch: 'develop' }))
    render(<GitPanel onSaveFirst={vi.fn()} disabled={false} />)

    await waitFor(() => expect(screen.getByText('develop')).toBeInTheDocument())
    // No "Unsaved changes" badge when clean
    expect(screen.queryByText(/Unsaved changes/i)).not.toBeInTheDocument()
  })

  it('shows "Unsaved changes" badge and changed file list when dirty', async () => {
    mocks.getGitStatus.mockResolvedValue(makeStatus({
      dirty: true,
      changed_files: [
        { file: 'foo.hmi.json', status: 'modified' },
        { file: 'bar.hmi.json', status: 'new' },
      ],
    }))
    render(<GitPanel onSaveFirst={vi.fn()} disabled={false} />)

    await waitFor(() => expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument())
    expect(screen.getByText('foo.hmi.json')).toBeInTheDocument()
    expect(screen.getByText('bar.hmi.json')).toBeInTheDocument()
  })

  it('shows ahead/behind counts when remote is tracked', async () => {
    mocks.getGitStatus.mockResolvedValue(makeStatus({
      has_remote: true, ahead: 2, behind: 1,
    }))
    render(<GitPanel onSaveFirst={vi.fn()} disabled={false} />)

    await waitFor(() => expect(screen.getByText(/2 ahead/)).toBeInTheDocument())
    expect(screen.getByText(/1 behind/)).toBeInTheDocument()
  })

  it('commit flow calls onSaveFirst then api.gitCommit', async () => {
    mocks.getGitStatus.mockResolvedValue(makeStatus({
      dirty: true,
      changed_files: [{ file: 'a.hmi.json', status: 'modified' }],
    }))
    mocks.gitCommit.mockResolvedValue({ success: true, message: 'Committed abc1234' })
    const onSaveFirst = vi.fn().mockResolvedValue(undefined)

    render(<GitPanel onSaveFirst={onSaveFirst} disabled={false} />)

    await waitFor(() => expect(screen.getByText('a.hmi.json')).toBeInTheDocument())

    // Open commit UI
    fireEvent.click(screen.getByRole('button', { name: /Commit/i }))
    const input = await screen.findByPlaceholderText(/Commit message/i)
    fireEvent.change(input, { target: { value: 'fix: thing' } })
    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }))

    await waitFor(() => {
      expect(onSaveFirst).toHaveBeenCalledTimes(1)
      expect(mocks.gitCommit).toHaveBeenCalledWith('fix: thing')
    })
    // Result banner
    await waitFor(() => expect(screen.getByText(/Committed abc1234/)).toBeInTheDocument())
  })

  it('commit button is disabled with empty/whitespace message', async () => {
    mocks.getGitStatus.mockResolvedValue(makeStatus({
      dirty: true,
      changed_files: [{ file: 'a.hmi.json', status: 'modified' }],
    }))
    render(<GitPanel onSaveFirst={vi.fn()} disabled={false} />)

    await waitFor(() => expect(screen.getByText('a.hmi.json')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Commit/i }))
    const confirm = await screen.findByRole('button', { name: /Confirm/i })
    expect(confirm).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText(/Commit message/i), { target: { value: '   ' } })
    expect(confirm).toBeDisabled()
  })

  it('push triggers api.gitPush and refreshes', async () => {
    mocks.getGitStatus
      .mockResolvedValueOnce(makeStatus({ has_remote: true, ahead: 1 }))
      .mockResolvedValue(makeStatus({ has_remote: true, ahead: 0 }))
    mocks.gitPush.mockResolvedValue({ success: true, message: 'Pushed' })

    render(<GitPanel onSaveFirst={vi.fn()} disabled={false} />)
    await waitFor(() => expect(screen.getByText(/1 ahead/)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Push/i }))
    await waitFor(() => expect(mocks.gitPush).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText(/Pushed/)).toBeInTheDocument())
  })

  it('push failure surfaces error banner', async () => {
    mocks.getGitStatus.mockResolvedValue(makeStatus({
      has_remote: true, ahead: 1, dirty: true,
      changed_files: [{ file: 'x.hmi.json', status: 'modified' }],
    }))
    mocks.gitPush.mockResolvedValue({
      success: false, message: 'Push failed', details: 'remote rejected',
    })

    render(<GitPanel onSaveFirst={vi.fn()} disabled={false} />)
    await waitFor(() => expect(screen.getByText(/1 ahead/)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Push/i }))
    await waitFor(() => expect(screen.getByText(/Push failed/)).toBeInTheDocument())
    expect(screen.getByText(/remote rejected/)).toBeInTheDocument()
  })

  it('pull triggers api.gitPull', async () => {
    mocks.getGitStatus.mockResolvedValue(makeStatus({ has_remote: true }))
    mocks.gitPull.mockResolvedValue({ success: true, message: 'Pulled successfully' })

    render(<GitPanel onSaveFirst={vi.fn()} disabled={false} />)
    await waitFor(() => expect(screen.getByText('main')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Pull/i }))
    await waitFor(() => expect(mocks.gitPull).toHaveBeenCalledTimes(1))
  })

  it('renders commit history when available', async () => {
    mocks.getGitStatus.mockResolvedValue(makeStatus())
    const log: GitCommitEntry[] = [
      { hash: 'aaaabbb', short: 'aaaabbb', author: 'me',
        date: new Date().toISOString(), message: 'first' },
      { hash: 'cccdddd', short: 'cccdddd', author: 'me',
        date: new Date(Date.now() - 3600000).toISOString(), message: 'second' },
    ]
    mocks.getGitLog.mockResolvedValue(log)

    render(<GitPanel onSaveFirst={vi.fn()} disabled={false} />)
    await waitFor(() => expect(screen.getByText(/Recent commits \(2\)/)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Recent commits/i }))
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument())
    expect(screen.getByText('second')).toBeInTheDocument()
  })

  it('clicking a changed file expands and fetches the diff', async () => {
    mocks.getGitStatus.mockResolvedValue(makeStatus({
      dirty: true,
      changed_files: [{ file: 'a.hmi.json', status: 'modified' }],
    }))
    mocks.getGitDiff.mockResolvedValue({
      file: 'a.hmi.json',
      diff: '--- a/a.hmi.json\n+++ b/a.hmi.json\n+added line',
      truncated: false,
      total_lines: 3,
    })

    render(<GitPanel onSaveFirst={vi.fn()} disabled={false} />)
    await waitFor(() => expect(screen.getByText('a.hmi.json')).toBeInTheDocument())

    fireEvent.click(screen.getByText('a.hmi.json'))
    await waitFor(() => expect(mocks.getGitDiff).toHaveBeenCalledWith('a.hmi.json', 500))
    await waitFor(() => expect(screen.getByText(/\+added line/)).toBeInTheDocument())
  })
})
