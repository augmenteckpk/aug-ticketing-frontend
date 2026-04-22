import { todayLocalYmd } from './local-date';

/** Minimal user fields for list/dashboard scope (avoid circular imports with AuthService). */
export type ConsoleUserScope = {
  role?: string | null;
  opd_center_id?: number | null;
  opd_id?: number | null;
};

export function consoleIsAdmin(user: ConsoleUserScope | null | undefined): boolean {
  return user?.role === 'admin';
}

/** Date sent to list/report APIs: staff always today (local). */
export function listDateForRequest(user: ConsoleUserScope | null | undefined, adminPicks: string): string {
  return consoleIsAdmin(user) ? adminPicks : todayLocalYmd();
}

/** Center id for APIs that still use center_id: staff uses OPD’s center. */
export function listCenterIdForRequest(user: ConsoleUserScope | null | undefined, adminPicks: number | ''): number | '' {
  if (consoleIsAdmin(user)) return adminPicks;
  const c = user?.opd_center_id;
  return c != null ? c : '';
}

export function adminOpdQueryParam(filterOpdId: number | ''): string {
  if (filterOpdId === '') return '';
  return `opd_id=${encodeURIComponent(String(filterOpdId))}`;
}

export function centerIdFromOpd(
  opds: Array<{ id: number; center_id: number }>,
  opdId: number | '',
): number | '' {
  if (opdId === '') return '';
  const o = opds.find((x) => x.id === opdId);
  return o?.center_id ?? '';
}
