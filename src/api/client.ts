const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')

const TOKEN_KEY = 'opd_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  details?: unknown
  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: HeadersInit = {
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init.headers as Record<string, string>) ?? {}),
  }
  const res = await fetch(`${API_BASE}/api/v1${path}`, { ...init, headers })
  const text = await res.text()
  const data = text ? (JSON.parse(text) as unknown) : null
  if (!res.ok) {
    const err = data as { error?: string; details?: unknown }
    throw new ApiError(err?.error ?? res.statusText, res.status, err?.details)
  }
  return data as T
}

export type MeResponse = {
  id: number
  username: string
  email: string | null
  phone: string | null
  status: string
  role: string
  role_id: number
  patient_id: number | null
  permissions: string[]
  patient?: unknown
}

export type LoginResponse = {
  token: string
  user: {
    id: number
    username: string
    permissions: string[]
    role: string
    patient_id: number | null
  }
}
