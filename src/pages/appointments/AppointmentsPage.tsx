import { useEffect, useState } from 'react'
import { RefreshCw, CheckCircle, TicketPlus, X } from 'lucide-react'
import { api } from '../../api/client'
import { todayLocalYmd } from '../../utils/dateYmd'
import { useAuth } from '../../context/AuthContext'
import { toastError, toastSuccess, toastWarning } from '../../lib/toast'
import { ui } from '../../ui/classes'

type Appointment = {
  id: number
  patient_id: number
  center_id: number
  appointment_date: string
  token_number: number
  status: string
  w_number?: string | null
  visit_type?: string | null
  patient_name?: string | null
  patient_cnic?: string | null
  center_name?: string | null
  center_city?: string | null
  hospital_name?: string | null
  department_name?: string | null
  location?: string | null
  consultation_outcome?: string | null
  follow_up_advised_date?: string | null
}

type Center = { id: number; name: string; city: string; hospital_name?: string }

type Department = { id: number; name: string }

function today() {
  return todayLocalYmd()
}

export function AppointmentsPage() {
  const { can } = useAuth()
  const [rows, setRows] = useState<Appointment[]>([])
  const [centers, setCenters] = useState<Center[]>([])
  const [centerId, setCenterId] = useState<number | ''>('')
  const [date, setDate] = useState(today)
  const [status, setStatus] = useState('')
  const [busyReceiptId, setBusyReceiptId] = useState<number | null>(null)
  const [busyCompleteId, setBusyCompleteId] = useState<number | null>(null)

  const [walkInOpen, setWalkInOpen] = useState(false)
  const [walkInBusy, setWalkInBusy] = useState(false)
  const [walkInDepartments, setWalkInDepartments] = useState<Department[]>([])
  const [walkInForm, setWalkInForm] = useState({
    appointment_date: today(),
    center_id: '' as number | '',
    department_id: '' as number | '',
    visit_type: 'first_visit' as 'first_visit' | 'follow_up',
    location: '',
    notes: '',
    cnic: '',
    first_name: '',
    last_name: '',
    phone: '',
    gender: '',
    date_of_birth: '',
    address: '',
  })

  useEffect(() => {
    if (!can('centers.read')) return
    api<Center[]>('/centers').then(setCenters).catch((e) => toastError(e, 'Could not load centers'))
  }, [can])

  const canIssueWalkIn = can('appointments.issue_token')

  useEffect(() => {
    if (!walkInOpen || !can('departments.read')) return
    if (walkInForm.center_id === '') {
      setWalkInDepartments([])
      return
    }
    api<Department[]>(`/departments?center_id=${walkInForm.center_id}`)
      .then(setWalkInDepartments)
      .catch(() => setWalkInDepartments([]))
  }, [walkInOpen, walkInForm.center_id, can])

  async function load(override?: { centerId?: number | ''; date?: string }) {
    const cid = override?.centerId !== undefined ? override.centerId : centerId
    const dt = override?.date !== undefined ? override.date : date
    try {
      const q = new URLSearchParams()
      if (cid !== '') q.set('center_id', String(cid))
      if (dt) q.set('date', dt)
      if (status) q.set('status', status)
      const list = await api<Appointment[]>(`/appointments?${q.toString()}`)
      setRows(list)
    } catch (e) {
      toastError(e, 'Failed to load appointments')
    }
  }

  useEffect(() => {
    if (can('appointments.read')) void load()
  }, [])

  if (!can('appointments.read')) {
    return <p className={ui.muted}>No permission.</p>
  }

  async function submitWalkIn() {
    if (walkInForm.center_id === '') {
      toastWarning('Select a center.')
      return
    }
    setWalkInBusy(true)
    try {
      const savedCenterId = Number(walkInForm.center_id)
      const savedDate = walkInForm.appointment_date
      const body = {
        center_id: savedCenterId,
        appointment_date: savedDate,
        visit_type: walkInForm.visit_type,
        department_id:
          walkInForm.department_id === '' ? null : Number(walkInForm.department_id),
        location: walkInForm.location.trim() || null,
        notes: walkInForm.notes.trim() || null,
        patient: {
          cnic: walkInForm.cnic.trim(),
          first_name: walkInForm.first_name.trim(),
          last_name: walkInForm.last_name.trim() || null,
          phone: walkInForm.phone.trim() || null,
          gender: walkInForm.gender.trim() || null,
          date_of_birth: walkInForm.date_of_birth || null,
          address: walkInForm.address.trim() || null,
        },
      }
      const created = await api<Appointment & { token_number: number }>('/appointments/walk-in', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setWalkInOpen(false)
      setWalkInForm({
        appointment_date: today(),
        center_id: '',
        department_id: '',
        visit_type: 'first_visit',
        location: '',
        notes: '',
        cnic: '',
        first_name: '',
        last_name: '',
        phone: '',
        gender: '',
        date_of_birth: '',
        address: '',
      })
      setCenterId(savedCenterId)
      setDate(savedDate)
      await load({ centerId: savedCenterId, date: savedDate })
      toastSuccess(`Walk-in ticket issued: token #${created.token_number} (appointment ${created.id})`)
    } catch (err) {
      toastError(err, 'Walk-in issue failed')
    } finally {
      setWalkInBusy(false)
    }
  }

  return (
    <div className={`space-y-8 ${ui.page}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className={ui.h1}>Appointments</h1>
          <p className={`mt-1 text-sm ${ui.muted}`}>Filter by center, date, and status.</p>
        </div>
        {canIssueWalkIn ? (
          <button
            type="button"
            className={`${ui.btnPrimary} shrink-0 cursor-pointer`}
            onClick={() => {
              setWalkInOpen(true)
            }}
          >
            <TicketPlus className="size-4" strokeWidth={2} aria-hidden />
            Issue walk-in ticket
          </button>
        ) : null}
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
            {[
              'booked',
              'registered',
              'ready',
              'batched',
              'dispatched',
              'completed',
              'skipped',
              'cancelled',
            ].map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load().then(() => toastSuccess('List refreshed'))}
          className={ui.btnPrimary}
        >
          <RefreshCw className="size-4" strokeWidth={2} aria-hidden />
          Refresh
        </button>
      </div>

      {walkInOpen && canIssueWalkIn ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 cursor-pointer"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setWalkInOpen(false)
          }}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl cursor-default"
            role="dialog"
            aria-labelledby="walk-in-title"
          >
            <button
              type="button"
              className={`absolute right-4 top-4 rounded-lg p-1 text-slate-500 hover:bg-slate-100 cursor-pointer`}
              onClick={() => setWalkInOpen(false)}
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
            <h2 id="walk-in-title" className="pr-10 text-lg font-semibold text-slate-900">
              Issue walk-in ticket
            </h2>
            <p className={`mt-1 text-sm ${ui.muted}`}>
              For patients without a mobile booking. Creates the patient record if the CNIC is new, then assigns the
              next token for the selected date and center.
            </p>
            <form
              className="mt-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                void submitWalkIn()
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Visit date
                  <input
                    type="date"
                    required
                    className={ui.input}
                    value={walkInForm.appointment_date}
                    onChange={(e) => setWalkInForm((f) => ({ ...f, appointment_date: e.target.value }))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Center <span className="text-red-600">*</span>
                  <select
                    required
                    className={ui.select}
                    value={walkInForm.center_id === '' ? '' : String(walkInForm.center_id)}
                    onChange={(e) =>
                      setWalkInForm((f) => ({
                        ...f,
                        center_id: e.target.value === '' ? '' : Number(e.target.value),
                        department_id: '',
                      }))
                    }
                  >
                    <option value="">Select center</option>
                    {centers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.city}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
                  Visit type
                  <select
                    className={ui.select}
                    value={walkInForm.visit_type}
                    onChange={(e) =>
                      setWalkInForm((f) => ({
                        ...f,
                        visit_type: e.target.value === 'follow_up' ? 'follow_up' : 'first_visit',
                      }))
                    }
                  >
                    <option value="first_visit">First visit</option>
                    <option value="follow_up">Follow-up</option>
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Department (optional)
                <select
                  className={ui.select}
                  value={walkInForm.department_id === '' ? '' : String(walkInForm.department_id)}
                  onChange={(e) =>
                    setWalkInForm((f) => ({
                      ...f,
                      department_id: e.target.value === '' ? '' : Number(e.target.value),
                    }))
                  }
                  disabled={walkInForm.center_id === ''}
                >
                  <option value="">—</option>
                  {walkInDepartments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
                  Location / ward note (optional)
                  <input
                    type="text"
                    className={ui.input}
                    value={walkInForm.location}
                    onChange={(e) => setWalkInForm((f) => ({ ...f, location: e.target.value }))}
                    placeholder="e.g. OPD desk"
                  />
                </label>
              </div>
              <div className="border-t border-slate-200 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Patient</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
                    CNIC <span className="text-red-600">*</span>
                    <input
                      type="text"
                      required
                      className={ui.input}
                      value={walkInForm.cnic}
                      onChange={(e) => setWalkInForm((f) => ({ ...f, cnic: e.target.value }))}
                      placeholder="Without dashes or with dashes"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    First name <span className="text-red-600">*</span>
                    <input
                      type="text"
                      required
                      className={ui.input}
                      value={walkInForm.first_name}
                      onChange={(e) => setWalkInForm((f) => ({ ...f, first_name: e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    Last name
                    <input
                      type="text"
                      className={ui.input}
                      value={walkInForm.last_name}
                      onChange={(e) => setWalkInForm((f) => ({ ...f, last_name: e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    Phone
                    <input
                      type="text"
                      className={ui.input}
                      value={walkInForm.phone}
                      onChange={(e) => setWalkInForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    Gender
                    <input
                      type="text"
                      className={ui.input}
                      value={walkInForm.gender}
                      onChange={(e) => setWalkInForm((f) => ({ ...f, gender: e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    Date of birth
                    <input
                      type="date"
                      className={ui.input}
                      value={walkInForm.date_of_birth}
                      onChange={(e) => setWalkInForm((f) => ({ ...f, date_of_birth: e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
                    Address
                    <input
                      type="text"
                      className={ui.input}
                      value={walkInForm.address}
                      onChange={(e) => setWalkInForm((f) => ({ ...f, address: e.target.value }))}
                    />
                  </label>
                </div>
              </div>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Notes (optional)
                <input
                  type="text"
                  className={ui.input}
                  value={walkInForm.notes}
                  onChange={(e) => setWalkInForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className={`${ui.btnSecondary} cursor-pointer`}
                  disabled={walkInBusy}
                  onClick={() => setWalkInOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className={`${ui.btnPrimary} cursor-pointer`} disabled={walkInBusy}>
                  {walkInBusy ? 'Issuing…' : 'Issue ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className={ui.tableWrap}>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead>
              <tr>
                <th className={ui.th}>ID</th>
                <th className={ui.th}>Token</th>
                <th className={ui.th}>W #</th>
                <th className={ui.th}>Visit</th>
                <th className={ui.th}>Patient</th>
                <th className={ui.th}>CNIC</th>
                <th className={ui.th}>Center</th>
                <th className={ui.th}>Department</th>
                <th className={ui.th}>Location</th>
                <th className={ui.th}>Date</th>
                <th className={ui.th}>Outcome</th>
                <th className={ui.th}>F/U by</th>
                <th className={ui.th}>Status</th>
                {can('appointments.complete') ? <th className={`${ui.th} text-right`}>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={ui.trHover}>
                  <td className={ui.td}>{r.id}</td>
                  <td className={`${ui.td} font-mono font-medium text-slate-900`}>{r.token_number}</td>
                  <td className={`${ui.td} font-mono text-xs`}>{r.w_number ?? '—'}</td>
                  <td className={`${ui.td} text-xs capitalize`}>
                    {r.visit_type ? String(r.visit_type).replace(/_/g, ' ') : '—'}
                  </td>
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
                  <td className={`${ui.td} text-xs capitalize`}>
                    {r.consultation_outcome ? r.consultation_outcome.replace(/_/g, ' ') : '—'}
                  </td>
                  <td className={`${ui.td} font-mono text-xs`}>
                    {r.follow_up_advised_date ? String(r.follow_up_advised_date).slice(0, 10) : '—'}
                  </td>
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
                              toastSuccess(`Receipt ${receipt.receipt.receipt_number} — print dialog opened`)
                            } else {
                              toastWarning(`Receipt ${receipt.receipt.receipt_number} generated — allow pop-ups to print`)
                            }
                          } catch (e) {
                            toastError(e, 'Receipt failed')
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
                            setBusyCompleteId(r.id)
                            try {
                              await api(`/appointments/${r.id}/complete`, { method: 'POST' })
                              await load()
                              toastSuccess(`Visit #${r.token_number} marked complete`)
                            } catch (e) {
                              toastError(e, 'Could not complete visit')
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
