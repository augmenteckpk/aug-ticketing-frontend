import { useEffect, useState } from 'react'
import { BarChart3, RefreshCw } from 'lucide-react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { ui } from '../ui/classes'
import { getToken } from '../api/client'

type CenterRow = { center_id: number; center_name: string; hospital_name: string; total: number }
type DepartmentRow = { department_id: number | null; department_name: string | null; total: number }
type Center = { id: number; name: string; city: string; hospital_name?: string }
type Department = { id: number; name: string }
type Report = {
  date: string
  total: number
  by_status: Record<string, number>
  by_center: CenterRow[]
  by_department: DepartmentRow[]
  patient_visits: Array<{
    appointment_id: number
    appointment_date: string
    token_number: number
    status: string
    patient_id: number
    patient_name: string
    patient_cnic: string
    center_id: number
    center_name: string
    hospital_name: string
    department_name: string | null
  }>
}
type RangeReport = {
  from_date: string
  to_date: string
  total: number
  by_status: Record<string, number>
  by_center: CenterRow[]
  by_day_status: Array<{ report_date: string; status: string; total: number }>
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export function ReportsPage() {
  const { can } = useAuth()
  const [date, setDate] = useState(today)
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(today)
  const [centers, setCenters] = useState<Center[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [centerId, setCenterId] = useState<number | ''>('')
  const [departmentId, setDepartmentId] = useState<number | ''>('')
  const [data, setData] = useState<Report | null>(null)
  const [rangeData, setRangeData] = useState<RangeReport | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    setErr(null)
    try {
      const q = new URLSearchParams()
      q.set('date', date)
      if (centerId !== '') q.set('center_id', String(centerId))
      if (departmentId !== '') q.set('department_id', String(departmentId))
      const out = await api<Report>(`/reports/daily?${q.toString()}`)
      setData(out)
    } catch (e) {
      setErr(String(e))
    }
  }

  useEffect(() => {
    if (!can('reports.read')) return
    api<Center[]>('/centers').then(setCenters).catch(() => {})
    api<Department[]>('/departments?active_only=1').then(setDepartments).catch(() => {})
  }, [can])

  useEffect(() => {
    if (can('reports.read')) void load()
  }, [date, centerId, departmentId])

  async function loadRange() {
    setErr(null)
    try {
      const q = new URLSearchParams()
      q.set('from_date', fromDate)
      q.set('to_date', toDate)
      if (centerId !== '') q.set('center_id', String(centerId))
      if (departmentId !== '') q.set('department_id', String(departmentId))
      const out = await api<RangeReport>(`/reports/range?${q.toString()}`)
      setRangeData(out)
    } catch (e) {
      setErr(String(e))
    }
  }

  if (!can('reports.read')) return <p className={ui.muted}>No reporting permission.</p>

  return (
    <div className={`space-y-8 ${ui.page}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-700">
            <BarChart3 className="size-5" strokeWidth={2} aria-hidden />
            <h1 className={ui.h1}>Reporting</h1>
          </div>
          <p className={`mt-1 text-sm ${ui.muted}`}>Operational report by status, center, and department.</p>
        </div>
        <button type="button" className={ui.btnSecondary} onClick={() => void load()}>
          <RefreshCw className="size-4" strokeWidth={2} aria-hidden />
          Refresh
        </button>
      </div>

      <div className={`${ui.card} flex flex-wrap items-end gap-3`}>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Date
          <input type="date" className={ui.input} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Center
          <select className={ui.select} value={centerId === '' ? '' : String(centerId)} onChange={(e) => setCenterId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">All centers</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.hospital_name} — {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Department
          <select className={ui.select} value={departmentId === '' ? '' : String(departmentId)} onChange={(e) => setDepartmentId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={ui.btnSecondary}
          onClick={() => {
            if (!data) return
            const lines: string[] = []
            lines.push('section,key,value')
            lines.push(`overview,total,${data.total}`)
            for (const [k, v] of Object.entries(data.by_status)) lines.push(`status,${k},${v}`)
            for (const r of data.by_center) lines.push(`center,${r.hospital_name} - ${r.center_name},${r.total}`)
            for (const r of data.by_department) lines.push(`department,${r.department_name ?? 'Unassigned'},${r.total}`)
            lines.push('visit,appointment_id,patient_name,patient_cnic,center,hospital,department,token,status,date')
            for (const v of data.patient_visits) {
              lines.push(
                `visit,${v.appointment_id},"${v.patient_name}","${v.patient_cnic}","${v.center_name}","${v.hospital_name}","${v.department_name ?? ''}",${v.token_number},${v.status},${v.appointment_date}`,
              )
            }
            const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `opd-report-${data.date}.csv`
            a.click()
            URL.revokeObjectURL(url)
          }}
        >
          Export Daily CSV
        </button>
        <button
          type="button"
          className={ui.btnSecondary}
          onClick={async () => {
            const q = new URLSearchParams()
            q.set('date', date)
            if (centerId !== '') q.set('center_id', String(centerId))
            if (departmentId !== '') q.set('department_id', String(departmentId))
            const token = getToken()
            const res = await fetch(`${(import.meta.env.VITE_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')}/api/v1/reports/daily.csv?${q.toString()}`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `opd-daily-${date}.csv`
            a.click()
            URL.revokeObjectURL(url)
          }}
        >
          Export Daily CSV (Server)
        </button>
        <button
          type="button"
          className={ui.btnSecondary}
          onClick={() => {
            if (!data) return
            const w = window.open('', '_blank', 'width=900,height=1000')
            if (!w) return
            const statusRows = Object.entries(data.by_status)
              .map(([k, v]) => `<tr><td>${k}</td><td style="text-align:right">${v}</td></tr>`)
              .join('')
            w.document.write(`
              <html><head><title>Daily OPD Report ${data.date}</title></head>
              <body style="font-family:Arial;padding:24px">
                <h2>Daily OPD Report</h2>
                <p><strong>Date:</strong> ${data.date}</p>
                <p><strong>Total:</strong> ${data.total}</p>
                <h3>Status Summary</h3>
                <table border="1" cellspacing="0" cellpadding="8" style="border-collapse:collapse;min-width:360px">
                  <thead><tr><th>Status</th><th>Total</th></tr></thead><tbody>${statusRows}</tbody>
                </table>
              </body></html>
            `)
            w.document.close()
            w.focus()
            w.print()
          }}
        >
          Print Daily
        </button>
      </div>

      <div className={`${ui.card} flex flex-wrap items-end gap-3`}>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          From
          <input type="date" className={ui.input} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          To
          <input type="date" className={ui.input} value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <button type="button" className={ui.btnPrimary} onClick={() => void loadRange()}>
          Load Range
        </button>
        <button
          type="button"
          className={ui.btnSecondary}
          onClick={async () => {
            const q = new URLSearchParams()
            q.set('from_date', fromDate)
            q.set('to_date', toDate)
            if (centerId !== '') q.set('center_id', String(centerId))
            if (departmentId !== '') q.set('department_id', String(departmentId))
            const token = getToken()
            const res = await fetch(`${(import.meta.env.VITE_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')}/api/v1/reports/range.csv?${q.toString()}`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `opd-range-${fromDate}-to-${toDate}.csv`
            a.click()
            URL.revokeObjectURL(url)
          }}
        >
          Export Range CSV
        </button>
      </div>

      {err ? <div className={ui.alertError}>{err}</div> : null}

      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className={ui.cardMuted}>
              <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900">{data.total}</p>
            </div>
            {Object.entries(data.by_status).map(([status, total]) => (
              <div key={status} className={ui.cardMuted}>
                <p className="text-xs uppercase tracking-wide text-slate-500">{status.replace('_', ' ')}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{total}</p>
              </div>
            ))}
          </div>

          <div className={ui.tableWrap}>
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className={ui.th}>Center</th>
                  <th className={ui.th}>Hospital</th>
                  <th className={`${ui.th} text-right`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.by_center.map((r) => (
                  <tr key={r.center_id} className={ui.trHover}>
                    <td className={ui.td}>{r.center_name}</td>
                    <td className={ui.td}>{r.hospital_name}</td>
                    <td className={`${ui.td} text-right font-semibold`}>{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={ui.tableWrap}>
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className={ui.th}>Department</th>
                  <th className={`${ui.th} text-right`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.by_department.map((r) => (
                  <tr key={String(r.department_id)} className={ui.trHover}>
                    <td className={ui.td}>{r.department_name ?? 'Unassigned'}</td>
                    <td className={`${ui.td} text-right font-semibold`}>{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={ui.tableWrap}>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                  <tr>
                    <th className={ui.th}>ID</th>
                    <th className={ui.th}>Token</th>
                    <th className={ui.th}>Patient</th>
                    <th className={ui.th}>CNIC</th>
                    <th className={ui.th}>Center</th>
                    <th className={ui.th}>Department</th>
                    <th className={ui.th}>Date</th>
                    <th className={ui.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.patient_visits.map((v) => (
                    <tr key={v.appointment_id} className={ui.trHover}>
                      <td className={ui.td}>{v.appointment_id}</td>
                      <td className={`${ui.td} font-mono font-semibold`}>{v.token_number}</td>
                      <td className={ui.td}>
                        <div className="font-medium text-slate-900">{v.patient_name}</div>
                        <div className="text-xs text-slate-500">ID {v.patient_id}</div>
                      </td>
                      <td className={`${ui.td} font-mono text-xs`}>{v.patient_cnic}</td>
                      <td className={ui.td}>
                        <div className="font-medium text-slate-900">{v.center_name}</div>
                        <div className="text-xs text-slate-500">{v.hospital_name}</div>
                      </td>
                      <td className={ui.td}>{v.department_name ?? '—'}</td>
                      <td className={ui.td}>{v.appointment_date}</td>
                      <td className={ui.td}>
                        <span className={ui.badge}>{v.status.replace('_', ' ')}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.patient_visits.length ? (
              <p className={`px-4 py-8 text-center text-sm ${ui.muted}`}>No patient visits for this filter.</p>
            ) : null}
          </div>
        </>
      ) : null}

      {rangeData ? (
        <div className={ui.tableWrap}>
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className={ui.th}>Date</th>
                <th className={ui.th}>Status</th>
                <th className={`${ui.th} text-right`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rangeData.by_day_status.map((r, idx) => (
                <tr key={`${r.report_date}-${r.status}-${idx}`} className={ui.trHover}>
                  <td className={ui.td}>{r.report_date}</td>
                  <td className={ui.td}>{r.status.replace('_', ' ')}</td>
                  <td className={`${ui.td} text-right font-semibold`}>{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
