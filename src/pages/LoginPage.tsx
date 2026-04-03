import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Activity, Lock, User, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'

import backgroundImage from '../assets/56438.jpeg'

export function LoginPage() {
  const { login, user, loading, logout } = useAuth()
  const nav = useNavigate()
  const loc = useLocation() as { state?: { from?: string } }
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (!loading && user && user.role !== 'patient') {
    const to = loc.state?.from && loc.state.from !== '/login' ? loc.state.from : '/app'
    return <Navigate to={to} replace />
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    try {
      const me = await login(username, password)
      if (me.role === 'patient') {
        logout()
        setErr('Patients use the mobile app. Staff accounts only here.')
        return
      }
      nav('/app', { replace: true })
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Login failed')
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      {/* Full-viewport photo + dark scrim so the form stays readable */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        <img
          src={backgroundImage}
          alt=""
          className="h-full w-full object-cover object-center [object-position:center_28%]"
        />
        <div className="absolute inset-0 bg-slate-850/72" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-900/55 to-slate-950/85" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_80%_at_50%_0%,rgba(6,182,212,0.18),transparent_55%)]" />
      </div>
      <form
        onSubmit={onSubmit}
        className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-white/95 p-8 shadow-2xl shadow-slate-950/40 ring-1 ring-white/20 backdrop-blur-sm"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-cyan-100 ring-1 ring-cyan-200/80">
            <Activity className="size-7 text-cyan-700" strokeWidth={2} aria-hidden />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Staff sign in</h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
            OPD queue management — sign in to access the console.
          </p>
        </div>

        <label className="block text-sm font-medium text-slate-700">
          <span className="mb-1.5 flex items-center gap-2">
            <User className="size-3.5 text-slate-500" strokeWidth={2} aria-hidden />
            Username
          </span>
          <input
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none ring-cyan-500/0 transition-shadow placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            placeholder="e.g. admin"
          />
        </label>

        <label className="mt-5 block text-sm font-medium text-slate-700">
          <span className="mb-1.5 flex items-center gap-2">
            <Lock className="size-3.5 text-slate-500" strokeWidth={2} aria-hidden />
            Password
          </span>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-11 text-slate-900 shadow-sm outline-none transition-shadow placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </label>

        {err ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden />
            <span>{err}</span>
          </div>
        ) : null}

        <button
          type="submit"
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 py-3 text-sm font-semibold text-white shadow-md shadow-cyan-900/10 transition hover:from-cyan-500 hover:to-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
        >
          Sign in
        </button>

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">
          Demo: <span className="text-slate-700">admin / Admin@123</span> · greeter/Greeter@123 · clerk/Clerk@123 ·
          coordinator/Coordinator@123 · physician/Physician@123 · labtech/LabTech@123
        </p>
      </form>
    </div>
  )
}
