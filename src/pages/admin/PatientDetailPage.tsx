import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, UserCircle2, RefreshCw } from 'lucide-react'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { toastError, toastSuccess } from '../../lib/toast'
import { ui } from '../../ui/classes'
import type { PatientRow } from './PatientsListPage'

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

export function PatientDetailPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const id = Number(patientId)
  const { can } = useAuth()
  const [patient, setPatient] = useState<PatientRow | null>(null)
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [loading, setLoading] = useState(true)

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

  if (!can('patients.read')) {
    return <p className={ui.muted}>No access to patient records.</p>
  }

  if (loading) {
    return (
      <p className={`${ui.muted} ${ui.page}`}>
        <Link to="/app/patients" className="text-cyan-700 hover:underline">
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
            className={`mb-3 inline-flex items-center gap-2 text-sm font-medium text-cyan-700 hover:text-cyan-800`}
          >
            <ArrowLeft className="size-4" strokeWidth={2} aria-hidden />
            All patients
          </Link>
          <div className="flex items-center gap-2 text-cyan-700">
            <UserCircle2 className="size-7" strokeWidth={2} aria-hidden />
          </div>
          <h1 className={`mt-2 ${ui.h1}`}>
            {name}
            <span className={`ml-2 text-lg font-normal ${ui.muted}`}>#{patient.id}</span>
          </h1>
          <p className={ui.lead}>Master demographic record; OPD visits are listed below when you have appointment access.</p>
        </div>
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
    </div>
  )
}
