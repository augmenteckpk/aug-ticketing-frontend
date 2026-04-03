import { useEffect, useState } from 'react'
import { FlaskConical, RefreshCw } from 'lucide-react'
import { api } from '../../api/client'
import { todayLocalYmd } from '../../utils/dateYmd'
import { useAuth } from '../../context/AuthContext'
import { ui } from '../../ui/classes'

type WorklistRow = {
  order_id: number
  order_status: string
  test_code: string | null
  order_notes: string | null
  appointment_id: number
  token_number: number
  w_number: string | null
  appointment_status: string
  appointment_date: string
  center_id: number
  first_name: string | null
  last_name: string | null
  cnic: string | null
}

type Center = { id: number; name: string; hospital_name?: string }

function today() {
  return todayLocalYmd()
}

export function LaboratoryPage() {
  const { can } = useAuth()
  const [centers, setCenters] = useState<Center[]>([])
  const [centerId, setCenterId] = useState(1)
  const [date, setDate] = useState(today)
  const [pendingOnly, setPendingOnly] = useState(true)
  const [rows, setRows] = useState<WorklistRow[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [uploadOrderId, setUploadOrderId] = useState<number | null>(null)
  const [summary, setSummary] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<Center[]>('/centers')
      .then((c) => {
        setCenters(c)
        if (c[0]) setCenterId(c[0].id)
      })
      .catch(() => {})
  }, [])

  async function load() {
    setMsg(null)
    const q = new URLSearchParams({
      center_id: String(centerId),
      date,
      ...(pendingOnly ? { pending_only: 'true' } : {}),
    })
    const list = await api<WorklistRow[]>(`/lab/worklist?${q.toString()}`)
    setRows(list)
  }

  useEffect(() => {
    if (can('lab.read')) void load().catch((e) => setMsg(String(e)))
  }, [centerId, date, pendingOnly, can])

  async function submitResult(e: React.FormEvent) {
    e.preventDefault()
    if (uploadOrderId == null || !can('lab.manage')) return
    setBusy(true)
    setMsg(null)
    try {
      await api(`/appointments/lab-orders/${uploadOrderId}/result`, {
        method: 'PATCH',
        body: JSON.stringify({
          summary: summary.trim() || null,
          details: details.trim() || null,
        }),
      })
      setUploadOrderId(null)
      setSummary('')
      setDetails('')
      setMsg('Result uploaded. Visible to doctors and staff — not on the patient mobile app.')
      await load()
    } catch (e) {
      setMsg(String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!can('lab.read')) {
    return <p className={ui.muted}>No laboratory permission.</p>
  }

  return (
    <div className={`space-y-8 ${ui.page}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-700">
            <FlaskConical className="size-7" strokeWidth={2} aria-hidden />
          </div>
          <h1 className={`mt-2 ${ui.h1}`}>Laboratory worklist</h1>
          <p className={`mt-1 text-sm ${ui.muted}`}>
            Orders linked to OPD visits. Upload results for clinicians; patients do not receive lab reports in the mobile
            app.
          </p>
        </div>
        <button type="button" className={ui.btnSecondary} onClick={() => void load().catch((e) => setMsg(String(e)))}>
          <RefreshCw className="size-4" strokeWidth={2} aria-hidden />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Center
          <select className={ui.select} value={centerId} onChange={(e) => setCenterId(Number(e.target.value))}>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.hospital_name} — {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Date
          <input type="date" className={ui.input} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            className="rounded border-slate-300"
            checked={pendingOnly}
            onChange={(e) => setPendingOnly(e.target.checked)}
          />
          Pending only
        </label>
      </div>

      {msg ? (
        <div className={msg.includes('uploaded') || msg.includes('Visible') ? ui.alertSuccess : ui.alertError}>{msg}</div>
      ) : null}

      <div className={ui.tableWrap}>
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              <th className={ui.th}>Order</th>
              <th className={ui.th}>Token</th>
              <th className={ui.th}>W #</th>
              <th className={ui.th}>Patient</th>
              <th className={ui.th}>Test</th>
              <th className={ui.th}>Status</th>
              {can('lab.manage') ? <th className={`${ui.th} text-right`}>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.order_id} className={ui.trHover}>
                <td className={ui.td}>#{r.order_id}</td>
                <td className={ui.td}>{r.token_number}</td>
                <td className={`${ui.td} font-mono text-xs`}>{r.w_number ?? '—'}</td>
                <td className={ui.td}>
                  {[r.first_name, r.last_name].filter(Boolean).join(' ') || '—'}
                  <div className="font-mono text-xs text-slate-500">{r.cnic ?? ''}</div>
                </td>
                <td className={ui.td}>{r.test_code ?? '—'}</td>
                <td className={`${ui.td} capitalize`}>{r.order_status}</td>
                {can('lab.manage') ? (
                  <td className={`${ui.td} text-right`}>
                    {r.order_status === 'ordered' ? (
                      <button
                        type="button"
                        className={`${ui.btnPrimary} py-1.5 text-xs`}
                        onClick={() => {
                          setUploadOrderId(r.order_id)
                          setSummary('')
                          setDetails('')
                          setMsg(null)
                        }}
                      >
                        Enter result
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">Done</span>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? (
          <p className={`px-4 py-8 text-center text-sm ${ui.muted}`}>No lab orders for this filter.</p>
        ) : null}
      </div>

      {uploadOrderId != null && can('lab.manage') ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setUploadOrderId(null)}
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl" role="dialog">
            <h2 className="text-lg font-semibold text-slate-900">Upload result — order #{uploadOrderId}</h2>
            <form className="mt-4 space-y-3" onSubmit={(e) => void submitResult(e)}>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Summary
                <input className={ui.input} value={summary} onChange={(e) => setSummary(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Details (optional)
                <textarea className={`${ui.input} min-h-[100px]`} value={details} onChange={(e) => setDetails(e.target.value)} />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className={ui.btnSecondary} onClick={() => setUploadOrderId(null)}>
                  Cancel
                </button>
                <button type="submit" className={ui.btnPrimary} disabled={busy}>
                  {busy ? 'Saving…' : 'Save result'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
