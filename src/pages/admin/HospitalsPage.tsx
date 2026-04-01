import { useEffect, useState } from 'react'
import { Building2, Pencil, Plus, RefreshCw } from 'lucide-react'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { ui } from '../../ui/classes'

type Row = { id: number; name: string; code: string; status: string }

export function HospitalsPage() {
  const { can } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [edit, setEdit] = useState<Row | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    const data = await api<Row[]>('/hospitals')
    setRows(data)
  }

  useEffect(() => {
    if (can('hospitals.read')) void load().catch((e) => setErr(String(e)))
  }, [can])

  if (!can('hospitals.read')) {
    return <p className={ui.muted}>No access.</p>
  }

  return (
    <div className={`space-y-8 ${ui.page}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={ui.h1}>Hospitals</h1>
          <p className={`mt-1 text-sm ${ui.muted}`}>Register hospital sites and codes.</p>
        </div>
        <button type="button" className={ui.btnSecondary} onClick={() => void load().catch((e) => setErr(String(e)))}>
          <RefreshCw className="size-4" strokeWidth={2} aria-hidden />
          Refresh
        </button>
      </div>

      {can('hospitals.manage') ? (
        <div className={ui.card}>
          <div className="mb-4 flex items-center gap-2 text-slate-900">
            <Plus className="size-5 text-cyan-600" strokeWidth={2} aria-hidden />
            <h2 className="text-lg font-semibold">Add hospital</h2>
          </div>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={async (e) => {
              e.preventDefault()
              setErr(null)
              try {
                await api('/hospitals', { method: 'POST', body: JSON.stringify({ name, code }) })
                setName('')
                setCode('')
                await load()
              } catch (e) {
                setErr(String(e))
              }
            }}
          >
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Name
              <input className={ui.input} placeholder="General Hospital" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Code
              <input className={ui.input} placeholder="GH-01" value={code} onChange={(e) => setCode(e.target.value)} required />
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
              <th className={ui.th}>Name</th>
              <th className={ui.th}>Code</th>
              <th className={ui.th}>Status</th>
              {can('hospitals.manage') ? <th className={`${ui.th} text-right`}>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={ui.trHover}>
                <td className={ui.td}>{r.id}</td>
                <td className={`${ui.td} font-medium text-slate-900`}>
                  <span className="inline-flex items-center gap-2">
                    <Building2 className="size-4 text-slate-400" strokeWidth={2} aria-hidden />
                    {r.name}
                  </span>
                </td>
                <td className={ui.td}>
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{r.code}</code>
                </td>
                <td className={ui.td}>
                  <span className={r.status === 'Active' ? ui.badgeOk : ui.badge}>{r.status}</span>
                </td>
                {can('hospitals.manage') ? (
                  <td className={`${ui.td} text-right`}>
                    <button type="button" className={ui.btnGhost} onClick={() => setEdit(r)}>
                      <Pencil className="size-3.5" strokeWidth={2} aria-hidden />
                      Edit
                    </button>
                    <button
                      type="button"
                      className={`${ui.btnDanger} ml-2`}
                      onClick={async () => {
                        if (!window.confirm(`Delete hospital "${r.name}"?`)) return
                        setErr(null)
                        try {
                          await api(`/hospitals/${r.id}`, { method: 'DELETE' })
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
        {!rows.length ? <p className={`border-t border-slate-100 px-4 py-8 text-center text-sm ${ui.muted}`}>No hospitals.</p> : null}
      </div>

      {edit ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setEdit(null)}
        >
          <div
            className={`${ui.card} z-10 w-full max-w-md shadow-xl`}
            role="dialog"
            aria-modal
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900">Edit hospital</h2>
            <form
              className="mt-5 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault()
                setErr(null)
                try {
                  await api(`/hospitals/${edit.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      name: edit.name,
                      code: edit.code,
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
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Name
                <input className={ui.input} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Code
                <input className={ui.input} value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} required />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Status
                <select className={ui.select} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </label>
              <div className="flex justify-end gap-2">
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
