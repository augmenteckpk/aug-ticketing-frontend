import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  CalendarDays,
  MapPin,
  ClipboardList,
  UserCheck,
  Truck,
  CheckCircle2,
  SkipForward,
  Ban,
  Hash,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
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
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

const STATUS_ORDER: { key: string; label: string; icon: typeof ClipboardList; iconWrap: string }[] = [
  { key: 'booked', label: 'Booked', icon: ClipboardList, iconWrap: 'bg-sky-100 text-sky-700 ring-sky-200' },
  { key: 'checked_in', label: 'Checked in', icon: UserCheck, iconWrap: 'bg-cyan-100 text-cyan-800 ring-cyan-200' },
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
  const [err, setErr] = useState<string | null>(null)
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
          setErr(null)
        }
      })
      .catch((e) => {
        if (!off) setErr(String(e))
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
          <div className="flex items-center gap-2 text-cyan-700">
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
                setErr(null)
              })
              .catch((e) => setErr(String(e)))
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
            <CalendarDays className="size-4 text-cyan-600" strokeWidth={2} aria-hidden />
            Date
          </span>
          <input
            type="date"
            className={ui.input}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        {can('centers.read') ? (
          <label className="flex min-w-[200px] flex-1 flex-col gap-2 text-sm text-slate-600 md:max-w-md">
            <span className="flex items-center gap-2 font-medium text-slate-800">
              <MapPin className="size-4 text-cyan-600" strokeWidth={2} aria-hidden />
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

      {err ? (
        <div className={`flex items-center gap-2 ${ui.alertError}`}>
          <AlertCircle className="size-4 shrink-0" strokeWidth={2} aria-hidden />
          {err}
        </div>
      ) : null}

      {summary ? (
        <>
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

          <div className="overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-6 shadow-sm ring-1 ring-cyan-100">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200">
                  <Hash className="size-6" strokeWidth={2} aria-hidden />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-widest text-cyan-800">Total appointments</div>
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
        !err && (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-slate-500">
            {loading ? 'Loading summary…' : 'No data'}
          </div>
        )
      )}
    </div>
  )
}
