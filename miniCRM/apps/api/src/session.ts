import { randomBytes } from 'node:crypto'

export type SessionUser = {
  id: number
  name: string
  email: string
}

export type Session = {
  user: SessionUser
  csrfToken: string
}

const sessions = new Map<string, Session>()

export function createSession(user: SessionUser): { sid: string; session: Session } {
  const sid = randomBytes(24).toString('hex')
  const session: Session = {
    user,
    csrfToken: randomBytes(24).toString('hex'),
  }
  sessions.set(sid, session)
  return { sid, session }
}

export function getSession(sid: string | undefined): Session | undefined {
  if (!sid) return undefined
  return sessions.get(sid)
}

export function destroySession(sid: string | undefined): void {
  if (!sid) return
  sessions.delete(sid)
}

export const COOKIE_NAME = 'sid'

export const COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: false,
}
