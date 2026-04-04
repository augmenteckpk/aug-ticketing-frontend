import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Pencil, Plus, RefreshCw, UserCircle2 } from 'lucide-react'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { toastError, toastSuccess } from '../../lib/toast'
import { ui } from '../../ui/classes'

type Hospital = { id: number; name: string }
type Center = {
  id: number
  hospital_id: number
  name: string
  city: string
  address?: string | null
  hospital_name?: string
  status: string
}

type Department = { id: number; name: string }

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export function CentersPage() {
  const { can } = useAuth()
  const [hospitals, setHospitals] = useState<Hospital[]>([])
  const [rows, setRows] = useState<Center[]>([])
  const [hospitalId, setHospitalId] = useState(1)
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [edit, setEdit] = useState<Center | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [routeCenterId, setRouteCenterId] = useState<number | ''>('')
  const [routeDeptByWeekday, setRouteDeptByWeekday] = useState<Record<number, number | ''>>({})
  const [patientCounts, setPatientCounts] = useState<Record<number, number>>({})

  async function load() {
    const [h, c, d] = await Promise.all([
      api<Hospital[]>('/hospitals'),
      api<Center[]>('/centers'),
      api<Department[]>('/departments').catch(() => [] as Department[]),
    ])
    setHospitals(h)
    setRows(c)
    setDepartments(d)
    if (h[0]) setHospitalId(h[0].id)
    if (c[0] && routeCenterId === '') setRouteCenterId(c[0].id)
  }

  async function loadWeekdayRoutes(cid: number) {
    const list = await api<{ weekday: number; department_id: number }[]>(`/centers/${cid}/weekday-routes`)
    const map: Record<number, number | ''> = {}
    for (let w = 0; w <= 6; w++) map[w] = ''
    for (const r of list) map[r.weekday] = r.department_id
    setRouteDeptByWeekday(map)
  }

  useEffect(() => {
    if (can('centers.read')) void load().catch((e) => toastError(e, 'Failed to load centers'))
  }, [can])

  useEffect(() => {
    if (!can('patients.read')) return
    let off = false
    api<{ center_id: number; patient_count: number }[]>('/patients/stats/by-center')
      .then((list) => {
        if (off) return
        const m: Record<number, number> = {}
        for (const r of list) m[r.center_id] = r.patient_count
        setPatientCounts(m)
      })
      .catch(() => {})
    return () => {
      off = true
    }
  }, [can])

  const canSeePatientCol = can('patients.read')

  useEffect(() => {
    if (!can('centers.manage') || routeCenterId === '') return
    void loadWeekdayRoutes(routeCenterId).catch((e) => toastError(e, 'Failed to load weekday routes'))
  }, [routeCenterId, can])

  if (!can('centers.read')) {
    return <p className={ui.muted}>No access.</p>
  }

  return (
    <div className={`space-y-8 ${ui.page}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={ui.h1}>Centers</h1>
          <p className={`mt-1 text-sm ${ui.muted}`}>
            OPD centers linked to hospitals.
            {canSeePatientCol ? (
              <>
                {' '}
                Distinct patients with at least one visit at a center are counted; open the directory filtered by center.
              </>
            ) : null}
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

      {can('centers.manage') ? (
        <div className={ui.card}>
          <div className="mb-4 flex items-center gap-2 text-slate-900">
            <Plus className="size-5 text-cyan-600" strokeWidth={2} aria-hidden />
            <h2 className="text-lg font-semibold">Add center</h2>
          </div>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={async (e) => {
              e.preventDefault()
              try {
                await api('/centers', {
                  method: 'POST',
                  body: JSON.stringify({ hospital_id: hospitalId, name, city, address: address || null }),
                })
                setName('')
                setCity('')
                setAddress('')
                await load()
                toastSuccess('Center created')
              } catch (err) {
                toastError(err, 'Could not create center')
              }
            }}
          >
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Hospital
              <select className={ui.select} value={hospitalId} onChange={(e) => setHospitalId(Number(e.target.value))}>
                {hospitals.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Center name
              <input className={ui.input} placeholder="OPD Block A" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              City
              <input className={ui.input} placeholder="Georgetown" value={city} onChange={(e) => setCity(e.target.value)} required />
            </label>
            <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
              Address
              <input className={ui.input} placeholder="Street / block" value={address} onChange={(e) => setAddress(e.target.value)} />
            </label>
            <button type="submit" className={ui.btnPrimary}>
              Add
            </button>
          </form>
        </div>
      ) : null}

      <div className={ui.tableWrap}>
        <table className="min-w-full border-collapse text-left">
          <thead>
            <tr>
              <th className={ui.th}>ID</th>
              <th className={ui.th}>Hospital</th>
              <th className={ui.th}>Center</th>
              <th className={ui.th}>City</th>
              <th className={ui.th}>Address</th>
              <th className={ui.th}>Status</th>
              {canSeePatientCol ? (
                <th className={ui.th}>
                  <span className="inline-flex items-center gap-1">
                    <UserCircle2 className="size-3.5 text-slate-400" strokeWidth={2} aria-hidden />
                    Patients
                  </span>
                </th>
              ) : null}
              {can('centers.manage') ? <th className={`${ui.th} text-right`}>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={ui.trHover}>
                <td className={ui.td}>{r.id}</td>
                <td className={`${ui.td} text-slate-700`}>{r.hospital_name ?? `Hospital #${r.hospital_id}`}</td>
                <td className={`${ui.td} font-medium text-slate-900`}>
                  <span className="inline-flex items-center gap-2">
                    <MapPin className="size-4 text-cyan-600" strokeWidth={2} aria-hidden />
                    {r.name}
                  </span>
                </td>
                <td className={`${ui.td} text-slate-600`}>{r.city}</td>
                <td className={`${ui.td} text-slate-600`}>{r.address ?? '—'}</td>
                <td className={ui.td}>
                  <span className={r.status === 'Active' ? ui.badgeOk : ui.badge}>{r.status}</span>
                </td>
                {canSeePatientCol ? (
                  <td className={ui.td}>
                    <span className="tabular-nums text-slate-800">{patientCounts[r.id] ?? 0}</span>
                    <Link
                      to={`/app/patients?center_id=${r.id}`}
                      className={`${ui.btnGhost} ml-2 inline-flex py-1 text-xs no-underline`}
                    >
                      Directory
                    </Link>
                  </td>
                ) : null}
                {can('centers.manage') ? (
                  <td className={`${ui.td} text-right`}>
                    <button type="button" className={ui.btnGhost} onClick={() => setEdit(r)}>
                      <Pencil className="size-3.5" strokeWidth={2} aria-hidden />
                      Edit
                    </button>
                    <button
                      type="button"
                      className={`${ui.btnDanger} ml-2`}
                      onClick={async () => {
                        if (!window.confirm(`Delete center "${r.name}"?`)) return
                        try {
                          await api(`/centers/${r.id}`, { method: 'DELETE' })
                          await load()
                          toastSuccess(`Center “${r.name}” deleted`)
                        } catch (err) {
                          toastError(err, 'Could not delete center')
                        }
                      }}
                    >
                      Delete
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className={`border-t border-slate-100 px-4 py-8 text-center text-sm ${ui.muted}`}>No centers.</p> : null}
      </div>

      {can('centers.manage') ? (
        <div className={ui.card}>
          <h2 className="text-lg font-semibold text-slate-900">Weekday → department routing</h2>
          <p className={`mt-1 text-sm ${ui.muted}`}>
            On registration, the visit&apos;s department is set from the visit date&apos;s weekday. Used for day-based
            OPD allocation.
          </p>
          <label className={`mt-4 flex max-w-md flex-col gap-1 text-xs font-medium text-slate-600`}>
            Center
            <select
              className={ui.select}
              value={routeCenterId === '' ? '' : String(routeCenterId)}
              onChange={(e) => setRouteCenterId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">Select</option>
              {rows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.city}
                </option>
              ))}
            </select>
          </label>
          {routeCenterId !== '' ? (
            <div className="mt-4 space-y-2">
              {WEEKDAY_LABELS.map((label, w) => (
                <div key={w} className="flex flex-wrap items-center gap-3">
                  <span className="w-12 text-sm font-medium text-slate-700">{label}</span>
                  <select
                    className={`${ui.select} min-w-[220px] flex-1`}
                    value={routeDeptByWeekday[w] === '' || routeDeptByWeekday[w] === undefined ? '' : String(routeDeptByWeekday[w])}
                    onChange={(e) =>
                      setRouteDeptByWeekday((m) => ({
                        ...m,
                        [w]: e.target.value === '' ? '' : Number(e.target.value),
                      }))
                    }
                  >
                    <option value="">— None —</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <button
                type="button"
                className={`${ui.btnPrimary} mt-4`}
                onClick={async () => {
                  try {
                    const body: { weekday: number; department_id: number }[] = []
                    for (let w = 0; w <= 6; w++) {
                      const id = routeDeptByWeekday[w]
                      if (id !== '' && id !== undefined) body.push({ weekday: w, department_id: id as number })
                    }
                    await api(`/centers/${routeCenterId}/weekday-routes`, {
                      method: 'PUT',
                      body: JSON.stringify(body),
                    })
                    await loadWeekdayRoutes(routeCenterId)
                    toastSuccess('Weekday routing saved')
                  } catch (err) {
                    toastError(err, 'Could not save routing')
                  }
                }}
              >
                Save routing
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {edit ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setEdit(null)}
        >
          <div className={`${ui.card} z-10 w-full max-w-lg shadow-xl`} role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900">Edit center</h2>
            <form
              className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault()
                try {
                  await api(`/centers/${edit.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      name: edit.name,
                      city: edit.city,
                      address: edit.address ?? null,
                      status: edit.status,
                    }),
                  })
                  setEdit(null)
                  await load()
                  toastSuccess('Center updated')
                } catch (err) {
                  toastError(err, 'Could not update center')
                }
              }}
            >
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 md:col-span-2">
                Name
                <input className={ui.input} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                City
                <input className={ui.input} value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} required />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Status
                <select className={ui.select} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 md:col-span-2">
                Address
                <input className={ui.input} value={edit.address ?? ''} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
              </label>
              <div className="flex justify-end gap-2 md:col-span-2">
                <button type="button" className={ui.btnSecondary} onClick={() => setEdit(null)}>
                  Cancel
                </button>
                <button type="submit" className={ui.btnPrimary}>
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
