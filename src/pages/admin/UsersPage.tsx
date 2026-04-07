import { useEffect, useState } from 'react'
import { UserPlus, Pencil, RefreshCw, Eye, EyeOff } from 'lucide-react'
import { SpeechInput } from '../../components/speech'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { toastError, toastSuccess } from '../../lib/toast'
import { ui } from '../../ui/classes'
import { FieldError } from '../../components/FieldError'
import { optionalEmail, optionalPhone, registerPassword, registerUsername } from '../../lib/fieldValidation'

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
  const [roleName, setRoleName] = useState('registration_clerk')
  const [busy, setBusy] = useState(false)

  const [edit, setEdit] = useState<UserRow | null>(null)
  const [editRole, setEditRole] = useState('registration_clerk')
  const [editStatus, setEditStatus] = useState<(typeof statuses)[number]>('Active')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [createErr, setCreateErr] = useState<Partial<Record<'username' | 'password', string>>>({})
  const [editContactErr, setEditContactErr] = useState<Partial<Record<'email' | 'phone', string>>>({})

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
    if (can('users.manage')) void load().catch((e) => toastError(e, 'Failed to load users'))
  }, [can])

  useEffect(() => {
    if (!edit) return
    setEditRole(edit.role)
    const s = edit.status as (typeof statuses)[number]
    setEditStatus(statuses.includes(s) ? s : 'Active')
    setEditEmail(edit.email ?? '')
    setEditPhone(edit.phone ?? '')
    setEditContactErr({})
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

      <div className={ui.card}>
        <div className="mb-4 flex items-center gap-2 text-slate-900">
          <UserPlus className="size-5 text-cyan-600" strokeWidth={2} aria-hidden />
          <h2 className="text-lg font-semibold">Create staff user</h2>
        </div>
        <form
          className="flex flex-wrap items-end gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            const ce: Partial<Record<'username' | 'password', string>> = {}
            const u = registerUsername(username)
            if (!u.ok) ce.username = u.message
            const pw = registerPassword(password)
            if (!pw.ok) ce.password = pw.message
            setCreateErr(ce)
            if (Object.keys(ce).length) return
            setBusy(true)
            try {
              const createdAs = username
              await api('/users', {
                method: 'POST',
                body: JSON.stringify({ username, password, role_name: roleName }),
              })
              setUsername('')
              setPassword('')
              setCreateErr({})
              await load()
              toastSuccess(`User “${createdAs}” created`)
            } catch (err) {
              toastError(err, 'Could not create user')
            } finally {
              setBusy(false)
            }
          }}
        >
          <label className="flex min-w-[140px] flex-col gap-1 text-xs font-medium text-slate-600">
            Username
            <SpeechInput
              className={ui.input}
              shellClassName={createErr.username ? '!border-red-400 ring-1 ring-red-400' : ''}
              placeholder="jdoe"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                if (createErr.username) setCreateErr((c) => ({ ...c, username: undefined }))
              }}
              required
              aria-invalid={createErr.username ? true : undefined}
            />
            <FieldError message={createErr.username} />
          </label>
          <label className="flex min-w-[160px] flex-col gap-1 text-xs font-medium text-slate-600">
            Password
            <div className="relative">
              <SpeechInput
                type={showPassword ? 'text' : 'password'}
                className={`${ui.input} pr-10`}
                shellClassName={createErr.password ? '!border-red-400 ring-1 ring-red-400' : ''}
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (createErr.password) setCreateErr((c) => ({ ...c, password: undefined }))
                }}
                required
                aria-invalid={createErr.password ? true : undefined}
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
            <FieldError message={createErr.password} />
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
          <button type="submit" className={`${ui.btnPrimary} self-end`} disabled={busy}>
            {busy ? 'Saving…' : 'Create user'}
          </button>
        </form>
      </div>

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
                      setBusy(true)
                      try {
                        await api(`/users/${r.id}`, { method: 'DELETE' })
                        await load()
                        toastSuccess(`User “${r.username}” deleted`)
                      } catch (err) {
                        toastError(err, 'Could not delete user')
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
                const cnt: Partial<Record<'email' | 'phone', string>> = {}
                const em = optionalEmail(editEmail)
                if (!em.ok) cnt.email = em.message
                const ph = optionalPhone(editPhone)
                if (!ph.ok) cnt.phone = ph.message
                setEditContactErr(cnt)
                if (Object.keys(cnt).length) return
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
                  toastSuccess('User updated')
                } catch (err) {
                  toastError(err, 'Could not update user')
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
                <SpeechInput
                  className={ui.input}
                  type="email"
                  shellClassName={editContactErr.email ? '!border-red-400 ring-1 ring-red-400' : ''}
                  value={editEmail}
                  onChange={(e) => {
                    setEditEmail(e.target.value)
                    if (editContactErr.email) setEditContactErr((c) => ({ ...c, email: undefined }))
                  }}
                  aria-invalid={editContactErr.email ? true : undefined}
                />
                <FieldError message={editContactErr.email} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Phone
                <SpeechInput
                  className={ui.input}
                  shellClassName={editContactErr.phone ? '!border-red-400 ring-1 ring-red-400' : ''}
                  value={editPhone}
                  onChange={(e) => {
                    setEditPhone(e.target.value)
                    if (editContactErr.phone) setEditContactErr((c) => ({ ...c, phone: undefined }))
                  }}
                  aria-invalid={editContactErr.phone ? true : undefined}
                />
                <FieldError message={editContactErr.phone} />
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
