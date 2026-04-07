import { useEffect, useState } from 'react'
import { Layers2, RefreshCw } from 'lucide-react'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { toastError, toastSuccess } from '../../lib/toast'
import { ui } from '../../ui/classes'

type Center = {
  id: number
  name: string
  city: string
  status: string
}

type Department = {
  id: number
  name: string
  description: string | null
  status: string
}

type ClinicRow = {
  id: number
  specialty_id: number
  name: string
  location: string | null
  clinic_type: string
  schedule: string | null
  status: string
  department_id: number
  department_name: string
}

export function ClinicsPage() {
  const { can } = useAuth()
  const [centers, setCenters] = useState<Center[]>([])
  const [centerId, setCenterId] = useState<number | ''>('')
  const [departments, setDepartments] = useState<Department[]>([])
  const [departmentId, setDepartmentId] = useState<number | ''>('')
  const [clinics, setClinics] = useState<ClinicRow[]>([])
  const [busy, setBusy] = useState(false)

  async function loadCenters() {
    const c = await api<Center[]>('/centers')
    setCenters(c.filter((x) => x.status === 'Active'))
    if (c[0] && centerId === '') setCenterId(c[0].id)
  }

  async function loadDepartmentsForCenter(cid: number) {
    const d = await api<Department[]>(`/departments?center_id=${cid}&active_only=1`)
    setDepartments(d)
    setDepartmentId(d[0]?.id ?? '')
    return d
  }

  async function loadClinics(cid: number, did: number) {
    setBusy(true)
    try {
      const list = await api<ClinicRow[]>(`/clinics?center_id=${cid}&department_id=${did}&active_only=1`)
      setClinics(list)
    } catch (e) {
      setClinics([])
      toastError(e, 'Failed to load clinics')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!can('departments.read')) return
    void loadCenters().catch((e) => toastError(e, 'Failed to load centers'))
  }, [can])

  useEffect(() => {
    if (!can('departments.read') || centerId === '') return
    void loadDepartmentsForCenter(Number(centerId)).catch((e) => toastError(e, 'Failed to load departments'))
  }, [can, centerId])

  useEffect(() => {
    if (!can('departments.read') || centerId === '' || departmentId === '') {
      setClinics([])
      return
    }
    void loadClinics(Number(centerId), Number(departmentId))
  }, [can, centerId, departmentId])

  if (!can('departments.read')) return <p className={ui.muted}>No permission to view clinics.</p>

  return (
    <div className={`space-y-8 ${ui.page}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={ui.h1}>Clinics</h1>
          <p className={`mt-1 text-sm ${ui.muted}`}>
            OPD and procedure clinics under each department (SIUT structure). Choose a center and department.
          </p>
        </div>
        <button
          type="button"
          className={ui.btnSecondary}
          onClick={() => {
            void loadCenters()
              .then(async () => {
                const cid = centerId === '' ? undefined : Number(centerId)
                if (cid) {
                  const d = await loadDepartmentsForCenter(cid)
                  const did =
                    departmentId === '' ? d[0]?.id : Number(departmentId)
                  if (did) await loadClinics(cid, did)
                }
                toastSuccess('Refreshed')
              })
              .catch((e) => toastError(e, 'Failed to refresh'))
          }}
        >
          <RefreshCw className="size-4" strokeWidth={2} aria-hidden />
          Refresh
        </button>
      </div>

      <div className={`${ui.card} flex flex-wrap items-end gap-4`}>
        <div className="flex items-center gap-2 text-red-800">
          <Layers2 className="size-5 shrink-0" strokeWidth={2} aria-hidden />
          <span className="text-sm font-semibold text-slate-900">Scope</span>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Center
          <select
            className={ui.select}
            value={centerId === '' ? '' : String(centerId)}
            onChange={(e) => {
              const v = e.target.value
              setCenterId(v === '' ? '' : Number(v))
              setDepartmentId('')
              setClinics([])
            }}
          >
            {centers.length === 0 ? <option value="">No centers</option> : null}
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} â€” {c.city}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[200px] flex-col gap-1 text-xs font-medium text-slate-600">
          Department
          <select
            className={ui.select}
            value={departmentId === '' ? '' : String(departmentId)}
            onChange={(e) => {
              const v = e.target.value
              setDepartmentId(v === '' ? '' : Number(v))
            }}
            disabled={centerId === '' || !departments.length}
          >
            {departments.length === 0 ? <option value="">Select center first</option> : null}
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        {busy ? <p className={`pb-2 text-sm ${ui.muted}`}>Loading clinicsâ€¦</p> : null}
      </div>

      <div className={ui.tableWrap}>
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              <th className={ui.th}>ID</th>
              <th className={ui.th}>Clinic</th>
              <th className={ui.th}>Type</th>
              <th className={ui.th}>Department</th>
              <th className={ui.th}>Location</th>
              <th className={ui.th}>Schedule</th>
              <th className={ui.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {clinics.length === 0 && !busy && departmentId !== '' ? (
              <tr>
                <td className={ui.td} colSpan={7}>
                  <span className={ui.muted}>No clinics for this department at this center.</span>
                </td>
              </tr>
            ) : null}
            {clinics.map((r) => (
              <tr key={r.id} className={ui.trHover}>
                <td className={ui.td}>{r.id}</td>
                <td className={`${ui.td} font-medium text-slate-900`}>{r.name}</td>
                <td className={ui.td}>
                  <span className={ui.badge}>{r.clinic_type}</span>
                </td>
                <td className={`${ui.td} text-slate-600`}>{r.department_name}</td>
                <td className={`${ui.td} text-slate-600`}>{r.location ?? 'â€”'}</td>
                <td className={`${ui.td} text-slate-600`}>{r.schedule ?? 'â€”'}</td>
                <td className={ui.td}>
                  <span className={r.status === 'Active' ? ui.badgeOk : ui.badge}>{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

