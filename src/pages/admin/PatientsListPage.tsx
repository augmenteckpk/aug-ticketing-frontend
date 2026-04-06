import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { UserCircle2, RefreshCw, Search, Eye, Plus, X } from 'lucide-react'
import { SpeechInput } from '../../components/speech'
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
  father_cnic?: string | null
  mother_cnic?: string | null
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

function parseCenterId(raw: string | null): number | undefined {
  if (raw == null || raw === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function PatientsListPage() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const centerIdFilter = parseCenterId(searchParams.get('center_id'))
  const [rows, setRows] = useState<PatientRow[]>([])
  const [q, setQ] = useState('')
  const [centerLabel, setCenterLabel] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newCnic, setNewCnic] = useState('')
  const [newFirst, setNewFirst] = useState('')
  const [newLast, setNewLast] = useState('')
  const [newPhone, setNewPhone] = useState('')

  useEffect(() => {
    if (searchParams.get('add') === '1') setShowAdd(true)
  }, [searchParams])

  const load = useCallback(async () => {
    const qs = centerIdFilter != null ? `?center_id=${centerIdFilter}` : ''
    const data = await api<PatientRow[]>(`/patients${qs}`)
    setRows(data)
  }, [centerIdFilter])

  useEffect(() => {
    if (!can('patients.read')) return
    void load().catch((e) => toastError(e, 'Failed to load patients'))
  }, [can, load])

  useEffect(() => {
    if (centerIdFilter == null) {
      setCenterLabel(null)
      return
    }
    if (!can('centers.read')) {
      setCenterLabel(`Center #${centerIdFilter}`)
      return
    }
    let off = false
    api<{ id: number; name: string; city: string }[]>('/centers')
      .then((cs) => {
        if (off) return
        const c = cs.find((x) => x.id === centerIdFilter)
        setCenterLabel(c ? `${c.name} (${c.city})` : `Center #${centerIdFilter}`)
      })
      .catch(() => {
        if (!off) setCenterLabel(`Center #${centerIdFilter}`)
      })
    return () => {
      off = true
    }
  }, [centerIdFilter, can])

  function clearCenterFilter() {
    const n = new URLSearchParams(searchParams)
    n.delete('center_id')
    setSearchParams(n, { replace: true })
  }

  function closeAddPanel() {
    setShowAdd(false)
    setNewCnic('')
    setNewFirst('')
    setNewLast('')
    setNewPhone('')
    const n = new URLSearchParams(searchParams)
    n.delete('add')
    setSearchParams(n, { replace: true })
  }

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
            Master patient list from registration and walk-in. Open a record for full demographics, edits, and OPD visits
            (with permission).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('patients.manage') ? (
            <button
              type="button"
              className={ui.btnPrimary}
              onClick={() => {
                setShowAdd(true)
                const n = new URLSearchParams(searchParams)
                n.set('add', '1')
                setSearchParams(n, { replace: true })
              }}
            >
              <Plus className="size-4" strokeWidth={2} aria-hidden />
              Add patient
            </button>
          ) : null}
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
      </div>

      {centerIdFilter != null ? (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-200 bg-cyan-50/90 px-4 py-3 text-sm text-cyan-950`}
        >
          <span>
            Showing patients with at least one OPD visit at{' '}
            <strong>{centerLabel ?? `center #${centerIdFilter}`}</strong>.
          </span>
          <button type="button" className={ui.btnSecondary} onClick={clearCenterFilter}>
            <X className="size-3.5" strokeWidth={2} aria-hidden />
            Clear center filter
          </button>
        </div>
      ) : null}

      {can('patients.manage') && showAdd ? (
        <div className={ui.card}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-slate-900">
              <Plus className="size-5 text-cyan-600" strokeWidth={2} aria-hidden />
              <h2 className="text-lg font-semibold">New patient</h2>
            </div>
            <button type="button" className={ui.btnGhost} onClick={closeAddPanel}>
              Close
            </button>
          </div>
          <p className={`mb-4 text-sm ${ui.muted}`}>
            Creates a master record (<code className="text-xs">patients.manage</code>). CNIC must be unique.
          </p>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={async (e) => {
              e.preventDefault()
              setCreating(true)
              try {
                const row = await api<PatientRow>('/patients', {
                  method: 'POST',
                  body: JSON.stringify({
                    cnic: newCnic.trim(),
                    first_name: newFirst.trim(),
                    last_name: newLast.trim() || null,
                    phone: newPhone.trim() || null,
                  }),
                })
                toastSuccess('Patient created')
                closeAddPanel()
                navigate(`/app/patients/${row.id}`)
              } catch (err) {
                toastError(err, 'Could not create patient')
              } finally {
                setCreating(false)
              }
            }}
          >
            <label className="flex min-w-[140px] flex-col gap-1 text-xs font-medium text-slate-600">
              CNIC
              <SpeechInput
                className={ui.input}
                value={newCnic}
                onChange={(e) => setNewCnic(e.target.value)}
                placeholder="13 digits"
                required
              />
            </label>
            <label className="flex min-w-[140px] flex-col gap-1 text-xs font-medium text-slate-600">
              First name
              <SpeechInput
                className={ui.input}
                value={newFirst}
                onChange={(e) => setNewFirst(e.target.value)}
                required
              />
            </label>
            <label className="flex min-w-[120px] flex-col gap-1 text-xs font-medium text-slate-600">
              Last name
              <SpeechInput className={ui.input} value={newLast} onChange={(e) => setNewLast(e.target.value)} />
            </label>
            <label className="flex min-w-[140px] flex-col gap-1 text-xs font-medium text-slate-600">
              Phone
              <SpeechInput className={ui.input} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            </label>
            <button type="submit" className={ui.btnPrimary} disabled={creating}>
              {creating ? 'Saving…' : 'Create'}
            </button>
          </form>
        </div>
      ) : null}

      <div className={`${ui.card} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
        <label className="flex min-w-[240px] max-w-md flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
          <span className="flex items-center gap-1.5">
            <Search className="size-3.5 text-slate-400" strokeWidth={2} aria-hidden />
            Search name, CNIC, phone, or ID
          </span>
          <SpeechInput
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
