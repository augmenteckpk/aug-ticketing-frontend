import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  Calendar,
  ClipboardList,
  Activity,
  Layers,
  Building2,
  MapPin,
  Stethoscope,
  NotebookPen,
  FlaskConical,
  Users,
  Shield,
  LogOut,
  BarChart3,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

type NavItem = { to: string; label: string; perm?: string; icon: typeof LayoutDashboard }

const nav: NavItem[] = [
  { to: '/app', label: 'Dashboard', perm: 'dashboard.read', icon: LayoutDashboard },
  { to: '/app/appointments', label: 'Appointments', perm: 'appointments.read', icon: Calendar },
  { to: '/app/reports', label: 'Reports', perm: 'reports.read', icon: BarChart3 },
  {
    to: '/app/registration',
    label: 'Registration',
    perm: 'appointments.register',
    icon: ClipboardList,
  },
  {
    to: '/app/waiting-area',
    label: 'Waiting area (vitals)',
    perm: 'appointments.pre_assessment',
    icon: Activity,
  },
  {
    to: '/app/consultation',
    label: 'Consultation',
    perm: 'appointments.consult',
    icon: NotebookPen,
  },
  {
    to: '/app/laboratory',
    label: 'Laboratory',
    perm: 'lab.read',
    icon: FlaskConical,
  },
  { to: '/app/queue', label: 'Queue & batches', perm: 'queue.read', icon: Layers },
  { to: '/app/hospitals', label: 'Hospitals', perm: 'hospitals.read', icon: Building2 },
  { to: '/app/centers', label: 'Centers', perm: 'centers.read', icon: MapPin },
  { to: '/app/departments', label: 'Departments', perm: 'departments.read', icon: Stethoscope },
  { to: '/app/users', label: 'Users', perm: 'users.manage', icon: Users },
  { to: '/app/roles', label: 'Roles', perm: 'roles.read', icon: Shield },
]

export function Layout() {
  const { user, logout, can } = useAuth()

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <div className="flex items-center gap-2 text-cyan-600">
            <img src="/siut-logo.jpg" alt="SIUT Logo" className="size-15 shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">OPD Ticketing</span>
          </div>
          <div className="mt-2 text-lg font-semibold tracking-tight text-slate-900">Staff console</div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            HIS — token → registration → triage → queue → consultation → lab / complete
          </p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
          {nav.map((item) => {
            if (item.perm && !can(item.perm)) return null
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/app'}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-cyan-50 text-cyan-800 shadow-[inset_0_0_0_1px_rgba(6,182,212,0.25)]'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  ].join(' ')
                }
              >
                <Icon className="size-[18px] shrink-0 opacity-90" strokeWidth={2} aria-hidden />
                {item.label}
              </NavLink>
            )
          })}
        </nav>
        <div className="border-t border-slate-100 p-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-sm font-medium text-slate-900">{user?.username}</div>
            <div className="mt-0.5 text-xs capitalize text-slate-500">{user?.role?.replace('_', ' ')}</div>
            <button
              type="button"
              onClick={logout}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              <LogOut className="size-4" strokeWidth={2} aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl p-6 md:p-10">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
