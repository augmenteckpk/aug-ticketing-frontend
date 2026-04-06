import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ClipboardList, PlusCircle, RefreshCw, TicketPlus, Users } from 'lucide-react'
import { SpeechInput, SpeechTextarea } from '../../components/speech'
import { api } from '../../api/client'
import { todayLocalYmd } from '../../utils/dateYmd'
import { useAuth } from '../../context/AuthContext'
import { toastError, toastSuccess, toastWarning } from '../../lib/toast'
import { ui } from '../../ui/classes'

type Appt = {
  id: number
  token_number: number
  patient_id: number
  patient_name?: string | null
  patient_cnic?: string | null
  w_number?: string | null
  department_name?: string | null
  center_name?: string | null
  hospital_name?: string | null
  status: string
  appointment_date?: string
}

type Center = { id: number; name: string; hospital_name?: string }

function today() {
  return todayLocalYmd()
}

function centerLine(c: Center | undefined, hospital?: string | null) {
  if (!c) return '—'
  return [hospital, c.name].filter(Boolean).join(' — ')
}

function openPrintPreScreening(p: {
  patientName: string
  cnic: string
  token: number
  wNumber: string | null
  visitDate: string
  centerLine: string
  department: string | null
  bpSys: number
  bpDia: number
  weightKg: number
  heightCm: number
  sugarMgDl: number | null
  symptoms: string | null
  history: string | null
  recordedAtLabel: string
}) {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Pre-screening — Token ${p.token}</title></head>
<body style="font-family:system-ui,Segoe UI,Arial,sans-serif;padding:28px;max-width:640px;color:#0f172a">
  <h1 style="font-size:20px;margin:0 0 8px">OPD — waiting area pre-screening</h1>
  <p style="margin:0 0 20px;font-size:13px;color:#475569">Vitals recorded. Patient may proceed to coordinator queue pool for batching.</p>
  <table style="width:100%;font-size:14px;border-collapse:collapse">
    <tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;width:40%"><strong>Patient</strong></td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0">${esc(p.patientName)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0"><strong>CNIC</strong></td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;font-family:ui-monospace,monospace">${esc(p.cnic)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0"><strong>Token</strong></td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0">${p.token}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0"><strong>W number</strong></td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;font-family:ui-monospace,monospace">${esc(p.wNumber ?? '—')}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0"><strong>Visit date</strong></td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0">${esc(p.visitDate)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0"><strong>Center</strong></td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0">${esc(p.centerLine)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0"><strong>Department</strong></td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0">${esc(p.department ?? '—')}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0"><strong>Blood pressure</strong></td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0">${p.bpSys} / ${p.bpDia} mmHg</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0"><strong>Weight</strong></td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0">${p.weightKg} kg</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0"><strong>Height</strong></td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0">${p.heightCm} cm</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0"><strong>Blood sugar</strong></td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0">${p.sugarMgDl != null ? `${p.sugarMgDl} mg/dL` : '—'}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;vertical-align:top"><strong>Symptoms</strong></td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;white-space:pre-wrap">${p.symptoms ? esc(p.symptoms) : '—'}</td></tr>
    <tr><td style="padding:6px 0;vertical-align:top"><strong>History notes</strong></td><td style="padding:6px 0;white-space:pre-wrap">${p.history ? esc(p.history) : '—'}</td></tr>
  </table>
  <p style="margin-top:24px;font-size:12px;color:#64748b">Recorded: ${esc(p.recordedAtLabel)} · Status after save: <strong>ready</strong> (eligible for coordinator batches)</p>
</body></html>`
  const w = window.open('', '_blank', 'width=720,height=900')
  if (w) {
    w.document.write(html)
    w.document.close()
    w.focus()
    w.print()
  } else {
    toastWarning('Allow pop-ups to print the pre-screening slip.')
  }
}

export function PreAssessmentPage() {
  const { can } = useAuth()
  const [centers, setCenters] = useState<Center[]>([])
  const [centerId, setCenterId] = useState(1)
  const [date, setDate] = useState(today)
  const [rows, setRows] = useState<Appt[]>([])
  const [sel, setSel] = useState<Appt | null>(null)
  const [bpSys, setBpSys] = useState('')
  const [bpDia, setBpDia] = useState('')
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [sugar, setSugar] = useState('')
  const [symptoms, setSymptoms] = useState('')
  const [history, setHistory] = useState('')
  const [busy, setBusy] = useState(false)
  const [printAfterSave, setPrintAfterSave] = useState(true)

  useEffect(() => {
    api<Center[]>('/centers')
      .then((c) => {
        setCenters(c)
        if (c[0]) setCenterId(c[0].id)
      })
      .catch((e) => toastError(e, 'Could not load centers'))
  }, [])

  async function load() {
    const q = new URLSearchParams({ center_id: String(centerId), date, status: 'registered' })
    const list = await api<Appt[]>(`/appointments?${q.toString()}`)
    setRows(list)
  }

  useEffect(() => {
    if (can('appointments.pre_assessment')) void load().catch((e) => toastError(e, 'Failed to load queue'))
  }, [centerId, date, can])

  if (!can('appointments.pre_assessment')) {
    return <p className={ui.muted}>No waiting-area pre-screening permission.</p>
  }

  function openRow(a: Appt) {
    setSel(a)
    setBpSys('')
    setBpDia('')
    setWeight('')
    setHeight('')
    setSugar('')
    setSymptoms('')
    setHistory('')
  }

  async function submitVitals(e: React.FormEvent) {
    e.preventDefault()
    if (!sel) return

    const sys = bpSys === '' ? NaN : Number(bpSys)
    const dia = bpDia === '' ? NaN : Number(bpDia)
    const wKg = weight === '' ? NaN : Number(weight)
    const hCm = height === '' ? NaN : Number(height)

    if (!Number.isFinite(sys) || !Number.isFinite(dia)) {
      toastWarning('Enter blood pressure (systolic and diastolic).')
      return
    }
    if (!Number.isFinite(wKg) || wKg <= 0) {
      toastWarning('Enter weight (kg).')
      return
    }
    if (!Number.isFinite(hCm) || hCm <= 0) {
      toastWarning('Enter height (cm).')
      return
    }

    setBusy(true)
    try {
      await api(`/appointments/${sel.id}/pre-assessment`, {
        method: 'PATCH',
        body: JSON.stringify({
          bp_systolic: sys,
          bp_diastolic: dia,
          weight_kg: wKg,
          height_cm: hCm,
          blood_sugar_mg_dl: sugar === '' ? null : Number(sugar),
          symptoms: symptoms.trim() || null,
          medical_history_notes: history.trim() || null,
        }),
      })

      const c = centers.find((x) => x.id === centerId)
      const recorded = new Date().toLocaleString()

      if (printAfterSave) {
        const centerPrint =
          [sel.hospital_name, sel.center_name].filter(Boolean).join(' — ') ||
          centerLine(c, c?.hospital_name)
        openPrintPreScreening({
          patientName: sel.patient_name ?? `Patient #${sel.patient_id}`,
          cnic: sel.patient_cnic ?? '—',
          token: sel.token_number,
          wNumber: sel.w_number ?? null,
          visitDate: String(sel.appointment_date ?? date).slice(0, 10),
          centerLine: centerPrint,
          department: sel.department_name ?? null,
          bpSys: sys,
          bpDia: dia,
          weightKg: wKg,
          heightCm: hCm,
          sugarMgDl: sugar === '' ? null : Number(sugar),
          symptoms: symptoms.trim() || null,
          history: history.trim() || null,
          recordedAtLabel: recorded,
        })
      }

      setSel(null)
      toastSuccess('Pre-screening saved — visit is now ready for coordinator batches.')
      await load()
    } catch (e) {
      toastError(e, 'Could not save pre-screening')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`space-y-8 ${ui.page}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-700">
            <Activity className="size-7" strokeWidth={2} aria-hidden />
          </div>
          <h1 className={`mt-2 ${ui.h1}`}>Waiting area — pre-screening</h1>
          <p className={`mt-1 text-sm ${ui.muted}`}>
            <strong>Patient-facing workflow:</strong> after registration (W number), the patient waits here while{' '}
            <strong>OPD coordinator or admin</strong> records vitals. Until this form is completed and saved, the visit stays{' '}
            <code className="rounded bg-slate-100 px-1 text-xs">registered</code> and is{' '}
            <strong>not</strong> eligible for coordinator batches. Saving moves the visit to the{' '}
            <code className="rounded bg-slate-100 px-1 text-xs">ready</code> pool (verified / ready for doctor queue),
            matching your HIS document.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={rows.length ? ui.btnPrimary : `${ui.btnSecondary} opacity-80`}
            title={rows.length ? 'Open vitals form for the next patient in this queue' : 'No registered visits — register a patient first'}
            disabled={!rows.length}
            onClick={() => {
              if (rows[0]) {
                openRow(rows[0])
              }
            }}
          >
            <PlusCircle className="size-4" strokeWidth={2} aria-hidden />
            New pre-screening
          </button>
          <button
            type="button"
            className={ui.btnSecondary}
            onClick={() =>
              void load()
                .then(() => toastSuccess('Queue refreshed'))
                .catch((e) => toastError(e, 'Failed to refresh'))
            }
          >
            <RefreshCw className="size-4" strokeWidth={2} aria-hidden />
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Related actions (full OPD flow)</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {can('appointments.issue_token') ? (
            <Link to="/app/appointments" className={`${ui.btnSecondary} inline-flex items-center gap-2 no-underline`}>
              <TicketPlus className="size-4" strokeWidth={2} aria-hidden />
              Issue walk-in token
            </Link>
          ) : null}
          {can('appointments.register') ? (
            <Link to="/app/registration" className={`${ui.btnSecondary} inline-flex items-center gap-2 no-underline`}>
              <ClipboardList className="size-4" strokeWidth={2} aria-hidden />
              Registration desk (new visit / demographics)
            </Link>
          ) : null}
          {can('queue.read') ? (
            <Link to="/app/queue" className={`${ui.btnSecondary} inline-flex items-center gap-2 no-underline`}>
              <Users className="size-4" strokeWidth={2} aria-hidden />
              Queue & batches
            </Link>
          ) : null}
        </div>
        <p className={`mt-3 text-xs ${ui.muted}`}>
          Visits are not created on this screen: greeter issues the token, registration creates the W number; here you only
          record vitals for visits already in <strong>registered</strong> status.
        </p>
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
          Visit date
          <SpeechInput type="date" className={ui.input} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <div className={ui.tableWrap}>
        <p className={`border-b border-slate-100 px-4 py-2 text-xs font-medium text-slate-600`}>
          Queue: registered patients waiting for vitals (same physical queue as “checked-in / registered” in the HIS)
        </p>
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              <th className={ui.th}>Token</th>
              <th className={ui.th}>W #</th>
              <th className={ui.th}>Patient</th>
              <th className={ui.th}>CNIC</th>
              <th className={ui.th}>Department</th>
              <th className={`${ui.th} text-right`}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={ui.trHover}>
                <td className={ui.td}>{r.token_number}</td>
                <td className={`${ui.td} font-mono text-xs`}>{r.w_number ?? '—'}</td>
                <td className={ui.td}>{r.patient_name ?? r.patient_id}</td>
                <td className={`${ui.td} font-mono text-xs`}>{r.patient_cnic ?? '—'}</td>
                <td className={ui.td}>{r.department_name ?? '—'}</td>
                <td className={`${ui.td} text-right`}>
                  <button type="button" className={`${ui.btnPrimary} py-1.5 text-xs`} onClick={() => openRow(r)}>
                    Create / edit vitals
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? (
          <p className={`px-4 py-8 text-center text-sm ${ui.muted}`}>
            No registered visits waiting for pre-screening. Patients must complete the registration desk first.
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
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            role="dialog"
            aria-labelledby="pre-title"
          >
            <h2 id="pre-title" className="text-lg font-semibold text-slate-900">
              Pre-screening — token #{sel.token_number} · W {sel.w_number ?? '—'}
            </h2>
            <p className={`mt-1 text-xs ${ui.muted}`}>
              Required before batching: BP, weight, height. Optional: glucose, symptoms, history notes.
            </p>
            <form className="mt-4 space-y-3" onSubmit={(e) => void submitVitals(e)}>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-slate-600">
                  BP systolic (mmHg) <span className="text-red-600">*</span>
                  <SpeechInput
                    className={ui.input}
                    type="number"
                    required
                    min={0}
                    value={bpSys}
                    onChange={(e) => setBpSys(e.target.value)}
                  />
                </label>
                <label className="text-xs font-medium text-slate-600">
                  BP diastolic (mmHg) <span className="text-red-600">*</span>
                  <SpeechInput
                    className={ui.input}
                    type="number"
                    required
                    min={0}
                    value={bpDia}
                    onChange={(e) => setBpDia(e.target.value)}
                  />
                </label>
                <label className="text-xs font-medium text-slate-600">
                  Weight (kg) <span className="text-red-600">*</span>
                  <SpeechInput
                    className={ui.input}
                    type="number"
                    step="0.1"
                    required
                    min={0}
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                  />
                </label>
                <label className="text-xs font-medium text-slate-600">
                  Height (cm) <span className="text-red-600">*</span>
                  <SpeechInput
                    className={ui.input}
                    type="number"
                    step="0.1"
                    required
                    min={0}
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                  />
                </label>
                <label className="text-xs font-medium text-slate-600 sm:col-span-2">
                  Blood sugar (mg/dL) — optional
                  <SpeechInput
                    className={ui.input}
                    type="number"
                    step="0.1"
                    min={0}
                    value={sugar}
                    onChange={(e) => setSugar(e.target.value)}
                  />
                </label>
              </div>
              <label className="text-xs font-medium text-slate-600">
                Symptoms / chief complaint
                <SpeechTextarea className={`${ui.input} min-h-[72px]`} value={symptoms} onChange={(e) => setSymptoms(e.target.value)} />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Medical history notes
                <SpeechTextarea className={`${ui.input} min-h-[72px]`} value={history} onChange={(e) => setHistory(e.target.value)} />
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={printAfterSave} onChange={(e) => setPrintAfterSave(e.target.checked)} />
                Print pre-screening slip after save
              </label>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button type="button" className={ui.btnSecondary} onClick={() => setSel(null)}>
                  Cancel
                </button>
                <button type="submit" className={ui.btnPrimary} disabled={busy}>
                  {busy ? 'Saving…' : 'Save & move to ready pool'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
