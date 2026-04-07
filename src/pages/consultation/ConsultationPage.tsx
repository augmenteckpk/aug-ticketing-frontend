import { useEffect, useState } from 'react'
import { RefreshCw, Stethoscope } from 'lucide-react'
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
  patient_name?: string | null
  patient_cnic?: string | null
  w_number?: string | null
  department_name?: string | null
  bp_systolic?: number | null
  bp_diastolic?: number | null
  weight_kg?: number | null
  height_cm?: number | null
  blood_sugar_mg_dl?: number | null
  symptoms?: string | null
  medical_history_notes?: string | null
  consultation_outcome?: string | null
  doctor_notes?: string | null
  follow_up_advised_date?: string | null
  status: string
}

type LabOrder = {
  id: number
  status: string
  test_code?: string | null
  notes?: string | null
  result?: { summary?: string | null; details?: string | null } | null
}

type Center = { id: number; name: string; hospital_name?: string }

function today() {
  return todayLocalYmd()
}

const OUTCOMES = [
  { value: '', label: '— Select —' },
  { value: 'medication_only', label: 'Medication only' },
  { value: 'lab_required', label: 'Lab tests required' },
  { value: 'follow_up', label: 'Follow-up appointment' },
  { value: 'admission', label: 'Admission to hospital' },
] as const

export function ConsultationPage() {
  const { can } = useAuth()
  const [centers, setCenters] = useState<Center[]>([])
  const [centerId, setCenterId] = useState(1)
  const [date, setDate] = useState(today)
  const [rows, setRows] = useState<Appt[]>([])
  const [sel, setSel] = useState<Appt | null>(null)
  const [outcome, setOutcome] = useState('')
  const [doctorNotes, setDoctorNotes] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [labOrders, setLabOrders] = useState<LabOrder[]>([])
  const [labTestCode, setLabTestCode] = useState('')
  const [labNotes, setLabNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [labBusy, setLabBusy] = useState(false)

  const canOrderLab = can('appointments.consult') || can('lab.manage')

  useEffect(() => {
    api<Center[]>('/centers')
      .then((c) => {
        setCenters(c)
        if (c[0]) setCenterId(c[0].id)
      })
      .catch((e) => toastError(e, 'Could not load centers'))
  }, [])

  async function load() {
    const q = new URLSearchParams({
      center_id: String(centerId),
      date,
      /** Dispatched = with doctor; completed = reception closed visit (still allow notes / review). */
      status: 'dispatched,completed',
    })
    const list = await api<Appt[]>(`/appointments?${q.toString()}`)
    setRows(list)
  }

  useEffect(() => {
    if (can('appointments.consult')) void load().catch((e) => toastError(e, 'Failed to load visits'))
  }, [centerId, date, can])

  async function loadLab(apptId: number) {
    try {
      const list = await api<LabOrder[]>(`/appointments/${apptId}/lab`)
      setLabOrders(list)
    } catch {
      setLabOrders([])
    }
  }

  function openRow(a: Appt) {
    setSel(a)
    setOutcome(a.consultation_outcome ?? '')
    setDoctorNotes(a.doctor_notes ?? '')
    setFollowUpDate(
      a.follow_up_advised_date ? String(a.follow_up_advised_date).slice(0, 10) : '',
    )
    setLabTestCode('')
    setLabNotes('')
    void loadLab(a.id)
  }

  async function saveConsultation(e: React.FormEvent) {
    e.preventDefault()
    if (!sel) return
    setBusy(true)
    try {
      await api(`/appointments/${sel.id}/consultation`, {
        method: 'PATCH',
        body: JSON.stringify({
          consultation_outcome: outcome === '' ? null : outcome,
          doctor_notes: doctorNotes.trim() || null,
          follow_up_advised_date:
            outcome === 'follow_up' ? followUpDate || null : null,
        }),
      })
      toastSuccess('Consultation record saved.')
      await load()
      const updated = await api<Appt>(`/appointments/${sel.id}`)
      setSel(updated)
      setOutcome(updated.consultation_outcome ?? '')
      setDoctorNotes(updated.doctor_notes ?? '')
      setFollowUpDate(
        updated.follow_up_advised_date ? String(updated.follow_up_advised_date).slice(0, 10) : '',
      )
    } catch (e) {
      toastError(e, 'Could not save consultation')
    } finally {
      setBusy(false)
    }
  }

  async function addLabOrder(e: React.FormEvent) {
    e.preventDefault()
    if (!sel || !canOrderLab) return
    setLabBusy(true)
    try {
      await api(`/appointments/${sel.id}/lab-orders`, {
        method: 'POST',
        body: JSON.stringify({
          test_code: labTestCode.trim() || null,
          notes: labNotes.trim() || null,
        }),
      })
      setLabTestCode('')
      setLabNotes('')
      await loadLab(sel.id)
      toastSuccess('Lab order created.')
    } catch (e) {
      toastError(e, 'Could not create lab order')
    } finally {
      setLabBusy(false)
    }
  }

  if (!can('appointments.consult')) {
    return <p className={ui.muted}>No consultation permission.</p>
  }

  return (
    <div className={`space-y-8 ${ui.page}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-red-700">
            <Stethoscope className="size-7" strokeWidth={2} aria-hidden />
          </div>
          <h1 className={`mt-2 ${ui.h1}`}>Consultation</h1>
          <p className={`mt-1 text-sm ${ui.muted}`}>
            <strong>Dispatched</strong> visits are active with the doctor. <strong>Completed</strong> visits already
            passed reception closing — they stay listed so you can review or add notes. Record outcome and clinical notes;
            order labs when needed. For <strong>follow-up</strong>, enter the <strong>advised date</strong> only.{' '}
            <strong>Reception must record a consultation outcome here before using “Complete” on Appointments.</strong>
          </p>
        </div>
        <button
          type="button"
          className={ui.btnSecondary}
          onClick={() =>
            void load()
              .then(() => toastSuccess('List refreshed'))
              .catch((e) => toastError(e, 'Failed to refresh'))
          }
        >
          <RefreshCw className="size-4" strokeWidth={2} aria-hidden />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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

      <div className={ui.tableWrap}>
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              <th className={ui.th}>Token</th>
              <th className={ui.th}>W #</th>
              <th className={ui.th}>Patient</th>
              <th className={ui.th}>CNIC</th>
              <th className={ui.th}>Department</th>
              <th className={ui.th}>Visit status</th>
              <th className={ui.th}>Outcome</th>
              <th className={ui.th}>F/U by</th>
              <th className={`${ui.th} text-right`}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={ui.trHover}>
                <td className={ui.td}>{r.token_number}</td>
                <td className={`${ui.td} font-mono text-xs`}>{r.w_number ?? '—'}</td>
                <td className={ui.td}>{r.patient_name ?? `Patient #${r.patient_id}`}</td>
                <td className={`${ui.td} font-mono text-xs`}>{r.patient_cnic ?? '—'}</td>
                <td className={ui.td}>{r.department_name ?? '—'}</td>
                <td className={`${ui.td} text-xs`}>
                  <span
                    className={
                      r.status === 'completed'
                        ? 'rounded bg-slate-200 px-1.5 py-0.5 text-slate-800'
                        : 'rounded bg-red-100 px-1.5 py-0.5 text-red-900'
                    }
                  >
                    {r.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className={`${ui.td} text-xs capitalize`}>
                  {r.consultation_outcome ? r.consultation_outcome.replace(/_/g, ' ') : '—'}
                </td>
                <td className={`${ui.td} font-mono text-xs`}>
                  {r.follow_up_advised_date ? String(r.follow_up_advised_date).slice(0, 10) : '—'}
                </td>
                <td className={`${ui.td} text-right`}>
                  <button type="button" className={`${ui.btnPrimary} py-1.5 text-xs`} onClick={() => openRow(r)}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? (
          <p className={`px-4 py-8 text-center text-sm ${ui.muted}`}>
            No dispatched or completed visits for this day. Create and dispatch a batch on the Queue page first.
          </p>
        ) : null}
      </div>

      {sel ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setSel(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            role="dialog"
          >
            <h2 className="text-lg font-semibold text-slate-900">
              Visit — token #{sel.token_number} · W {sel.w_number ?? '—'}
            </h2>
            <p className={`mt-1 text-xs ${ui.muted}`}>Pre-assessment snapshot (read-only)</p>
            <div className="mt-2 grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-700 sm:grid-cols-2">
              <div>
                BP: {sel.bp_systolic ?? '—'} / {sel.bp_diastolic ?? '—'}
              </div>
              <div>Weight: {sel.weight_kg ?? '—'} kg</div>
              <div>Height: {sel.height_cm ?? '—'} cm</div>
              <div>Sugar: {sel.blood_sugar_mg_dl ?? '—'} mg/dL</div>
              <div>Symptoms: {sel.symptoms ?? '—'}</div>
              <div className="sm:col-span-2">History: {sel.medical_history_notes ?? '—'}</div>
            </div>

            <form className="mt-4 space-y-3 border-t border-slate-100 pt-4" onSubmit={(e) => void saveConsultation(e)}>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Consultation outcome
                <select
                  className={ui.select}
                  value={outcome}
                  onChange={(e) => {
                    const v = e.target.value
                    setOutcome(v)
                    if (v !== 'follow_up') setFollowUpDate('')
                  }}
                >
                  {OUTCOMES.map((o) => (
                    <option key={o.value || 'empty'} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {outcome === 'follow_up' ? (
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Follow-up advised date (patient books center / department)
                  <SpeechInput
                    type="date"
                    className={ui.input}
                    required
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                  />
                </label>
              ) : null}
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Doctor notes
                <SpeechTextarea
                  className={`${ui.input} min-h-[88px]`}
                  value={doctorNotes}
                  onChange={(e) => setDoctorNotes(e.target.value)}
                  placeholder="Clinical notes (max 500 chars)"
                  maxLength={500}
                />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" className={ui.btnSecondary} onClick={() => setSel(null)}>
                  Close
                </button>
                <button type="submit" className={ui.btnPrimary} disabled={busy}>
                  {busy ? 'Saving…' : 'Save consultation'}
                </button>
              </div>
            </form>

            {can('lab.read') || canOrderLab ? (
              <div className="mt-6 border-t border-slate-200 pt-4">
                <h3 className="text-sm font-semibold text-slate-900">Lab orders (staff only)</h3>
                <ul className={`mt-2 space-y-2 text-xs ${ui.muted}`}>
                  {labOrders.length ? (
                    labOrders.map((lo) => (
                      <li key={lo.id} className="rounded border border-slate-100 bg-slate-50 px-3 py-2 text-slate-800">
                        <span className="font-medium">Order #{lo.id}</span> · {lo.test_code ?? 'General'} ·{' '}
                        <span className="capitalize">{lo.status}</span>
                        {lo.result?.summary ? (
                          <div className="mt-1 text-slate-600">Result: {lo.result.summary}</div>
                        ) : null}
                      </li>
                    ))
                  ) : (
                    <li>No lab orders yet.</li>
                  )}
                </ul>
                {canOrderLab ? (
                  <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={(e) => void addLabOrder(e)}>
                    <label className="text-xs font-medium text-slate-600 sm:col-span-2">
                      Test code (optional)
                      <SpeechInput
                        className={ui.input}
                        value={labTestCode}
                        onChange={(e) => setLabTestCode(e.target.value)}
                        placeholder="e.g. CBC, LFT"
                      />
                    </label>
                    <label className="text-xs font-medium text-slate-600 sm:col-span-2">
                      Order notes
                      <SpeechInput className={ui.input} value={labNotes} onChange={(e) => setLabNotes(e.target.value)} />
                    </label>
                    <div className="sm:col-span-2">
                      <button type="submit" className={ui.btnSecondary} disabled={labBusy}>
                        {labBusy ? 'Ordering…' : 'Add lab order'}
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}


