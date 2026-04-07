import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Layers, Send, Eye, Flag, ArrowLeftRight } from 'lucide-react'
import { SpeechInput, SpeechTextarea } from '../../components/speech'
import { api } from '../../api/client'
import { todayLocalYmd } from '../../utils/dateYmd'
import { useAuth } from '../../context/AuthContext'
import { toastError, toastSuccess } from '../../lib/toast'
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
  priority_level?: string | null
  priority_notes?: string | null
  priority_flagged_at?: string | null
  priority_flagged_by_username?: string | null
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

function priorityBadge(level?: string | null) {
  if (level === 'critical_immediate') return 'See immediately'
  if (level === 'critical_today') return 'See today'
  if (level === 'not_attending_today') return 'Not attending today'
  return null
}

function formatFlaggedAt(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

type PhysicianTriageLevel = 'critical_immediate' | 'critical_today' | 'not_attending_today'

function triageLevelForModal(a: Appt): PhysicianTriageLevel {
  if (a.priority_level === 'critical_today') return 'critical_today'
  if (a.priority_level === 'not_attending_today') return 'not_attending_today'
  return 'critical_immediate'
}

export function QueuePage() {
  const { can } = useAuth()
  const [centers, setCenters] = useState<Center[]>([])
  const [centerId, setCenterId] = useState(1)
  const [date, setDate] = useState(today)
  const [ready, setReady] = useState<Appt[]>([])
  const [notHere, setNotHere] = useState<Appt[]>([])
  const [flaggedPool, setFlaggedPool] = useState<Appt[]>([])
  const [notAttendingPool, setNotAttendingPool] = useState<Appt[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [selectedBatch, setSelectedBatch] = useState<BatchDetail | null>(null)
  const [batchSize, setBatchSize] = useState(20)
  const [priorityModal, setPriorityModal] = useState<Appt | null>(null)
  const [priorityLevel, setPriorityLevel] = useState<PhysicianTriageLevel>('critical_immediate')
  const [priorityNotes, setPriorityNotes] = useState('')
  const [swapRemove, setSwapRemove] = useState<Appt | null>(null)
  const [swapAddId, setSwapAddId] = useState<number | ''>('')

  const loadQueues = useCallback(
    async (notifyOk = false) => {
      const q = `?center_id=${centerId}&date=${encodeURIComponent(date)}`
      const flaggedReq = can('queue.read')
        ? api<Appt[]>(`/queue/flagged-pool${q}`)
        : Promise.resolve([] as Appt[])
      const notTodayReq = can('queue.read')
        ? api<Appt[]>(`/queue/not-attending-today${q}`)
        : Promise.resolve([] as Appt[])
      const [r, n, b, f, nt] = await Promise.all([
        api<Appt[]>(`/queue/ready${q}`),
        api<Appt[]>(`/queue/not-arrived${q}`),
        api<Batch[]>(`/queue/batches${q}`),
        flaggedReq,
        notTodayReq,
      ])
      setReady(r)
      setNotHere(n)
      setBatches(b)
      setFlaggedPool(f)
      setNotAttendingPool(nt)
      if (notifyOk) toastSuccess('Queue refreshed')
    },
    [centerId, date, can],
  )

  const refreshAll = useCallback(
    async (notifyOk = false) => {
      try {
        await loadQueues(notifyOk)
        setSelectedBatch(null)
      } catch (e) {
        toastError(e, 'Failed to refresh queue')
      }
    },
    [loadQueues],
  )

  const reloadSelectedBatch = useCallback(async (batchId: number) => {
    try {
      const d = await api<BatchDetail>(`/queue/batches/${batchId}`)
      setSelectedBatch(d)
    } catch (e) {
      toastError(e, 'Could not reload batch')
      setSelectedBatch(null)
    }
  }, [])

  useEffect(() => {
    api<Center[]>('/centers')
      .then((c) => {
        setCenters(c)
        if (c[0]) setCenterId(c[0].id)
      })
      .catch((e) => toastError(e, 'Could not load centers'))
  }, [])

  useEffect(() => {
    if (can('queue.read')) {
      void loadQueues().catch((e) => toastError(e, 'Failed to refresh queue'))
      setSelectedBatch(null)
    }
  }, [centerId, date, can, loadQueues])

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
            Doctors with <strong>appointments.priority_flag</strong> set triage on the ready pool; MSO can{' '}
            <strong>replace</strong> a draft batch seat only with patients flagged <strong>see immediately</strong> or{' '}
            <strong>see today</strong> (not &quot;not attending today&quot;).
          </p>
        </div>
        <button type="button" onClick={() => void refreshAll(true)} className={ui.btnSecondary}>
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
          <SpeechInput type="date" className={ui.input} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>


      {flaggedPool.length > 0 ? (
        <section className={ui.card}>
          <h2 className="text-base font-semibold text-slate-900">Batch swap pool (see immediately / see today)</h2>
          <p className={`mt-1 text-xs ${ui.muted}`}>
            Physician-flagged; pick one when replacing a draft batch slot. Each row shows who set the flag and when.
          </p>
          <div className={`${ui.tableWrap} mt-4 border-slate-200`}>
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className={ui.th}>Token</th>
                  <th className={ui.th}>Triage</th>
                  <th className={ui.th}>Physician</th>
                  <th className={ui.th}>Flagged</th>
                  <th className={ui.th}>Patient</th>
                  <th className={ui.th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {flaggedPool.map((a) => (
                  <tr key={a.id} className={ui.trHover}>
                    <td className={`${ui.td} font-mono font-semibold`}>{a.token_number}</td>
                    <td className={ui.td}>
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                        {priorityBadge(a.priority_level) ?? a.priority_level}
                      </span>
                    </td>
                    <td className={`${ui.td} text-xs`}>{a.priority_flagged_by_username ?? '—'}</td>
                    <td className={`${ui.td} text-xs text-slate-600`}>{formatFlaggedAt(a.priority_flagged_at)}</td>
                    <td className={ui.td}>
                      <div className="font-medium text-slate-900">{a.patient_name ?? `Patient #${a.patient_id}`}</div>
                      <div className="text-xs font-mono text-slate-500">{a.patient_cnic ?? '—'}</div>
                    </td>
                    <td className={`${ui.td} max-w-xs text-xs text-slate-600`}>{a.priority_notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {notAttendingPool.length > 0 ? (
        <section className={`${ui.card} border-slate-300`}>
          <h2 className="text-base font-semibold text-slate-900">Not attending today (physician-marked)</h2>
          <p className={`mt-1 text-xs ${ui.muted}`}>
            These stays are still <code className="rounded bg-slate-100 px-1">ready</code> for data purposes; they are{' '}
            <strong>not</strong> eligible for batch slot swap. Coordinate follow-up outside the urgent pool.
          </p>
          <div className={`${ui.tableWrap} mt-4 border-slate-200`}>
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className={ui.th}>Token</th>
                  <th className={ui.th}>Physician</th>
                  <th className={ui.th}>Flagged</th>
                  <th className={ui.th}>Patient</th>
                  <th className={ui.th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {notAttendingPool.map((a) => (
                  <tr key={a.id} className={ui.trHover}>
                    <td className={`${ui.td} font-mono font-semibold`}>{a.token_number}</td>
                    <td className={`${ui.td} text-xs`}>{a.priority_flagged_by_username ?? '—'}</td>
                    <td className={`${ui.td} text-xs text-slate-600`}>{formatFlaggedAt(a.priority_flagged_at)}</td>
                    <td className={ui.td}>
                      <div className="font-medium text-slate-900">{a.patient_name ?? `Patient #${a.patient_id}`}</div>
                      <div className="text-xs font-mono text-slate-500">{a.patient_cnic ?? '—'}</div>
                    </td>
                    <td className={`${ui.td} max-w-xs text-xs text-slate-600`}>{a.priority_notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={ui.card}>
          <h2 className="text-base font-semibold text-slate-900">Ready for batch</h2>
          <p className={`mt-1 text-xs ${ui.muted}`}>Pre-assessment complete; coordinator pulls FIFO by token.</p>
          <div className={`${ui.tableWrap} mt-4 border-slate-200`}>
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className={ui.th}>Token</th>
                  <th className={ui.th}>Triage</th>
                  <th className={ui.th}>Physician</th>
                  <th className={ui.th}>Patient</th>
                  {can('appointments.priority_flag') ? <th className={`${ui.th} text-right`}>Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {ready.map((a) => (
                  <tr key={a.id} className={ui.trHover}>
                    <td className={`${ui.td} font-mono font-semibold`}>{a.token_number}</td>
                    <td className={ui.td}>
                      {priorityBadge(a.priority_level) ? (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                          {priorityBadge(a.priority_level)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className={`${ui.td} text-xs text-slate-600`}>
                      {a.priority_level && a.priority_level !== 'normal' ? (
                        <>
                          <div>{a.priority_flagged_by_username ?? '—'}</div>
                          <div className="text-slate-400">{formatFlaggedAt(a.priority_flagged_at)}</div>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className={ui.td}>
                      <div className="font-medium text-slate-900">{a.patient_name ?? `Patient #${a.patient_id}`}</div>
                      <div className="text-xs font-mono text-slate-500">{a.patient_cnic ?? '—'}</div>
                      <div className="text-xs text-slate-500">
                        {a.department_name ?? 'No dept'}
                        {a.location ? ` · ${a.location}` : ''}
                      </div>
                    </td>
                    {can('appointments.priority_flag') ? (
                      <td className={`${ui.td} text-right`}>
                        <button
                          type="button"
                          className={ui.btnSecondary}
                          onClick={() => {
                            setPriorityModal(a)
                            setPriorityLevel(triageLevelForModal(a))
                            setPriorityNotes(a.priority_notes ?? '')
                          }}
                        >
                          <Flag className="size-3.5" strokeWidth={2} aria-hidden />
                          {a.priority_level && a.priority_level !== 'normal' ? 'Edit / clear' : 'Physician triage'}
                        </button>
                      </td>
                    ) : null}
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
          <p className={`mt-2 text-xs ${ui.muted}`}>
            Pulls from the ready pool in token order. If a <strong>draft</strong> batch for this day already has free
            seats (below the batch size), new patients are added there first; a <strong>new</strong> draft is only created
            when no draft has room or the pool still has overflow after topping up.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Batch size
              <SpeechInput
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
                  await refreshAll()
                  toastSuccess('Ready patients assigned (draft topped up or new batch)')
                } catch (e) {
                  toastError(e, 'Could not create batch')
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
                            toastError(e, 'Could not load batch details')
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
                              await refreshAll()
                              toastSuccess('Batch dispatched')
                            } catch (e) {
                              toastError(e, 'Could not dispatch batch')
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
          <p className={`mt-1 text-xs ${ui.muted}`}>
            {selectedBatch.batch.status === 'draft' && can('queue.manage')
              ? 'Draft: use Replace slot to swap a token for a flagged critical patient from the ready pool.'
              : 'Included tickets and patient identity details.'}
          </p>
          <div className={`${ui.tableWrap} mt-4`}>
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className={ui.th}>Token</th>
                  <th className={ui.th}>Patient</th>
                  <th className={ui.th}>CNIC</th>
                  <th className={ui.th}>Department/Location</th>
                  <th className={ui.th}>Status</th>
                  {selectedBatch.batch.status === 'draft' && can('queue.manage') ? (
                    <th className={`${ui.th} text-right`}>MSO</th>
                  ) : null}
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
                    {selectedBatch.batch.status === 'draft' && can('queue.manage') ? (
                      <td className={`${ui.td} text-right`}>
                        <button
                          type="button"
                          className={ui.btnSecondary}
                          onClick={() => {
                            setSwapRemove(a)
                            setSwapAddId(flaggedPool[0]?.id ?? '')
                          }}
                        >
                          <ArrowLeftRight className="size-3.5" strokeWidth={2} aria-hidden />
                          Replace slot
                        </button>
                      </td>
                    ) : null}
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

      {priorityModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="priority-dialog-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 id="priority-dialog-title" className="text-lg font-semibold text-slate-900">
              Physician triage — token {priorityModal.token_number}
            </h2>
            <p className={`mt-1 text-sm ${ui.muted}`}>{priorityModal.patient_name ?? `Patient #${priorityModal.patient_id}`}</p>
            <p className={`mt-2 text-xs ${ui.muted}`}>
              Your account is stored as the flagging physician. &quot;See immediately&quot; and &quot;See today&quot; appear in
              the MSO batch-swap pool; &quot;Not attending today&quot; is recorded for coordination only.
            </p>
            <div className="mt-4 space-y-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Triage status
                <select
                  className={ui.select}
                  value={priorityLevel}
                  onChange={(e) => setPriorityLevel(e.target.value as PhysicianTriageLevel)}
                >
                  <option value="critical_immediate">See immediately (urgent — batch swap eligible)</option>
                  <option value="critical_today">See today (still urgent — batch swap eligible)</option>
                  <option value="not_attending_today">Not attending today (logged — not batch swap eligible)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Notes (visible to queue staff)
                <SpeechTextarea
                  className={ui.input}
                  rows={3}
                  value={priorityNotes}
                  onChange={(e) => setPriorityNotes(e.target.value)}
                  placeholder="Clinical reason / instructions"
                />
              </label>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" className={ui.btnSecondary} onClick={() => setPriorityModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={ui.btnSecondary}
                onClick={async () => {
                  try {
                    await api(`/appointments/${priorityModal.id}/priority`, {
                      method: 'PATCH',
                      body: JSON.stringify({ priority_level: 'normal', priority_notes: null }),
                    })
                    setPriorityModal(null)
                    await loadQueues()
                    toastSuccess('Priority cleared')
                  } catch (e) {
                    toastError(e, 'Could not clear flag')
                  }
                }}
              >
                Clear flag
              </button>
              <button
                type="button"
                className={ui.btnPrimary}
                onClick={async () => {
                  try {
                    await api(`/appointments/${priorityModal.id}/priority`, {
                      method: 'PATCH',
                      body: JSON.stringify({
                        priority_level: priorityLevel,
                        priority_notes: priorityNotes.trim() || null,
                      }),
                    })
                    setPriorityModal(null)
                    await loadQueues()
                    toastSuccess('Priority saved')
                  } catch (e) {
                    toastError(e, 'Could not save priority')
                  }
                }}
              >
                Save flag
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {swapRemove && selectedBatch ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="swap-dialog-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 id="swap-dialog-title" className="text-lg font-semibold text-slate-900">
              Replace batch slot?
            </h2>
            <p className={`mt-2 text-sm ${ui.muted}`}>
              Remove token <strong>{swapRemove.token_number}</strong> from batch #{selectedBatch.batch.batch_index} (they
              return to the <strong>ready</strong> pool) and insert a <strong>flagged critical</strong> patient in that
              seat.
            </p>
            <label className="mt-4 flex flex-col gap-1 text-xs font-medium text-slate-600">
              Flagged patient to add
              <select
                className={ui.select}
                value={swapAddId === '' ? '' : String(swapAddId)}
                onChange={(e) => setSwapAddId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">— Select —</option>
                {flaggedPool.map((a) => (
                  <option key={a.id} value={a.id}>
                    Token {a.token_number} — {priorityBadge(a.priority_level)} — {a.patient_name ?? `#${a.patient_id}`}
                  </option>
                ))}
              </select>
            </label>
            {!flaggedPool.length ? (
              <p className="mt-2 text-xs text-amber-800">No flagged patients in the ready pool for this day.</p>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className={ui.btnSecondary}
                onClick={() => {
                  setSwapRemove(null)
                  setSwapAddId('')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={ui.btnPrimary}
                disabled={swapAddId === ''}
                onClick={async () => {
                  if (swapAddId === '') return
                  try {
                    await api(`/queue/batches/${selectedBatch.batch.id}/swap`, {
                      method: 'POST',
                      body: JSON.stringify({
                        remove_appointment_id: swapRemove.id,
                        add_appointment_id: swapAddId,
                      }),
                    })
                    setSwapRemove(null)
                    setSwapAddId('')
                    await loadQueues()
                    await reloadSelectedBatch(selectedBatch.batch.id)
                    toastSuccess('Batch slot replaced')
                  } catch (e) {
                    toastError(e, 'Swap failed')
                  }
                }}
              >
                Confirm swap
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

