import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { UserCircle2, RefreshCw, Search, Eye } from 'lucide-react'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { toastError, toastSuccess } from '../../lib/toast'
import { ui } from '../../ui/classes'

export type PatientRow = {
  id: number
  cnic: string
  first_name: string
  last_name: string | null
  father_name?: string | null
  phone: string | null
  gender: string | null
  date_of_birth: string | null
  address: string | null
  city?: string | null
  medical_record_number?: string | null
  preferred_language: string
  status: string
  created_at?: string
  updated_at?: string
}

function displayName(p: PatientRow) {
  return [p.first_name, p.last_name].filter(Boolean).join(' ')
}

export function PatientsListPage() {
  const { can } = useAuth()
  const [rows, setRows] = useState<PatientRow[]>([])
  const [q, setQ] = useState('')
  async function load() {
    const data = await api<PatientRow[]>('/patients')
    setRows(data)
  }

  useEffect(() => {
    if (can('patients.read')) void load().catch((e) => toastError(e, 'Failed to load patients'))
  }, [can])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((p) => {
      const name = displayName(p).toLowerCase()
      return (
        name.includes(s) ||
        p.cnic.replace(/\D/g, '').includes(s.replace(/\D/g, '')) ||
        (p.phone ?? '').toLowerCase().includes(s) ||
        String(p.id).includes(s)
      )
    })
  }, [rows, q])

  if (!can('patients.read')) {
    return <p className={ui.muted}>No access to patient directory.</p>
  }

  return (
    <div className={`space-y-8 ${ui.page}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-700">
            <UserCircle2 className="size-7" strokeWidth={2} aria-hidden />
          </div>
          <h1 className={`mt-2 ${ui.h1}`}>Patients</h1>
          <p className={ui.lead}>
            Master patient list from registration and walk-in. Open a record for full demographics and recent OPD visits.
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

      <div className={`${ui.card} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
        <label className="flex min-w-[240px] max-w-md flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
          <span className="flex items-center gap-1.5">
            <Search className="size-3.5 text-slate-400" strokeWidth={2} aria-hidden />
            Search name, CNIC, phone, or ID
          </span>
          <input
            className={ui.input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type to filter…"
            aria-label="Filter patients"
          />
        </label>
        <p className={`text-sm ${ui.muted}`}>
          Showing <strong className="text-slate-800">{filtered.length}</strong> of {rows.length}
        </p>
      </div>

      <div className={ui.tableWrap}>
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              <th className={ui.th}>ID</th>
              <th className={ui.th}>Patient</th>
              <th className={ui.th}>CNIC</th>
              <th className={ui.th}>Phone</th>
              <th className={ui.th}>City</th>
              <th className={ui.th}>MRN</th>
              <th className={ui.th}>Status</th>
              <th className={`${ui.th} text-right`}>Detail</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className={ui.trHover}>
                <td className={ui.td}>{p.id}</td>
                <td className={`${ui.td} font-medium text-slate-900`}>{displayName(p)}</td>
                <td className={`${ui.td} font-mono text-xs`}>{p.cnic}</td>
                <td className={`${ui.td} font-mono text-xs`}>{p.phone ?? '—'}</td>
                <td className={ui.td}>{p.city ?? '—'}</td>
                <td className={`${ui.td} font-mono text-xs`}>{p.medical_record_number ?? '—'}</td>
                <td className={ui.td}>
                  <span className={ui.badge}>{p.status}</span>
                </td>
                <td className={`${ui.td} text-right`}>
                  <Link
                    to={`/app/patients/${p.id}`}
                    className={`${ui.btnGhost} inline-flex gap-1.5 py-1.5 no-underline`}
                  >
                    <Eye className="size-3.5" strokeWidth={2} aria-hidden />
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length ? (
          <p className={`px-4 py-10 text-center text-sm ${ui.muted}`}>
            {rows.length ? 'No patients match your search.' : 'No patients loaded.'}
          </p>
        ) : null}
      </div>
    </div>
  )
}
