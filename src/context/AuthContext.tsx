import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, getToken, setToken, type LoginResponse, type MeResponse } from '../api/client'

type AuthState = {
  user: MeResponse | null
  loading: boolean
  login: (username: string, password: string) => Promise<MeResponse>
  logout: () => void
  refreshMe: () => Promise<void>
  can: (perm: string) => boolean
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshMe = useCallback(async () => {
    const t = getToken()
    if (!t) {
      setUser(null)
      return
    }
    const me = await api<MeResponse>('/auth/me')
    setUser(me)
  }, [])

  useEffect(() => {
    let ok = true
    ;(async () => {
      try {
        await refreshMe()
      } catch {
        if (ok) setToken(null)
      } finally {
        if (ok) setLoading(false)
      }
    })()
    return () => {
      ok = false
    }
  }, [refreshMe])

  const login = useCallback(async (username: string, password: string) => {
    const res = await api<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    setToken(res.token)
    const me = await api<MeResponse>('/auth/me')
    setUser(me)
    return me
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  const can = useCallback(
    (perm: string) => {
      return !!user?.permissions?.includes(perm)
    },
    [user],
  )

  const value = useMemo(
    () => ({ user, loading, login, logout, refreshMe, can }),
    [user, loading, login, logout, refreshMe, can],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth requires AuthProvider')
  return v
}
