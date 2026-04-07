import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, UserCircle2, RefreshCw, Pencil, Trash2 } from 'lucide-react'
import { SpeechInput } from '../../components/speech'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { toastError, toastSuccess } from '../../lib/toast'
import { ui } from '../../ui/classes'
import type { PatientRow } from './PatientsListPage'
import { FieldError } from '../../components/FieldError'
import {
  optionalAddress,
  optionalCity,
  optionalDobYmd,
  optionalGenderText,
  optionalGuardianCnicDigits,
  optionalMrn,
  optionalPersonName,
  optionalPhone,
  personNameRequired,
  preferredLanguageCode,
} from '../../lib/fieldValidation'

type VisitRow = {
  id: number
  appointment_date: string
  token_number: number
  status: string
  w_number?: string | null
  center_name?: string | null
  department_name?: string | null
}

function formatTs(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

function formatDob(d: string | null | undefined) {
  if (!d) return '—'
  const s = String(d).slice(0, 10)
  return s.length === 10 ? s : String(d)
}

type EditDraft = {
  first_name: string
  last_name: string
  father_name: string
  father_cnic: string
  mother_cnic: string
  phone: string
  gender: string
  date_of_birth: string
  address: string
  city: string
  medical_record_number: string
  preferred_language: string
  status: string
}

function toDraft(p: PatientRow): EditDraft {
  return {
    first_name: p.first_name ?? '',
    last_name: p.last_name ?? '',
    father_name: p.father_name ?? '',
    father_cnic: p.father_cnic ?? '',
    mother_cnic: p.mother_cnic ?? '',
    phone: p.phone ?? '',
    gender: p.gender ?? '',
    date_of_birth: p.date_of_birth ? String(p.date_of_birth).slice(0, 10) : '',
    address: p.address ?? '',
    city: p.city ?? '',
    medical_record_number: p.medical_record_number ?? '',
    preferred_language: p.preferred_language ?? 'en',
    status: p.status ?? 'Active',
  }
}

export function PatientDetailPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const id = Number(patientId)
  const navigate = useNavigate()
  const { can } = useAuth()
  const [patient, setPatient] = useState<PatientRow | null>(null)
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [draft, setDraft] = useState<EditDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [editErr, setEditErr] = useState<Partial<Record<string, string>>>({})

  async function load() {
    if (!Number.isFinite(id) || id < 1) {
      toastError('Invalid patient id')
      setPatient(null)
      setVisits([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const p = await api<PatientRow>(`/patients/${id}`)
      setPatient(p)
      if (can('appointments.read')) {
        try {
          const list = await api<VisitRow[]>(`/appointments?patient_id=${id}`)
          setVisits(list)
        } catch {
          setVisits([])
          toastError('Could not load visit history')
        }
      } else {
        setVisits([])
      }
    } catch (e) {
      setPatient(null)
      setVisits([])
      toastError(e, 'Failed to load patient')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (can('patients.read')) void load()
  }, [can, id])

  function openEdit() {
    if (!patient) return
    setEditErr({})
    setDraft(toDraft(patient))
    setEditOpen(true)
  }

  if (!can('patients.read')) {
    return <p className={ui.muted}>No access to patient records.</p>
  }

  if (loading) {
    return (
      <p className={`${ui.muted} ${ui.page}`}>
        <Link to="/app/patients" className="text-red-700 hover:underline">
          ← Patients
        </Link>
        <span className="mt-4 block">Loading…</span>
      </p>
    )
  }

  if (!patient) {
    return (
      <div className={`space-y-4 ${ui.page}`}>
        <Link to="/app/patients" className={`${ui.btnGhost} inline-flex items-center gap-2 no-underline`}>
          <ArrowLeft className="size-4" strokeWidth={2} aria-hidden />
          Back to patients
        </Link>
        <p className={ui.muted}>Patient could not be loaded.</p>
      </div>
    )
  }

  const name = [patient.first_name, patient.last_name].filter(Boolean).join(' ')

  return (
    <div className={`space-y-8 ${ui.page}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/app/patients"
            className={`mb-3 inline-flex items-center gap-2 text-sm font-medium text-red-700 hover:text-red-800`}
          >
            <ArrowLeft className="size-4" strokeWidth={2} aria-hidden />
            All patients
          </Link>
          <div className="flex items-center gap-2 text-red-700">
            <UserCircle2 className="size-7" strokeWidth={2} aria-hidden />
          </div>
          <h1 className={`mt-2 ${ui.h1}`}>
            {name}
            <span className={`ml-2 text-lg font-normal ${ui.muted}`}>#{patient.id}</span>
          </h1>
          <p className={ui.lead}>Master demographic record; OPD visits are listed below when you have appointment access.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('patients.manage') ? (
            <>
              <button type="button" className={ui.btnSecondary} onClick={openEdit}>
                <Pencil className="size-4" strokeWidth={2} aria-hidden />
                Edit
              </button>
              <button
                type="button"
                className={ui.btnDanger}
                onClick={async () => {
                  if (!window.confirm(`Delete patient #${patient.id}? This only works if there are no OPD visits.`)) return
                  if (!window.confirm('This cannot be undone. Continue?')) return
                  try {
                    await api(`/patients/${patient.id}`, { method: 'DELETE' })
                    toastSuccess('Patient deleted')
                    navigate('/app/patients')
                  } catch (e) {
                    toastError(e, 'Could not delete patient')
                  }
                }}
              >
                <Trash2 className="size-4" strokeWidth={2} aria-hidden />
                Delete
              </button>
            </>
          ) : null}
          <button
            type="button"
            className={ui.btnSecondary}
            onClick={() =>
              void load()
                .then(() => toastSuccess('Refreshed'))
                .catch(() => {})
            }
          >
            <RefreshCw className="size-4" strokeWidth={2} aria-hidden />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={ui.card}>
          <h2 className="border-b border-slate-100 pb-2 text-base font-semibold text-slate-900">Identity & contact</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="grid grid-cols-[8.5rem_1fr] gap-2 border-b border-slate-50 pb-2">
              <dt className={ui.muted}>CNIC</dt>
              <dd className="font-mono text-slate-900">{patient.cnic}</dd>
            </div>
            <div className="grid grid-cols-[8.5rem_1fr] gap-2 border-b border-slate-50 pb-2">
              <dt className={ui.muted}>Father&apos;s name</dt>
              <dd>{patient.father_name ?? '—'}</dd>
            </div>
            <div className="grid grid-cols-[8.5rem_1fr] gap-2 border-b border-slate-50 pb-2">
              <dt className={ui.muted}>Father CNIC</dt>
              <dd className="font-mono text-xs">{patient.father_cnic ?? '—'}</dd>
            </div>
            <div className="grid grid-cols-[8.5rem_1fr] gap-2 border-b border-slate-50 pb-2">
              <dt className={ui.muted}>Mother CNIC</dt>
              <dd className="font-mono text-xs">{patient.mother_cnic ?? '—'}</dd>
            </div>
            <div className="grid grid-cols-[8.5rem_1fr] gap-2 border-b border-slate-50 pb-2">
              <dt className={ui.muted}>Phone</dt>
              <dd className="font-mono">{patient.phone ?? '—'}</dd>
            </div>
            <div className="grid grid-cols-[8.5rem_1fr] gap-2 border-b border-slate-50 pb-2">
              <dt className={ui.muted}>Gender</dt>
              <dd>{patient.gender ?? '—'}</dd>
            </div>
            <div className="grid grid-cols-[8.5rem_1fr] gap-2 border-b border-slate-50 pb-2">
              <dt className={ui.muted}>Date of birth</dt>
              <dd>{formatDob(patient.date_of_birth)}</dd>
            </div>
            <div className="grid grid-cols-[8.5rem_1fr] gap-2 border-b border-slate-50 pb-2">
              <dt className={ui.muted}>Address</dt>
              <dd className="whitespace-pre-wrap">{patient.address ?? '—'}</dd>
            </div>
            <div className="grid grid-cols-[8.5rem_1fr] gap-2 border-b border-slate-50 pb-2">
              <dt className={ui.muted}>City</dt>
              <dd>{patient.city ?? '—'}</dd>
            </div>
          </dl>
        </div>

        <div className={ui.card}>
          <h2 className="border-b border-slate-100 pb-2 text-base font-semibold text-slate-900">Record metadata</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="grid grid-cols-[8.5rem_1fr] gap-2 border-b border-slate-50 pb-2">
              <dt className={ui.muted}>MRN</dt>
              <dd className="font-mono">{patient.medical_record_number ?? '—'}</dd>
            </div>
            <div className="grid grid-cols-[8.5rem_1fr] gap-2 border-b border-slate-50 pb-2">
              <dt className={ui.muted}>Language</dt>
              <dd className="uppercase">{patient.preferred_language}</dd>
            </div>
            <div className="grid grid-cols-[8.5rem_1fr] gap-2 border-b border-slate-50 pb-2">
              <dt className={ui.muted}>Status</dt>
              <dd>
                <span className={ui.badge}>{patient.status}</span>
              </dd>
            </div>
            <div className="grid grid-cols-[8.5rem_1fr] gap-2 border-b border-slate-50 pb-2">
              <dt className={ui.muted}>Created</dt>
              <dd>{formatTs(patient.created_at)}</dd>
            </div>
            <div className="grid grid-cols-[8.5rem_1fr] gap-2">
              <dt className={ui.muted}>Updated</dt>
              <dd>{formatTs(patient.updated_at)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {can('appointments.read') ? (
        <div className={ui.tableWrap}>
          <div className={`border-b border-slate-100 px-4 py-3`}>
            <h2 className="text-sm font-semibold text-slate-900">OPD visits (all dates)</h2>
            <p className={`mt-0.5 text-xs ${ui.muted}`}>Visits linked to this patient id.</p>
          </div>
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className={ui.th}>Visit ID</th>
                <th className={ui.th}>Date</th>
                <th className={ui.th}>Token</th>
                <th className={ui.th}>W #</th>
                <th className={ui.th}>Center</th>
                <th className={ui.th}>Department</th>
                <th className={ui.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => (
                <tr key={v.id} className={ui.trHover}>
                  <td className={ui.td}>{v.id}</td>
                  <td className={`${ui.td} font-mono text-xs`}>{String(v.appointment_date).slice(0, 10)}</td>
                  <td className={ui.td}>{v.token_number}</td>
                  <td className={`${ui.td} font-mono text-xs`}>{v.w_number ?? '—'}</td>
                  <td className={ui.td}>{v.center_name ?? '—'}</td>
                  <td className={ui.td}>{v.department_name ?? '—'}</td>
                  <td className={ui.td}>
                    <span className={ui.badge}>{v.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visits.length ? (
            <p className={`px-4 py-8 text-center text-sm ${ui.muted}`}>No OPD visits found for this patient.</p>
          ) : null}
        </div>
      ) : (
        <p className={`text-sm ${ui.muted}`}>You do not have permission to view appointment history.</p>
      )}

      {editOpen && draft && can('patients.manage') ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => {
            setEditErr({})
            setEditOpen(false)
          }}
        >
          <div
            className={`${ui.card} z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto shadow-xl`}
            role="dialog"
            aria-modal
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900">Edit patient</h2>
            <p className={`mt-1 text-sm ${ui.muted}`}>CNIC cannot be changed here. Requires patients.manage.</p>
            <form
              className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault()
                const checks: Partial<Record<string, string>> = {}
                const fn = personNameRequired(draft.first_name, 'First name')
                if (!fn.ok) checks.first_name = fn.message
                const ln = optionalPersonName(draft.last_name, 50, 'Last name')
                if (!ln.ok) checks.last_name = ln.message
                const fan = optionalPersonName(draft.father_name, 50, "Father's name")
                if (!fan.ok) checks.father_name = fan.message
                const fcn = optionalGuardianCnicDigits(draft.father_cnic)
                if (!fcn.ok) checks.father_cnic = fcn.message
                const mcn = optionalGuardianCnicDigits(draft.mother_cnic)
                if (!mcn.ok) checks.mother_cnic = mcn.message
                const ph = optionalPhone(draft.phone)
                if (!ph.ok) checks.phone = ph.message
                const g = optionalGenderText(draft.gender)
                if (!g.ok) checks.gender = g.message
                const db = optionalDobYmd(draft.date_of_birth)
                if (!db.ok) checks.date_of_birth = db.message
                const ad = optionalAddress(draft.address)
                if (!ad.ok) checks.address = ad.message
                const ct = optionalCity(draft.city)
                if (!ct.ok) checks.city = ct.message
                const mr = optionalMrn(draft.medical_record_number)
                if (!mr.ok) checks.medical_record_number = mr.message
                const pl = preferredLanguageCode(draft.preferred_language)
                if (!pl.ok) checks.preferred_language = pl.message
                setEditErr(checks)
                if (Object.keys(checks).length) return
                setSaving(true)
                try {
                  const fd = draft.father_cnic.replace(/\D/g, '')
                  const md = draft.mother_cnic.replace(/\D/g, '')
                  const body = {
                    first_name: draft.first_name.trim(),
                    last_name: draft.last_name.trim() || null,
                    father_name: draft.father_name.trim() || null,
                    father_cnic: fd || null,
                    mother_cnic: md || null,
                    phone: draft.phone.trim() || null,
                    gender: draft.gender.trim() || null,
                    date_of_birth: draft.date_of_birth.trim() || null,
                    address: draft.address.trim() || null,
                    city: draft.city.trim() || null,
                    medical_record_number: draft.medical_record_number.trim() || null,
                    preferred_language: draft.preferred_language.trim() || 'en',
                    status: draft.status.trim() || 'Active',
                  }
                  const updated = await api<PatientRow>(`/patients/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(body),
                  })
                  setPatient(updated)
                  setEditOpen(false)
                  setEditErr({})
                  toastSuccess('Patient updated')
                } catch (err) {
                  toastError(err, 'Could not update patient')
                } finally {
                  setSaving(false)
                }
              }}
            >
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
                First name
                <SpeechInput
                  className={ui.input}
                  shellClassName={editErr.first_name ? '!border-red-400 ring-1 ring-red-400' : ''}
                  value={draft.first_name}
                  onChange={(e) => {
                    setDraft({ ...draft, first_name: e.target.value })
                    if (editErr.first_name) setEditErr((x) => ({ ...x, first_name: undefined }))
                  }}
                  required
                  aria-invalid={editErr.first_name ? true : undefined}
                />
                <FieldError message={editErr.first_name} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Last name
                <SpeechInput
                  className={ui.input}
                  shellClassName={editErr.last_name ? '!border-red-400 ring-1 ring-red-400' : ''}
                  value={draft.last_name}
                  onChange={(e) => {
                    setDraft({ ...draft, last_name: e.target.value })
                    if (editErr.last_name) setEditErr((x) => ({ ...x, last_name: undefined }))
                  }}
                  aria-invalid={editErr.last_name ? true : undefined}
                />
                <FieldError message={editErr.last_name} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Status
                <select
                  className={ui.select}
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Suspended">Suspended</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
                Father&apos;s name
                <SpeechInput
                  className={ui.input}
                  shellClassName={editErr.father_name ? '!border-red-400 ring-1 ring-red-400' : ''}
                  value={draft.father_name}
                  onChange={(e) => {
                    setDraft({ ...draft, father_name: e.target.value })
                    if (editErr.father_name) setEditErr((x) => ({ ...x, father_name: undefined }))
                  }}
                  aria-invalid={editErr.father_name ? true : undefined}
                />
                <FieldError message={editErr.father_name} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Father CNIC
                <SpeechInput
                  className={ui.input}
                  shellClassName={editErr.father_cnic ? '!border-red-400 ring-1 ring-red-400' : ''}
                  value={draft.father_cnic}
                  onChange={(e) => {
                    setDraft({ ...draft, father_cnic: e.target.value })
                    if (editErr.father_cnic) setEditErr((x) => ({ ...x, father_cnic: undefined }))
                  }}
                  aria-invalid={editErr.father_cnic ? true : undefined}
                />
                <FieldError message={editErr.father_cnic} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Mother CNIC
                <SpeechInput
                  className={ui.input}
                  shellClassName={editErr.mother_cnic ? '!border-red-400 ring-1 ring-red-400' : ''}
                  value={draft.mother_cnic}
                  onChange={(e) => {
                    setDraft({ ...draft, mother_cnic: e.target.value })
                    if (editErr.mother_cnic) setEditErr((x) => ({ ...x, mother_cnic: undefined }))
                  }}
                  aria-invalid={editErr.mother_cnic ? true : undefined}
                />
                <FieldError message={editErr.mother_cnic} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Phone
                <SpeechInput
                  className={ui.input}
                  shellClassName={editErr.phone ? '!border-red-400 ring-1 ring-red-400' : ''}
                  value={draft.phone}
                  onChange={(e) => {
                    setDraft({ ...draft, phone: e.target.value })
                    if (editErr.phone) setEditErr((x) => ({ ...x, phone: undefined }))
                  }}
                  aria-invalid={editErr.phone ? true : undefined}
                />
                <FieldError message={editErr.phone} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Gender
                <SpeechInput
                  className={ui.input}
                  shellClassName={editErr.gender ? '!border-red-400 ring-1 ring-red-400' : ''}
                  value={draft.gender}
                  onChange={(e) => {
                    setDraft({ ...draft, gender: e.target.value })
                    if (editErr.gender) setEditErr((x) => ({ ...x, gender: undefined }))
                  }}
                  aria-invalid={editErr.gender ? true : undefined}
                />
                <FieldError message={editErr.gender} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Date of birth
                <SpeechInput
                  type="date"
                  className={ui.input}
                  shellClassName={editErr.date_of_birth ? '!border-red-400 ring-1 ring-red-400' : ''}
                  value={draft.date_of_birth}
                  onChange={(e) => {
                    setDraft({ ...draft, date_of_birth: e.target.value })
                    if (editErr.date_of_birth) setEditErr((x) => ({ ...x, date_of_birth: undefined }))
                  }}
                  aria-invalid={editErr.date_of_birth ? true : undefined}
                />
                <FieldError message={editErr.date_of_birth} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                City
                <SpeechInput
                  className={ui.input}
                  shellClassName={editErr.city ? '!border-red-400 ring-1 ring-red-400' : ''}
                  value={draft.city}
                  onChange={(e) => {
                    setDraft({ ...draft, city: e.target.value })
                    if (editErr.city) setEditErr((x) => ({ ...x, city: undefined }))
                  }}
                  aria-invalid={editErr.city ? true : undefined}
                />
                <FieldError message={editErr.city} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
                Address
                <SpeechInput
                  className={ui.input}
                  shellClassName={editErr.address ? '!border-red-400 ring-1 ring-red-400' : ''}
                  value={draft.address}
                  onChange={(e) => {
                    setDraft({ ...draft, address: e.target.value })
                    if (editErr.address) setEditErr((x) => ({ ...x, address: undefined }))
                  }}
                  aria-invalid={editErr.address ? true : undefined}
                />
                <FieldError message={editErr.address} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                MRN
                <SpeechInput
                  className={ui.input}
                  shellClassName={editErr.medical_record_number ? '!border-red-400 ring-1 ring-red-400' : ''}
                  value={draft.medical_record_number}
                  onChange={(e) => {
                    setDraft({ ...draft, medical_record_number: e.target.value })
                    if (editErr.medical_record_number) setEditErr((x) => ({ ...x, medical_record_number: undefined }))
                  }}
                  aria-invalid={editErr.medical_record_number ? true : undefined}
                />
                <FieldError message={editErr.medical_record_number} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Language
                <SpeechInput
                  className={ui.input}
                  shellClassName={editErr.preferred_language ? '!border-red-400 ring-1 ring-red-400' : ''}
                  value={draft.preferred_language}
                  onChange={(e) => {
                    setDraft({ ...draft, preferred_language: e.target.value })
                    if (editErr.preferred_language) setEditErr((x) => ({ ...x, preferred_language: undefined }))
                  }}
                  aria-invalid={editErr.preferred_language ? true : undefined}
                />
                <FieldError message={editErr.preferred_language} />
              </label>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <button
                  type="button"
                  className={ui.btnSecondary}
                  onClick={() => {
                    setEditErr({})
                    setEditOpen(false)
                  }}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="submit" className={ui.btnPrimary} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}


