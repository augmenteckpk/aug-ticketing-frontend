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
  Layers2,
  NotebookPen,
  FlaskConical,
  Users,
  UserCircle2,
  Shield,
  LogOut,
  BarChart3,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

type NavItem = {
  to: string
  label: string
  description?: string
  perm?: string
  icon: LucideIcon
}

type NavSection = {
  id: string
  title: string
  /** Shown under section title in sidebar */
  subtitle?: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    id: 'overview',
    title: 'Overview',
    subtitle: 'Summaries & exports',
    items: [
      { to: '/app', label: 'Dashboard', perm: 'dashboard.read', icon: LayoutDashboard },
      { to: '/app/reports', label: 'Reporting', perm: 'reports.read', icon: BarChart3 },
    ],
  },
  {
    id: 'opd',
    title: 'OPD workflow',
    subtitle: 'In patient-visit order',
    items: [
      {
        to: '/app/appointments',
        label: 'Tokens & appointments',
        description: 'Issue walk-in token; filter visits',
        perm: 'appointments.read',
        icon: Calendar,
      },
      {
        to: '/app/registration',
        label: 'Registration desk',
        description: 'Demographics & W number',
        perm: 'appointments.register',
        icon: ClipboardList,
      },
      {
        to: '/app/waiting-area',
        label: 'Waiting area',
        description: 'Pre-assessment vitals',
        perm: 'appointments.pre_assessment',
        icon: Activity,
      },
      {
        to: '/app/queue',
        label: 'Queue & batches',
        description: 'Ready pool → batches → dispatch',
        perm: 'queue.read',
        icon: Layers,
      },
      {
        to: '/app/consultation',
        label: 'Consultation',
        description: 'Doctor visit & outcomes',
        perm: 'appointments.consult',
        icon: NotebookPen,
      },
      {
        to: '/app/laboratory',
        label: 'Laboratory',
        description: 'Orders & results (staff)',
        perm: 'lab.read',
        icon: FlaskConical,
      },
    ],
  },
  {
    id: 'admin',
    title: 'Administration',
    subtitle: 'Locations & access',
    items: [
      { to: '/app/hospitals', label: 'Hospitals', perm: 'hospitals.read', icon: Building2 },
      { to: '/app/centers', label: 'Centers', perm: 'centers.read', icon: MapPin },
      { to: '/app/departments', label: 'Departments', perm: 'departments.read', icon: Stethoscope },
      { to: '/app/clinics', label: 'Clinics', description: 'OPD units by center', perm: 'departments.read', icon: Layers2 },
      {
        to: '/app/patients',
        label: 'Patients',
        description: 'Directory & demographics',
        perm: 'patients.read',
        icon: UserCircle2,
      },
      { to: '/app/users', label: 'Users', perm: 'users.manage', icon: Users },
      { to: '/app/roles', label: 'Roles & permissions', perm: 'roles.read', icon: Shield },
    ],
  },
]

export function Layout() {
  const { user, logout, can } = useAuth()

  return (
    <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[var(--app-canvas)] text-slate-900 antialiased">
      <aside className="flex h-full min-h-0 w-[272px] shrink-0 flex-col border-r border-slate-200/80 bg-white shadow-[4px_0_24px_-12px_rgba(15,23,42,0.12)]">
        <div className="shrink-0 border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-4 py-5">
          <div className="flex items-start gap-3">
            <img
              src="/siut-logo.jpg"
              alt=""
              className="h-11 w-11 shrink-0 rounded-lg object-cover ring-1 ring-slate-200/80"
            />
            <div className="min-w-0 pt-0.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                OPD ticketing
              </div>
              <div className="mt-0.5 text-base font-semibold leading-tight tracking-tight text-slate-900">
                Staff console
              </div>
            </div>
          </div>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-4 [scrollbar-gutter:stable]">
          {(() => {
            let firstBlock = true
            return navSections.map((section) => {
              const visible = section.items.filter((item) => !item.perm || can(item.perm))
              if (!visible.length) return null
              const isFirst = firstBlock
              firstBlock = false

              return (
              <div
                key={section.id}
                className={isFirst ? '' : 'mt-5 border-t border-slate-100 pt-5'}
              >
                <div className="px-2 pb-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                    {section.title}
                  </div>
                  {section.subtitle ? (
                    <div className="mt-0.5 text-[10px] leading-tight text-slate-400/90">{section.subtitle}</div>
                  ) : null}
                </div>
                <ul className="flex flex-col gap-0.5">
                  {visible.map((item) => {
                    const Icon = item.icon
                    return (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          end={item.to === '/app'}
                          title={item.description}
                          className={({ isActive }) =>
                            [
                              'group flex items-start gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition-colors',
                              isActive
                                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-900/15'
                                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
                            ].join(' ')
                          }
                        >
                          {({ isActive }) => (
                            <>
                              <Icon
                                className={[
                                  'mt-0.5 size-[18px] shrink-0',
                                  isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-700',
                                ].join(' ')}
                                strokeWidth={2}
                                aria-hidden
                              />
                              <span className="min-w-0 flex-1 leading-snug">
                                <span className="block font-medium">{item.label}</span>
                                {item.description ? (
                                  <span
                                    className={[
                                      'mt-0.5 block text-[11px] font-normal leading-tight',
                                      isActive ? 'text-cyan-100' : 'text-slate-500 group-hover:text-slate-600',
                                    ].join(' ')}
                                  >
                                    {item.description}
                                  </span>
                                ) : null}
                              </span>
                            </>
                          )}
                        </NavLink>
                      </li>
                    )
                  })}
                </ul>
              </div>
              )
            })
          })()}
        </nav>

        <div className="shrink-0 border-t border-slate-100 bg-slate-50/90 p-3">
          <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-3 shadow-sm">
            <div className="truncate text-sm font-semibold text-slate-900">{user?.username}</div>
            <div className="mt-0.5 truncate text-xs capitalize text-slate-500">
              {user?.role?.replace(/_/g, ' ')}
            </div>
            <button
              type="button"
              onClick={logout}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-white hover:text-slate-900"
            >
              <LogOut className="size-4 opacity-80" strokeWidth={2} aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
        <div className="mx-auto min-h-min max-w-7xl px-5 py-8 sm:px-8 md:py-10 lg:px-10">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
