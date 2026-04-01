import { useEffect, useState } from 'react'
import { UserPlus, Pencil, RefreshCw, Eye, EyeOff } from 'lucide-react'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { ui } from '../../ui/classes'

type UserRow = {
  id: number
  username: string
  email: string | null
  phone: string | null
  role: string
  status: string
}

type RoleRow = { id: number; name: string }
const statuses = ['Active', 'Inactive', 'Suspended'] as const

export function UsersPage() {
  const { can } = useAuth()
  const [rows, setRows] = useState<UserRow[]>([])
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [roleName, setRoleName] = useState('receptionist')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [edit, setEdit] = useState<UserRow | null>(null)
  const [editRole, setEditRole] = useState('receptionist')
  const [editStatus, setEditStatus] = useState<(typeof statuses)[number]>('Active')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')

  async function load() {
    const [users, roleRows] = await Promise.all([api<UserRow[]>('/users'), api<RoleRow[]>('/rbac/roles')])
    setRows(users)
    const staffRoles = roleRows.filter((r) => r.name !== 'patient')
    setRoles(staffRoles)
    if (staffRoles.length && !staffRoles.some((r) => r.name === roleName)) {
      setRoleName(staffRoles[0].name)
    }
  }

  useEffect(() => {
    if (can('users.manage')) void load().catch((e) => setErr(String(e)))
  }, [can])

  useEffect(() => {
    if (!edit) return
    setEditRole(edit.role)
    const s = edit.status as (typeof statuses)[number]
    setEditStatus(statuses.includes(s) ? s : 'Active')
    setEditEmail(edit.email ?? '')
    setEditPhone(edit.phone ?? '')
  }, [edit])

  if (!can('users.manage')) {
    return <p className={ui.muted}>No access.</p>
  }

  return (
    <div className={`space-y-8 ${ui.page}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={ui.h1}>Users</h1>
          <p className={`mt-1 max-w-xl text-sm ${ui.muted}`}>Create staff accounts and update roles or status.</p>
        </div>
        <button type="button" className={ui.btnSecondary} onClick={() => void load()}>
          <RefreshCw className="size-4" strokeWidth={2} aria-hidden />
          Refresh
        </button>
      </div>

      <div className={ui.card}>
        <div className="mb-4 flex items-center gap-2 text-slate-900">
          <UserPlus className="size-5 text-cyan-600" strokeWidth={2} aria-hidden />
          <h2 className="text-lg font-semibold">Create staff user</h2>
        </div>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            setErr(null)
            setBusy(true)
            try {
              await api('/users', {
                method: 'POST',
                body: JSON.stringify({ username, password, role_name: roleName }),
              })
              setUsername('')
              setPassword('')
              await load()
            } catch (e) {
              setErr(String(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Username
            <input
              className={ui.input}
              placeholder="jdoe"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Password
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className={`${ui.input} pr-10`}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Role
            <select className={ui.select} value={roleName} onChange={(e) => setRoleName(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={ui.btnPrimary} disabled={busy}>
            {busy ? 'Saving…' : 'Create user'}
          </button>
        </form>
      </div>

      {err ? <div className={ui.alertError}>{err}</div> : null}

      <div className={ui.tableWrap}>
        <table className="min-w-full border-collapse text-left">
          <thead>
            <tr>
              <th className={ui.th}>ID</th>
              <th className={ui.th}>Username</th>
              <th className={ui.th}>Email</th>
              <th className={ui.th}>Phone</th>
              <th className={ui.th}>Role</th>
              <th className={ui.th}>Status</th>
              <th className={`${ui.th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={ui.trHover}>
                <td className={ui.td} data-label="ID">
                  {r.id}
                </td>
                <td className={`${ui.td} font-medium text-slate-900`} data-label="Username">
                  {r.username}
                </td>
                <td className={`${ui.td} text-slate-600`} data-label="Email">
                  {r.email ?? '—'}
                </td>
                <td className={`${ui.td} text-slate-600`} data-label="Phone">
                  {r.phone ?? '—'}
                </td>
                <td className={ui.td} data-label="Role">
                  <span className={ui.badge}>{r.role}</span>
                </td>
                <td className={ui.td} data-label="Status">
                  <span className={r.status === 'Active' ? ui.badgeOk : ui.badgeWarn}>{r.status}</span>
                </td>
                <td className={`${ui.td} text-right`} data-label="Actions">
                  <button
                    type="button"
                    className={`${ui.btnGhost} ml-auto`}
                    onClick={() => setEdit(r)}
                  >
                    <Pencil className="size-3.5" strokeWidth={2} aria-hidden />
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`${ui.btnDanger} ml-2`}
                    onClick={async () => {
                      if (!window.confirm(`Delete user "${r.username}"?`)) return
                      setErr(null)
                      setBusy(true)
                      try {
                        await api(`/users/${r.id}`, { method: 'DELETE' })
                        await load()
                      } catch (e) {
                        setErr(String(e))
                      } finally {
                        setBusy(false)
                      }
                    }}
                    disabled={busy}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? (
          <p className={`border-t border-slate-100 px-4 py-8 text-center text-sm ${ui.muted}`}>No users yet.</p>
        ) : null}
      </div>

      {edit ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setEdit(null)}
        >
          <div
            className={`${ui.card} z-10 max-h-[90vh] w-full max-w-md overflow-y-auto shadow-xl`}
            role="dialog"
            aria-modal
            aria-labelledby="edit-user-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="edit-user-title" className="text-lg font-semibold text-slate-900">
              Edit user
            </h2>
            <p className={`mt-1 text-sm ${ui.muted}`}>{edit.username}</p>
            <form
              className="mt-6 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault()
                setErr(null)
                setBusy(true)
                try {
                  await api(`/users/${edit.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      role_name: editRole,
                      status: editStatus,
                      email: editEmail.trim() || null,
                      phone: editPhone.trim() || null,
                    }),
                  })
                  setEdit(null)
                  await load()
                } catch (err) {
                  setErr(String(err))
                } finally {
                  setBusy(false)
                }
              }}
            >
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Role
                <select className={ui.select} value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                  {roles.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Status
                <select className={ui.select} value={editStatus} onChange={(e) => setEditStatus(e.target.value as typeof editStatus)}>
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Email
                <input className={ui.input} type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Phone
                <input className={ui.input} value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
              </label>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button type="button" className={ui.btnSecondary} onClick={() => setEdit(null)}>
                  Cancel
                </button>
                <button type="submit" className={ui.btnPrimary} disabled={busy}>
                  Save changes
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
