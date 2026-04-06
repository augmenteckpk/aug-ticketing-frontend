import { useEffect, useState } from 'react'
import { Pencil, Plus, RefreshCw } from 'lucide-react'
import { SpeechInput } from '../../components/speech'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { toastError, toastSuccess } from '../../lib/toast'
import { ui } from '../../ui/classes'

type Department = {
  id: number
  name: string
  description: string | null
  status: string
}

export function DepartmentsPage() {
  const { can } = useAuth()
  const [rows, setRows] = useState<Department[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [edit, setEdit] = useState<Department | null>(null)

  async function load() {
    const data = await api<Department[]>('/departments')
    setRows(data)
  }

  useEffect(() => {
    if (can('departments.read')) void load().catch((e) => toastError(e, 'Failed to load departments'))
  }, [can])

  if (!can('departments.read')) return <p className={ui.muted}>No department permission.</p>

  return (
    <div className={`space-y-8 ${ui.page}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={ui.h1}>Departments</h1>
          <p className={`mt-1 text-sm ${ui.muted}`}>Manage OPD departments assignable to bookings.</p>
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

      {can('departments.manage') ? (
        <div className={ui.card}>
          <div className="mb-4 flex items-center gap-2">
            <Plus className="size-5 text-cyan-700" strokeWidth={2} aria-hidden />
            <h2 className="text-base font-semibold text-slate-900">Add department</h2>
          </div>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={async (e) => {
              e.preventDefault()
              try {
                await api('/departments', {
                  method: 'POST',
                  body: JSON.stringify({ name, description: description || null }),
                })
                setName('')
                setDescription('')
                await load()
                toastSuccess('Department created')
              } catch (err) {
                toastError(err, 'Could not create department')
              }
            }}
          >
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Name
              <SpeechInput className={ui.input} value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="flex min-w-[260px] flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
              Description
              <SpeechInput className={ui.input} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <button type="submit" className={ui.btnPrimary}>
              Create
            </button>
          </form>
        </div>
      ) : null}

      <div className={ui.tableWrap}>
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              <th className={ui.th}>ID</th>
              <th className={ui.th}>Name</th>
              <th className={ui.th}>Description</th>
              <th className={ui.th}>Status</th>
              {can('departments.manage') ? <th className={`${ui.th} text-right`}>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={ui.trHover}>
                <td className={ui.td}>{r.id}</td>
                <td className={`${ui.td} font-medium text-slate-900`}>{r.name}</td>
                <td className={`${ui.td} text-slate-600`}>{r.description ?? '—'}</td>
                <td className={ui.td}>
                  <span className={r.status === 'Active' ? ui.badgeOk : ui.badge}>{r.status}</span>
                </td>
                {can('departments.manage') ? (
                  <td className={`${ui.td} text-right`}>
                    <button type="button" className={ui.btnGhost} onClick={() => setEdit(r)}>
                      <Pencil className="size-3.5" strokeWidth={2} aria-hidden />
                      Edit
                    </button>
                    <button
                      type="button"
                      className={`${ui.btnDanger} ml-2`}
                      onClick={async () => {
                        if (!window.confirm(`Delete department "${r.name}"?`)) return
                        try {
                          await api(`/departments/${r.id}`, { method: 'DELETE' })
                          await load()
                          toastSuccess(`Department “${r.name}” deleted`)
                        } catch (err) {
                          toastError(err, 'Could not delete department')
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
      </div>

      {edit ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setEdit(null)}
        >
          <div className={`${ui.card} z-10 w-full max-w-md shadow-xl`} role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900">Edit department</h2>
            <form
              className="mt-5 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault()
                try {
                  await api(`/departments/${edit.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      name: edit.name,
                      description: edit.description,
                      status: edit.status,
                    }),
                  })
                  setEdit(null)
                  await load()
                  toastSuccess('Department updated')
                } catch (err) {
                  toastError(err, 'Could not update department')
                }
              }}
            >
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Name
                <SpeechInput className={ui.input} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Description
                <SpeechInput className={ui.input} value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
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
