import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, Plus, RefreshCw, Shield } from 'lucide-react'
import { SpeechInput } from '../../components/speech'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { toastError, toastSuccess } from '../../lib/toast'
import { ui } from '../../ui/classes'

type Role = { id: number; name: string; description: string | null; permissions: string[] }
type Permission = { id: number; module: string; name: string; description: string | null }

export function RolesPage() {
  const { can } = useAuth()
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])
  const [edit, setEdit] = useState<Role | null>(null)
  const [editPermissions, setEditPermissions] = useState<string[]>([])
  const [expanded, setExpanded] = useState<number | null>(null)
  const canManage = can('roles.manage') || can('users.manage')

  const groupedPermissions = useMemo(() => {
    const map = new Map<string, Permission[]>()
    for (const p of permissions) {
      const list = map.get(p.module) ?? []
      list.push(p)
      map.set(p.module, list)
    }
    return [...map.entries()]
  }, [permissions])

  function togglePermission(current: string[], name: string) {
    return current.includes(name) ? current.filter((p) => p !== name) : [...current, name]
  }

  async function load() {
    const [r, p] = await Promise.all([api<Role[]>('/rbac/roles'), api<Permission[]>('/rbac/permissions')])
    setRoles(r)
    setPermissions(p)
  }

  useEffect(() => {
    if (!can('roles.read')) return
    void load().catch((e) => toastError(e, 'Failed to load roles'))
  }, [can])

  if (!can('roles.read')) {
    return <p className={ui.muted}>No access.</p>
  }

  return (
    <div className={`space-y-8 ${ui.page}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={ui.h1}>Roles & permissions</h1>
          <p className={`mt-1 max-w-xl text-sm ${ui.muted}`}>
            RBAC roles defined in the system. Expand a row to see permission codes.
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

      {canManage ? (
        <div className={ui.card}>
          <div className="mb-4 flex items-center gap-2 text-slate-900">
            <Plus className="size-5 text-red-600" strokeWidth={2} aria-hidden />
            <h2 className="text-lg font-semibold">Create role</h2>
          </div>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              try {
                await api('/rbac/roles', {
                  method: 'POST',
                  body: JSON.stringify({
                    name,
                    description: description || null,
                    permissions: selectedPermissions,
                  }),
                })
                setName('')
                setDescription('')
                setSelectedPermissions([])
                await load()
                toastSuccess('Role created')
              } catch (err) {
                toastError(err, 'Could not create role')
              }
            }}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Role name
                <SpeechInput className={ui.input} placeholder="lab_manager" value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Description
                <SpeechInput className={ui.input} value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Permissions</p>
              <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                {groupedPermissions.map(([module, list]) => (
                  <div key={module}>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{module}</p>
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {list.map((p) => (
                        <label key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-white">
                          <input
                            type="checkbox"
                            checked={selectedPermissions.includes(p.name)}
                            onChange={() => setSelectedPermissions((prev) => togglePermission(prev, p.name))}
                          />
                          <span className="text-xs text-slate-700">{p.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button type="submit" className={ui.btnPrimary}>
              Create role
            </button>
          </form>
        </div>
      ) : null}

      <div className={ui.tableWrap}>
        <table className="min-w-full border-collapse text-left">
          <thead>
            <tr>
              <th className={`${ui.th} w-10`} aria-label="Expand" />
              <th className={ui.th}>Role</th>
              <th className={ui.th}>Description</th>
              <th className={`${ui.th} text-right`}>Permissions</th>
              {canManage ? <th className={`${ui.th} text-right`}>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => {
              const open = expanded === r.id
              return (
                <Fragment key={r.id}>
                  <tr className={ui.trHover}>
                    <td className={ui.td}>
                      <button
                        type="button"
                        className="rounded-lg p-1 text-slate-600 hover:bg-slate-100"
                        aria-expanded={open}
                        onClick={() => setExpanded(open ? null : r.id)}
                      >
                        {open ? (
                          <ChevronDown className="size-5" strokeWidth={2} aria-hidden />
                        ) : (
                          <ChevronRight className="size-5" strokeWidth={2} aria-hidden />
                        )}
                      </button>
                    </td>
                    <td className={`${ui.td} font-medium capitalize text-slate-900`}>
                      <span className="inline-flex items-center gap-2">
                        <Shield className="size-4 text-red-600" strokeWidth={2} aria-hidden />
                        {r.name.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className={`${ui.td} text-slate-600`}>{r.description ?? '—'}</td>
                    <td className={`${ui.td} text-right tabular-nums text-slate-700`}>{r.permissions.length}</td>
                    {canManage ? (
                      <td className={`${ui.td} text-right`}>
                        <button
                          type="button"
                          className={ui.btnGhost}
                          onClick={() => {
                            setEdit(r)
                            setEditPermissions(r.permissions)
                          }}
                        >
                          <Pencil className="size-3.5" strokeWidth={2} aria-hidden />
                          Edit
                        </button>
                        <button
                          type="button"
                          className={`${ui.btnDanger} ml-2`}
                          onClick={async () => {
                            if (!window.confirm(`Delete role "${r.name}"?`)) return
                            try {
                              await api(`/rbac/roles/${r.id}`, { method: 'DELETE' })
                              await load()
                              toastSuccess(`Role “${r.name}” deleted`)
                            } catch (err) {
                              toastError(err, 'Could not delete role')
                            }
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    ) : null}
                  </tr>
                  {open ? (
                    <tr className="bg-slate-50/80">
                      <td colSpan={canManage ? 5 : 4} className="border-b border-slate-100 px-4 py-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Permission keys</p>
                        <div className="flex flex-wrap gap-2">
                          {r.permissions.map((p) => (
                            <code
                              key={p}
                              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
                            >
                              {p}
                            </code>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {!roles.length ? (
          <p className={`border-t border-slate-100 px-4 py-8 text-center text-sm ${ui.muted}`}>No roles loaded.</p>
        ) : null}
      </div>

      {edit ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setEdit(null)}
        >
          <div className={`${ui.card} z-10 w-full max-w-2xl shadow-xl`} role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900">Edit role</h2>
            <form
              className="mt-5 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault()
                try {
                  await api(`/rbac/roles/${edit.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      name: edit.name,
                      description: edit.description,
                      permissions: editPermissions,
                    }),
                  })
                  setEdit(null)
                  await load()
                  toastSuccess('Role updated')
                } catch (err) {
                  toastError(err, 'Could not update role')
                }
              }}
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Name
                  <SpeechInput className={ui.input} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Description
                  <SpeechInput className={ui.input} value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
                </label>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Permissions</p>
                <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                  {groupedPermissions.map(([module, list]) => (
                    <div key={module}>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{module}</p>
                      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                        {list.map((p) => (
                          <label key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-white">
                            <input
                              type="checkbox"
                              checked={editPermissions.includes(p.name)}
                              onChange={() => setEditPermissions((prev) => togglePermission(prev, p.name))}
                            />
                            <span className="text-xs text-slate-700">{p.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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


