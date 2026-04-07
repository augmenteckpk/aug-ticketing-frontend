import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Activity, Lock, User, Eye, EyeOff } from 'lucide-react'
import { SpeechInput } from '../components/speech'
import { FieldError } from '../components/FieldError'
import { ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { toastError, toastSuccess } from '../lib/toast'
import { loginPassword, loginUsername } from '../lib/fieldValidation'

import backgroundImage from '../assets/56438.jpeg'

export function LoginPage() {
  const { login, user, loading, logout } = useAuth()
  const nav = useNavigate()
  const loc = useLocation() as { state?: { from?: string } }
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErr, setFieldErr] = useState<{ username?: string; password?: string }>({})

  if (!loading && user && user.role !== 'patient') {
    const to = loc.state?.from && loc.state.from !== '/login' ? loc.state.from : '/app'
    return <Navigate to={to} replace />
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const u = loginUsername(username)
    const p = loginPassword(password)
    const next: { username?: string; password?: string } = {}
    if (!u.ok) next.username = u.message
    if (!p.ok) next.password = p.message
    setFieldErr(next)
    if (Object.keys(next).length) return
    try {
      const me = await login(username, password)
      if (me.role === 'patient') {
        logout()
        toastError('Patients use the mobile app. Staff accounts only here.')
        return
      }
      toastSuccess('Signed in')
      nav('/app', { replace: true })
    } catch (e) {
      toastError(e instanceof ApiError ? e : new Error('Login failed'))
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
          <div className="flex size-14 items-center justify-center rounded-2xl bg-red-100 ring-1 ring-red-200/80">
            <Activity className="size-7 text-red-700" strokeWidth={2} aria-hidden />
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
          <SpeechInput
            shellClassName={`rounded-xl shadow-sm${fieldErr.username ? ' !border-red-400 ring-1 ring-red-400' : ''}`}
            className="!px-4 !py-3 text-base outline-none placeholder:text-slate-400"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value)
              if (fieldErr.username) setFieldErr((f) => ({ ...f, username: undefined }))
            }}
            autoComplete="username"
            placeholder="e.g. admin"
            aria-invalid={fieldErr.username ? true : undefined}
            aria-describedby={fieldErr.username ? 'login-username-err' : undefined}
          />
          <FieldError id="login-username-err" message={fieldErr.username} />
        </label>

        <label className="mt-5 block text-sm font-medium text-slate-700">
          <span className="mb-1.5 flex items-center gap-2">
            <Lock className="size-3.5 text-slate-500" strokeWidth={2} aria-hidden />
            Password
          </span>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              className={`w-full rounded-xl border bg-white px-4 py-3 pr-11 text-slate-900 shadow-sm outline-none transition-shadow placeholder:text-slate-400 focus:ring-2 ${
                fieldErr.password ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : 'border-slate-300 focus:border-red-500 focus:ring-red-500/20'
              }`}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (fieldErr.password) setFieldErr((f) => ({ ...f, password: undefined }))
              }}
              autoComplete="current-password"
              placeholder="••••••••"
              aria-invalid={fieldErr.password ? true : undefined}
              aria-describedby={fieldErr.password ? 'login-password-err' : undefined}
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
          <FieldError id="login-password-err" message={fieldErr.password} />
        </label>

        <button
          type="submit"
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-red-600 to-red-500 py-3 text-sm font-semibold text-white shadow-md shadow-red-900/10 transition hover:from-red-500 hover:to-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
        >
          Sign in
        </button>

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">
          Demo: <span className="text-slate-700">admin / Admin@123</span> · greeter/Greeter@123 · clerk/Clerk@123 ·
          coordinator/Coordinator@123 · physician/Physician@123 · labtech/LabTech@123
        </p>
        <p className="mt-3 text-center text-xs">
          <Link
            to="/display/waiting"
            className="font-medium text-red-700 underline decoration-red-400/60 underline-offset-2 hover:text-red-800"
          >
            Waiting-area LED display (no login)
          </Link>
        </p>
      </form>
    </div>
  )
}


