/**
 * Tests for useAuth hook — login, logout, and localStorage persistence.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAuthState } from '../useAuth'

describe('useAuthState', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts unauthenticated when localStorage is empty', () => {
    const { result } = renderHook(() => useAuthState())
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
    expect(result.current.token).toBeNull()
  })

  it('login sets user and token', () => {
    const { result } = renderHook(() => useAuthState())
    act(() => {
      result.current.login('test-token', { id: 1, username: 'admin', display_name: 'Admin', role: 'designer' })
    })
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.token).toBe('test-token')
    expect(result.current.user?.username).toBe('admin')
  })

  it('login persists to localStorage', () => {
    const { result } = renderHook(() => useAuthState())
    act(() => {
      result.current.login('test-token', { id: 1, username: 'admin', display_name: 'Admin', role: 'designer' })
    })
    expect(localStorage.getItem('hmi_token')).toBe('test-token')
    expect(localStorage.getItem('hmi_user')).toContain('admin')
  })

  it('logout clears state and localStorage', () => {
    const { result } = renderHook(() => useAuthState())
    act(() => {
      result.current.login('test-token', { id: 1, username: 'admin', display_name: 'Admin', role: 'designer' })
    })
    act(() => {
      result.current.logout()
    })
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
    expect(localStorage.getItem('hmi_token')).toBeNull()
  })

  it('restores from localStorage on mount', () => {
    localStorage.setItem('hmi_token', 'restored-token')
    localStorage.setItem('hmi_user', JSON.stringify({ id: 1, username: 'admin', display_name: 'Admin', role: 'designer' }))
    const { result } = renderHook(() => useAuthState())
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.token).toBe('restored-token')
    expect(result.current.user?.username).toBe('admin')
  })
})
