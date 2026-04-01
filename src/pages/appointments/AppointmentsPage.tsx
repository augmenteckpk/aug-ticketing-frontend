import { useEffect, useState } from 'react'
import { RefreshCw, CheckCircle } from 'lucide-react'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { ui } from '../../ui/classes'

type Appointment = {
  id: number
  patient_id: number
  center_id: number
  appointment_date: string
  token_number: number
  status: string
  patient_name?: string | null
  patient_cnic?: string | null
  center_name?: string | null
  center_city?: string | null
  hospital_name?: string | null
  department_name?: string | null
  location?: string | null
}

type Center = { id: number; name: string; city: string; hospital_name?: string }

function today() {
  return new Date().toISOString().slice(0, 10)
}

export function AppointmentsPage() {
  const { can } = useAuth()
  const [rows, setRows] = useState<Appointment[]>([])
  const [centers, setCenters] = useState<Center[]>([])
  const [centerId, setCenterId] = useState<number | ''>('')
  const [date, setDate] = useState(today)
  const [status, setStatus] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busyReceiptId, setBusyReceiptId] = useState<number | null>(null)
  const [busyCompleteId, setBusyCompleteId] = useState<number | null>(null)

  useEffect(() => {
    if (!can('centers.read')) return
    api<Center[]>('/centers').then(setCenters).catch(() => {})
  }, [can])

  async function load() {
    setMsg(null)
    try {
      const q = new URLSearchParams()
      if (centerId !== '') q.set('center_id', String(centerId))
      if (date) q.set('date', date)
      if (status) q.set('status', status)
      const list = await api<Appointment[]>(`/appointments?${q.toString()}`)
      setRows(list)
    } catch (e) {
      setMsg(String(e))
    }
  }

  useEffect(() => {
    if (can('appointments.read')) void load()
  }, [])

  if (!can('appointments.read')) {
    return <p className={ui.muted}>No permission.</p>
  }

  return (
    <div className={`space-y-8 ${ui.page}`}>
      <div>
        <h1 className={ui.h1}>Appointments</h1>
        <p className={`mt-1 text-sm ${ui.muted}`}>Filter by center, date, and status.</p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:flex-wrap md:items-end">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Center
          <select
            className={ui.select}
            value={centerId === '' ? '' : String(centerId)}
            onChange={(e) => setCenterId(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">All centers</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Date
          <input type="date" className={ui.input} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Status
          <select className={ui.select} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {['booked', 'checked_in', 'batched', 'dispatched', 'completed', 'skipped', 'cancelled'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void load()} className={ui.btnPrimary}>
          <RefreshCw className="size-4" strokeWidth={2} aria-hidden />
          Refresh
        </button>
      </div>

      {msg ? <div className={ui.alertError}>{msg}</div> : null}

      <div className={ui.tableWrap}>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead>
              <tr>
                <th className={ui.th}>ID</th>
                <th className={ui.th}>Token</th>
                <th className={ui.th}>Patient</th>
                <th className={ui.th}>CNIC</th>
                <th className={ui.th}>Center</th>
                <th className={ui.th}>Department</th>
                <th className={ui.th}>Location</th>
                <th className={ui.th}>Date</th>
                <th className={ui.th}>Status</th>
                {can('appointments.complete') ? <th className={`${ui.th} text-right`}>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={ui.trHover}>
                  <td className={ui.td}>{r.id}</td>
                  <td className={`${ui.td} font-mono font-medium text-slate-900`}>{r.token_number}</td>
                  <td className={ui.td}>
                    <div className="font-medium text-slate-900">{r.patient_name ?? `Patient #${r.patient_id}`}</div>
                    <div className="text-xs text-slate-500">ID {r.patient_id}</div>
                  </td>
                  <td className={`${ui.td} font-mono text-xs`}>{r.patient_cnic ?? '—'}</td>
                  <td className={ui.td}>
                    <div className="font-medium text-slate-900">{r.center_name ?? `Center #${r.center_id}`}</div>
                    <div className="text-xs text-slate-500">
                      {r.hospital_name ? `${r.hospital_name} · ` : ''}
                      {r.center_city ?? ''}
                    </div>
                  </td>
                  <td className={ui.td}>{r.department_name ?? '—'}</td>
                  <td className={ui.td}>{r.location ?? '—'}</td>
                  <td className={ui.td}>{String(r.appointment_date).slice(0, 10)}</td>
                  <td className={ui.td}>
                    <span className={ui.badge}>{r.status.replace(/_/g, ' ')}</span>
                  </td>
                  {can('appointments.complete') ? (
                    <td className={`${ui.td} text-right`}>
                      <button
                        type="button"
                        className={`${ui.btnSecondary} mr-2 py-1.5 text-xs`}
                        disabled={busyReceiptId === r.id}
                        onClick={async () => {
                          setMsg(null)
                          setBusyReceiptId(r.id)
                          try {
                            await api(`/appointments/${r.id}/receipt/generate`, { method: 'POST' })
                            const receipt = await api<{ receipt: { receipt_number: string } }>(`/appointments/${r.id}/receipt`)
                            const html = `
                              <html>
                              <head><title>OPD Receipt ${receipt.receipt.receipt_number}</title></head>
                              <body style="font-family:Arial;padding:24px">
                                <h2>OPD Ticket Receipt</h2>
                                <p><strong>Receipt #:</strong> ${receipt.receipt.receipt_number}</p>
                                <p><strong>Patient:</strong> ${r.patient_name ?? r.patient_id}</p>
                                <p><strong>CNIC:</strong> ${r.patient_cnic ?? 'N/A'}</p>
                                <p><strong>Center:</strong> ${r.center_name ?? r.center_id}</p>
                                <p><strong>Department:</strong> ${r.department_name ?? 'N/A'}</p>
                                <p><strong>Location:</strong> ${r.location ?? 'N/A'}</p>
                                <p><strong>Date:</strong> ${String(r.appointment_date).slice(0, 10)}</p>
                                <p><strong>Token:</strong> ${r.token_number}</p>
                              </body>
                              </html>
                            `
                            const w = window.open('', '_blank', 'width=700,height=900')
                            if (w) {
                              w.document.write(html)
                              w.document.close()
                              w.focus()
                              w.print()
                            } else {
                              window.alert(`Receipt generated: ${receipt.receipt.receipt_number}`)
                            }
                          } catch (e) {
                            setMsg(String(e))
                          } finally {
                            setBusyReceiptId(null)
                          }
                        }}
                      >
                        {busyReceiptId === r.id ? 'Preparing…' : 'Receipt'}
                      </button>
                      {r.status === 'dispatched' ? (
                        <button
                          type="button"
                          className={`${ui.btnPrimary} py-1.5 text-xs`}
                          disabled={busyCompleteId === r.id}
                          onClick={async () => {
                            setMsg(null)
                            setBusyCompleteId(r.id)
                            try {
                              await api(`/appointments/${r.id}/complete`, { method: 'POST' })
                              await load()
                            } catch (e) {
                              setMsg(String(e))
                            } finally {
                              setBusyCompleteId(null)
                            }
                          }}
                        >
                          <CheckCircle className="size-3.5" strokeWidth={2} aria-hidden />
                          {busyCompleteId === r.id ? 'Completing…' : 'Complete'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length ? <p className={`px-4 py-8 text-center text-sm ${ui.muted}`}>No appointments for this filter.</p> : null}
      </div>
    </div>
  )
}
