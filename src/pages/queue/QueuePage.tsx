import { useEffect, useState } from 'react'
import { RefreshCw, Layers, Send, Eye } from 'lucide-react'
import { api } from '../../api/client'
import { todayLocalYmd } from '../../utils/dateYmd'
import { useAuth } from '../../context/AuthContext'
import { ui } from '../../ui/classes'

type Appt = {
  id: number
  token_number: number
  patient_id: number
  status: string
  patient_name?: string | null
  patient_cnic?: string | null
  department_name?: string | null
  location?: string | null
}
type Center = { id: number; name: string; hospital_name?: string }
type Batch = {
  id: number
  batch_index: number
  status: string
  center_id: number
  appointment_date: string
  item_count?: number
}

type BatchDetail = {
  batch: Batch
  appointments: Appt[]
}

function today() {
  return todayLocalYmd()
}

export function QueuePage() {
  const { can } = useAuth()
  const [centers, setCenters] = useState<Center[]>([])
  const [centerId, setCenterId] = useState(1)
  const [date, setDate] = useState(today)
  const [ready, setReady] = useState<Appt[]>([])
  const [notHere, setNotHere] = useState<Appt[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [selectedBatch, setSelectedBatch] = useState<BatchDetail | null>(null)
  const [batchSize, setBatchSize] = useState(20)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    api<Center[]>('/centers')
      .then((c) => {
        setCenters(c)
        if (c[0]) setCenterId(c[0].id)
      })
      .catch(() => {})
  }, [])

  async function refresh() {
    setMsg(null)
    try {
      const q = `?center_id=${centerId}&date=${encodeURIComponent(date)}`
      const [r, n, b] = await Promise.all([
        api<Appt[]>(`/queue/ready${q}`),
        api<Appt[]>(`/queue/not-arrived${q}`),
        api<Batch[]>(`/queue/batches${q}`),
      ])
      setReady(r)
      setNotHere(n)
      setBatches(b)
      setSelectedBatch(null)
    } catch (e) {
      setMsg(String(e))
    }
  }

  useEffect(() => {
    if (can('queue.read')) void refresh()
  }, [centerId, date])

  if (!can('queue.read')) {
    return <p className={ui.muted}>No queue permission.</p>
  }

  return (
    <div className={`space-y-8 ${ui.page}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={ui.h1}>Queue & batches</h1>
          <p className={`mt-1 text-sm ${ui.muted}`}>
            Batches may include only the <strong>ready</strong> pool (pre-screening / vitals completed in Waiting area).
            Patients who are only <code className="rounded bg-slate-100 px-1 text-xs">registered</code> do not appear here
            — they must complete vitals first.
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} className={ui.btnSecondary}>
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
      </div>

      {msg ? <div className={ui.alertError}>{msg}</div> : null}

      <div className={`rounded-xl border border-cyan-100 bg-cyan-50/80 px-4 py-3 text-xs text-slate-700`}>
        <p className="font-semibold text-cyan-900">HIS queue pools (status mapping)</p>
        <ul className={`mt-2 list-inside list-disc space-y-1 ${ui.muted}`}>
          <li>
            <strong>Token queue</strong> — <code className="rounded bg-white px-1">booked</code> (token issued; not yet at
            registration desk). Shown here as &quot;Not arrived yet&quot;.
          </li>
          <li>
            <strong>Checked-in (registered)</strong> — <code className="rounded bg-white px-1">registered</code> (W number
            assigned). Waiting on pre-assessment — use the <strong>Pre-assessment</strong> page.
          </li>
          <li>
            <strong>Verified / ready pool</strong> — <code className="rounded bg-white px-1">ready</code> (waiting-area
            pre-screening saved). Coordinator builds batches <strong>only</strong> from this list — never from{' '}
            <code className="rounded bg-white px-1">registered</code> alone.
          </li>
          <li>
            <code className="rounded bg-white px-1">batched</code> → <code className="rounded bg-white px-1">dispatched</code>{' '}
            → doctor consultation → reception <code className="rounded bg-white px-1">completed</code>.
          </li>
        </ul>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={ui.card}>
          <h2 className="text-base font-semibold text-slate-900">Ready for batch</h2>
          <p className={`mt-1 text-xs ${ui.muted}`}>Pre-assessment complete; coordinator pulls FIFO by token.</p>
          <div className={`${ui.tableWrap} mt-4 border-slate-200`}>
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className={ui.th}>Token</th>
                  <th className={ui.th}>Patient</th>
                </tr>
              </thead>
              <tbody>
                {ready.map((a) => (
                  <tr key={a.id} className={ui.trHover}>
                    <td className={`${ui.td} font-mono font-semibold`}>{a.token_number}</td>
                    <td className={ui.td}>
                      <div className="font-medium text-slate-900">{a.patient_name ?? `Patient #${a.patient_id}`}</div>
                      <div className="text-xs font-mono text-slate-500">{a.patient_cnic ?? '—'}</div>
                      <div className="text-xs text-slate-500">
                        {a.department_name ?? 'No dept'}
                        {a.location ? ` · ${a.location}` : ''}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!ready.length ? <p className={`px-4 py-6 text-center text-sm ${ui.muted}`}>Empty</p> : null}
          </div>
        </section>

        <section className={ui.card}>
          <h2 className="text-base font-semibold text-slate-900">Not arrived (still booked)</h2>
          <div className={`${ui.tableWrap} mt-4 border-slate-200`}>
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className={ui.th}>Token</th>
                  <th className={ui.th}>Patient</th>
                </tr>
              </thead>
              <tbody>
                {notHere.map((a) => (
                  <tr key={a.id} className={ui.trHover}>
                    <td className={`${ui.td} font-mono font-semibold`}>{a.token_number}</td>
                    <td className={ui.td}>
                      <div className="font-medium text-slate-900">{a.patient_name ?? `Patient #${a.patient_id}`}</div>
                      <div className="text-xs font-mono text-slate-500">{a.patient_cnic ?? '—'}</div>
                      <div className="text-xs text-slate-500">
                        {a.department_name ?? 'No dept'}
                        {a.location ? ` · ${a.location}` : ''}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!notHere.length ? <p className={`px-4 py-6 text-center text-sm ${ui.muted}`}>None</p> : null}
          </div>
        </section>
      </div>

      {can('queue.manage') ? (
        <section className={ui.card}>
          <div className="flex items-center gap-2 text-slate-900">
            <Layers className="size-5 text-amber-600" strokeWidth={2} aria-hidden />
            <h2 className="text-base font-semibold">Batch actions</h2>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Batch size
              <input
                type="number"
                min={1}
                max={200}
                className={`${ui.input} w-24`}
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              className={`${ui.btnPrimary} bg-amber-600 hover:bg-amber-700 focus-visible:outline-amber-600`}
              onClick={async () => {
                try {
                  await api('/queue/batches', {
                    method: 'POST',
                    body: JSON.stringify({
                      center_id: centerId,
                      appointment_date: date,
                      size: batchSize,
                    }),
                  })
                  await refresh()
                } catch (e) {
                  setMsg(String(e))
                }
              }}
            >
              Create batch from FIFO
            </button>
          </div>

          <div className={`${ui.tableWrap} mt-6`}>
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className={ui.th}>Batch</th>
                  <th className={ui.th}>Items</th>
                  <th className={ui.th}>Status</th>
                  <th className={ui.th}>Date</th>
                  <th className={`${ui.th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className={ui.trHover}>
                    <td className={`${ui.td} font-medium`}>#{b.batch_index}</td>
                    <td className={ui.td}>{b.item_count ?? 0}</td>
                    <td className={ui.td}>
                      <span className={ui.badge}>{b.status}</span>
                    </td>
                    <td className={`${ui.td} text-slate-600`}>{String(b.appointment_date).slice(0, 10)}</td>
                    <td className={`${ui.td} text-right`}>
                      <button
                        type="button"
                        className={ui.btnSecondary}
                        onClick={async () => {
                          try {
                            const detail = await api<BatchDetail>(`/queue/batches/${b.id}`)
                            setSelectedBatch(detail)
                          } catch (e) {
                            setMsg(String(e))
                          }
                        }}
                      >
                        <Eye className="size-3.5" strokeWidth={2} aria-hidden />
                        Details
                      </button>
                      {b.status === 'draft' ? (
                        <button
                          type="button"
                          className={`${ui.btnPrimary} ml-2`}
                          onClick={async () => {
                            try {
                              await api(`/queue/batches/${b.id}/dispatch`, { method: 'POST' })
                              await refresh()
                            } catch (e) {
                              setMsg(String(e))
                            }
                          }}
                        >
                          <Send className="size-3.5" strokeWidth={2} aria-hidden />
                          Dispatch
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!batches.length ? <p className={`px-4 py-6 text-center text-sm ${ui.muted}`}>No batches for this day.</p> : null}
          </div>
        </section>
      ) : null}

      {selectedBatch ? (
        <section className={ui.card}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">
              Batch #{selectedBatch.batch.batch_index} details
            </h2>
            <span className={ui.badge}>{selectedBatch.appointments.length} patients</span>
          </div>
          <p className={`mt-1 text-xs ${ui.muted}`}>Included tickets and patient identity details.</p>
          <div className={`${ui.tableWrap} mt-4`}>
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className={ui.th}>Token</th>
                  <th className={ui.th}>Patient</th>
                  <th className={ui.th}>CNIC</th>
                  <th className={ui.th}>Department/Location</th>
                  <th className={ui.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {selectedBatch.appointments.map((a) => (
                  <tr key={a.id} className={ui.trHover}>
                    <td className={`${ui.td} font-mono font-semibold`}>{a.token_number}</td>
                    <td className={ui.td}>{a.patient_name ?? `Patient #${a.patient_id}`}</td>
                    <td className={`${ui.td} font-mono text-xs`}>{a.patient_cnic ?? '—'}</td>
                    <td className={ui.td}>
                      {a.department_name ?? '—'}
                      {a.location ? ` · ${a.location}` : ''}
                    </td>
                    <td className={ui.td}>
                      <span className={ui.badge}>{a.status.replace('_', ' ')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!selectedBatch.appointments.length ? (
              <p className={`px-4 py-6 text-center text-sm ${ui.muted}`}>No patients in this batch.</p>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  )
}
