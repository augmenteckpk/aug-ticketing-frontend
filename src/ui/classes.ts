/** Shared Tailwind class strings for light staff UI */
export const ui = {
  page: 'text-slate-900',
  muted: 'text-slate-600',
  subtle: 'text-slate-500',
  h1: 'text-2xl font-semibold tracking-tight text-slate-900',
  card: 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm',
  cardMuted: 'rounded-xl border border-slate-200 bg-slate-50/80 p-5',
  input:
    'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500',
  select:
    'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500',
  btnPrimary:
    'inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-cyan-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 disabled:opacity-50',
  btnSecondary:
    'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50',
  btnDanger:
    'inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50',
  btnGhost:
    'inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium text-cyan-700 hover:bg-cyan-50',
  tableWrap: 'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm',
  th: 'border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600',
  td: 'border-b border-slate-100 px-4 py-3 text-sm text-slate-800',
  trHover: 'hover:bg-slate-50/80',
  badge:
    'inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700',
  badgeOk: 'inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800',
  badgeWarn: 'inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900',
  alertError: 'rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800',
} as const
