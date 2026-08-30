import { api, setCsrfToken } from './api.ts'

export type StaffUser = {
  id: number
  name: string
  email: string
}

let currentUser: StaffUser | null = null

export function getCurrentUser(): StaffUser | null {
  return currentUser
}

export async function login(email: string, password: string): Promise<StaffUser> {
  const result = await api<{ user: StaffUser; csrfToken: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  currentUser = result.user
  setCsrfToken(result.csrfToken)
  return result.user
}

export async function fetchSession(): Promise<StaffUser | null> {
  try {
    const result = await api<{ user: StaffUser; csrfToken: string }>('/api/auth/session')
    currentUser = result.user
    setCsrfToken(result.csrfToken)
    return result.user
  } catch {
    currentUser = null
    setCsrfToken(null)
    return null
  }
}

export async function logout(): Promise<void> {
  try {
    await api('/api/auth/logout', { method: 'POST' })
  } finally {
    currentUser = null
    setCsrfToken(null)
  }
}
