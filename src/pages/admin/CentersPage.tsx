import { useEffect, useState } from 'react'
import { MapPin, Pencil, Plus, RefreshCw } from 'lucide-react'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
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

export function CentersPage() {
  const { can } = useAuth()
  const [hospitals, setHospitals] = useState<Hospital[]>([])
  const [rows, setRows] = useState<Center[]>([])
  const [hospitalId, setHospitalId] = useState(1)
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [edit, setEdit] = useState<Center | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    const [h, c] = await Promise.all([api<Hospital[]>('/hospitals'), api<Center[]>('/centers')])
    setHospitals(h)
    setRows(c)
    if (h[0]) setHospitalId(h[0].id)
  }

  useEffect(() => {
    if (can('centers.read')) void load().catch((e) => setErr(String(e)))
  }, [can])

  if (!can('centers.read')) {
    return <p className={ui.muted}>No access.</p>
  }

  return (
    <div className={`space-y-8 ${ui.page}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={ui.h1}>Centers</h1>
          <p className={`mt-1 text-sm ${ui.muted}`}>OPD centers linked to hospitals.</p>
        </div>
        <button type="button" className={ui.btnSecondary} onClick={() => void load().catch((e) => setErr(String(e)))}>
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
              setErr(null)
              try {
                await api('/centers', {
                  method: 'POST',
                  body: JSON.stringify({ hospital_id: hospitalId, name, city, address: address || null }),
                })
                setName('')
                setCity('')
                setAddress('')
                await load()
              } catch (e) {
                setErr(String(e))
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

      {err ? <div className={ui.alertError}>{err}</div> : null}

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
                        setErr(null)
                        try {
                          await api(`/centers/${r.id}`, { method: 'DELETE' })
                          await load()
                        } catch (e) {
                          setErr(String(e))
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
                setErr(null)
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
                } catch (x) {
                  setErr(String(x))
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
