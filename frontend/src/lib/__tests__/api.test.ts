/**
 * Tests for the API client (lib/api.ts).
 *
 * Tests the request function's error handling, header injection,
 * and URL encoding without making real HTTP calls.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('API client', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('includes Authorization header when token exists', async () => {
    localStorage.setItem('hmi_token', 'test-jwt-token')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    )

    // Dynamic import to pick up fresh localStorage state
    const { api } = await import('../api')
    await api.getTags()

    expect(fetchSpy).toHaveBeenCalled()
    const [, options] = fetchSpy.mock.calls[0]
    expect(options?.headers).toBeDefined()
    const headers = options!.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer test-jwt-token')
  })

  it('omits Authorization header when no token', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    )

    const { api } = await import('../api')
    await api.getTags()

    const [, options] = fetchSpy.mock.calls[0]
    const headers = options!.headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
  })

  it('throws on non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 })
    )

    const { api } = await import('../api')
    await expect(api.getTags()).rejects.toThrow('Not found')
  })

  it('throws generic error when no detail in response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 })
    )

    const { api } = await import('../api')
    await expect(api.getTags()).rejects.toThrow('HTTP 500')
  })

  it('encodes tag names with special characters', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    )

    const { api } = await import('../api')
    await api.getTagByName('Motor/Speed')

    const [url] = fetchSpy.mock.calls[0]
    expect(url).toContain('Motor%2FSpeed')
  })
})
