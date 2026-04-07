import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LayoutDashboard,
  CalendarDays,
  MapPin,
  ClipboardList,
  Truck,
  CheckCircle2,
  SkipForward,
  Ban,
  Hash,
  AlertCircle,
  RefreshCw,
  FileText,
  HeartPulse,
  UserCircle2,
} from 'lucide-react'
import { SpeechInput } from '../components/speech'
import { api } from '../api/client'
import { todayLocalYmd } from '../utils/dateYmd'
import { useAuth } from '../context/AuthContext'
import { toastError, toastSuccess } from '../lib/toast'
import { ui } from '../ui/classes'

type Center = {
  id: number
  name: string
  city: string
  hospital_name?: string
}

type Summary = {
  date: string
  center_id: number | null
  byStatus: Record<string, number>
  total: number
  patients?: {
    total_in_system: number
    with_visit_on_date: number
  }
}

function today() {
  return todayLocalYmd()
}

const STATUS_ORDER: { key: string; label: string; icon: typeof ClipboardList; iconWrap: string }[] = [
  { key: 'booked', label: 'Booked', icon: ClipboardList, iconWrap: 'bg-sky-100 text-sky-700 ring-sky-200' },
  { key: 'registered', label: 'Registered', icon: FileText, iconWrap: 'bg-blue-100 text-blue-800 ring-blue-200' },
  { key: 'ready', label: 'Ready (pre-assessment done)', icon: HeartPulse, iconWrap: 'bg-teal-100 text-teal-800 ring-teal-200' },
  { key: 'batched', label: 'Batched', icon: LayoutDashboard, iconWrap: 'bg-violet-100 text-violet-800 ring-violet-200' },
  { key: 'dispatched', label: 'Dispatched', icon: Truck, iconWrap: 'bg-amber-100 text-amber-900 ring-amber-200' },
  { key: 'completed', label: 'Completed', icon: CheckCircle2, iconWrap: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  { key: 'skipped', label: 'Skipped', icon: SkipForward, iconWrap: 'bg-orange-100 text-orange-900 ring-orange-200' },
  { key: 'cancelled', label: 'Cancelled', icon: Ban, iconWrap: 'bg-rose-100 text-rose-800 ring-rose-200' },
]

export function DashboardHome() {
  const { can } = useAuth()
  const [date, setDate] = useState(today)
  const [centerId, setCenterId] = useState<number | ''>('')
  const [centers, setCenters] = useState<Center[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!can('centers.read')) return
    let off = false
    api<Center[]>('/centers')
      .then((c) => {
        if (!off) setCenters(c)
      })
      .catch(() => {})
    return () => {
      off = true
    }
  }, [can])

  useEffect(() => {
    if (!can('dashboard.read')) return
    let off = false
    setLoading(true)
    const q =
      centerId === ''
        ? `?date=${encodeURIComponent(date)}`
        : `?date=${encodeURIComponent(date)}&center_id=${centerId}`
    api<Summary>(`/dashboard/summary${q}`)
      .then((s) => {
        if (!off) {
          setSummary(s)
        }
      })
      .catch((e) => {
        if (!off) {
          setSummary(null)
          toastError(e, 'Could not load dashboard summary')
        }
      })
      .finally(() => {
        if (!off) setLoading(false)
      })
    return () => {
      off = true
    }
  }, [date, centerId, can])

  if (!can('dashboard.read')) {
    return (
      <div className={`flex items-center gap-3 ${ui.alertError} border-amber-200 bg-amber-50 text-amber-900`}>
        <AlertCircle className="size-5 shrink-0 text-amber-600" strokeWidth={2} aria-hidden />
        You do not have dashboard access.
      </div>
    )
  }

  return (
    <div className={`space-y-8 ${ui.page}`}>
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-8 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-red-700">
            <LayoutDashboard className="size-6" strokeWidth={2} aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Overview</span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-1 max-w-lg text-sm leading-relaxed text-slate-600">
            Daily OPD ticketing snapshot — filter by date and center to match operations.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            const q =
              centerId === ''
                ? `?date=${encodeURIComponent(date)}`
                : `?date=${encodeURIComponent(date)}&center_id=${centerId}`
            setLoading(true)
            api<Summary>(`/dashboard/summary${q}`)
              .then((s) => {
                setSummary(s)
                toastSuccess('Dashboard refreshed')
              })
              .catch((e) => {
                setSummary(null)
                toastError(e, 'Could not refresh dashboard')
              })
              .finally(() => setLoading(false))
          }}
          className={`${ui.btnSecondary} shrink-0 self-start`}
        >
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} aria-hidden />
          Refresh data
        </button>
      </header>

      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:flex-wrap md:items-end md:gap-6">
        <label className="flex flex-col gap-2 text-sm text-slate-600">
          <span className="flex items-center gap-2 font-medium text-slate-800">
            <CalendarDays className="size-4 text-red-600" strokeWidth={2} aria-hidden />
            Date
          </span>
          <SpeechInput
            type="date"
            className={ui.input}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        {can('centers.read') ? (
          <label className="flex min-w-[200px] flex-1 flex-col gap-2 text-sm text-slate-600 md:max-w-md">
            <span className="flex items-center gap-2 font-medium text-slate-800">
              <MapPin className="size-4 text-red-600" strokeWidth={2} aria-hidden />
              Center
            </span>
            <select
              className={ui.select}
              value={centerId === '' ? '' : String(centerId)}
              onChange={(e) => setCenterId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">All centers</option>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.hospital_name} — {c.name} ({c.city})
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {summary ? (
        <>
          {can('patients.read') && summary.patients ? (
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-slate-800">
                  <UserCircle2 className="size-5 text-red-600" strokeWidth={2} aria-hidden />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Patients</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    to="/app/patients"
                    className={`${ui.btnSecondary} no-underline`}
                  >
                    Patient directory
                  </Link>
                  {can('patients.manage') ? (
                    <Link to="/app/patients?add=1" className={`${ui.btnPrimary} no-underline`}>
                      Add patient
                    </Link>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">In system (all)</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                    {summary.patients.total_in_system}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    With OPD visit on this date
                    {summary.center_id != null ? ' (this center)' : ''}
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                    {summary.patients.with_visit_on_date}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STATUS_ORDER.map(({ key, label, icon: Icon, iconWrap }) => (
              <div
                key={key}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`flex size-10 items-center justify-center rounded-xl ring-1 ${iconWrap}`}
                  >
                    <Icon className="size-5" strokeWidth={2} aria-hidden />
                  </div>
                  <span className="text-2xl font-semibold tabular-nums text-slate-900">
                    {summary.byStatus[key] ?? 0}
                  </span>
                </div>
                <div className="mt-4 text-xs font-medium uppercase tracking-wider text-slate-500">{label}</div>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 to-white p-6 shadow-sm ring-1 ring-red-100">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-red-100 text-red-800 ring-1 ring-red-200">
                  <Hash className="size-6" strokeWidth={2} aria-hidden />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-widest text-red-800">Total appointments</div>
                  <div className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{summary.total}</div>
                </div>
              </div>
              <p className="max-w-sm text-right text-sm text-slate-600">
                For <span className="font-medium text-slate-900">{summary.date}</span>
                {summary.center_id != null ? ` · center #${summary.center_id}` : ' · all centers'}.
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-slate-500">
          {loading ? 'Loading summary…' : 'No data'}
        </div>
      )}
    </div>
  )
}


