import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { ConfirmService } from '../../../core/services/confirm';
import { ToastService } from '../../../core/services/toast';
import { Pagination } from '../../../ui-kit/pagination/pagination';
import { SpeechInput } from '../../../ui-kit/speech-input/speech-input';

type Hospital = { id: number; name: string };
type CenterWeekdayRoute = {
  weekday: number;
  department_id: number;
  department_name?: string;
  clinic_id?: number | null;
  clinic_name?: string | null;
};
type Center = {
  id: number;
  hospital_id: number;
  hospital_name?: string;
  name: string;
  city: string;
  address?: string | null;
  status: string;
  weekday_routes?: CenterWeekdayRoute[];
};
type RouteRow = { weekday: number; department_id: number; clinic_id?: number | null; clinic?: { id: number; name?: string } | null };
type ClinicOpt = { id: number; name: string };
type Department = { id: number; name: string };

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

@Component({
  selector: 'app-centers-page',
  imports: [CommonModule, FormsModule, Pagination, SpeechInput],
  templateUrl: './centers-page.html',
  styleUrl: './centers-page.scss',
})
export class CentersPage implements OnInit {
  /** Table column: show this many weekday route badges, then "+ N more". */
  readonly routePreviewMax = 3;

  hospitals: Hospital[] = [];
  rows: Center[] = [];
  departments: Department[] = [];

  form = { hospital_id: '' as number | '', name: '', city: '', address: '' };
  routeCenterId: number | '' = '';
  routeDeptByWeekday: Record<number, number | ''> = { 0: '', 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' };
  routeClinicByWeekday: Record<number, number | ''> = { 0: '', 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' };
  clinicsForWeekday: Record<number, ClinicOpt[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };

  loading = false;
  /** Weekday editor fetches routes + clinic lists — do not block the centers table (same idea as queue / pre-assessment). */
  weekdayRoutesLoading = false;
  saving = false;
  error = '';
  private loadRunId = 0;
  editing: Center | null = null;
  creating = false;
  page = 1;
  pageSize = 10;

  readonly weekdayLabels = WEEKDAY_LABELS;
  /** Stable indices 0–6 for @for track */
  readonly weekdayIndices = [0, 1, 2, 3, 4, 5, 6];

  constructor(
    private readonly api: ApiService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  /** Same as registration / queue / pre-assessment: authenticated list, then public fallback if empty or error. */
  private async fetchCentersList(ms: number): Promise<Center[]> {
    try {
      const rows = await this.api.get<Center[]>('/centers', ms);
      if (rows.length) return rows;
      return await this.api.get<Center[]>('/public/centers', ms);
    } catch (e) {
      try {
        return await this.api.get<Center[]>('/public/centers', ms);
      } catch {
        throw e;
      }
    }
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    const runId = ++this.loadRunId;
    this.loading = true;
    this.error = '';
    const ms = 25000;
    const guardMs = 26000;
    const guard = setTimeout(() => {
      if (this.loadRunId !== runId || !this.loading) return;
      this.loading = false;
      this.error = 'Request timed out. Please click Refresh.';
      this.toast.error(this.error);
      this.cdr.detectChanges();
    }, guardMs);
    try {
      const [rows, hospitalsRes, departmentsRes] = await Promise.all([
        this.fetchCentersList(ms),
        this.api.get<Hospital[]>('/hospitals', ms).catch(() => [] as Hospital[]),
        this.api.get<Department[]>('/departments', ms).catch(() => [] as Department[]),
      ]);
      if (this.loadRunId !== runId) return;

      this.rows = rows;
      this.hospitals = hospitalsRes;
      this.departments = departmentsRes;

      if (this.form.hospital_id === '' && this.hospitals[0]) this.form.hospital_id = this.hospitals[0].id;
      if (this.routeCenterId === '' && this.rows[0]) {
        this.routeCenterId = this.rows[0].id;
      }

      this.loading = false;
      this.cdr.detectChanges();
      clearTimeout(guard);

      if (this.routeCenterId !== '') {
        this.weekdayRoutesLoading = true;
        this.cdr.detectChanges();
        try {
          await this.loadWeekdayRoutes(Number(this.routeCenterId));
        } finally {
          if (this.loadRunId === runId) {
            this.weekdayRoutesLoading = false;
            this.cdr.detectChanges();
          }
        }
      }
    } catch (e) {
      if (this.loadRunId !== runId) return;
      this.error = e instanceof Error ? e.message : 'Failed to load centers';
      this.rows = [];
    } finally {
      clearTimeout(guard);
      if (this.loadRunId !== runId) return;
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async create(): Promise<void> {
    if (this.form.hospital_id === '' || !this.form.name.trim() || !this.form.city.trim()) {
      this.toast.error('Hospital, center name, and city are required.');
      return;
    }
    this.saving = true;
    try {
      await this.api.post(
        '/centers',
        {
          hospital_id: Number(this.form.hospital_id),
          name: this.form.name.trim(),
          city: this.form.city.trim(),
          address: this.form.address.trim() || null,
        },
        25000,
      );
      this.form.name = '';
      this.form.city = '';
      this.form.address = '';
      this.creating = false;
      await this.load();
      this.toast.success('Center created.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not create center';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
    }
  }

  get paged(): Center[] {
    const start = (this.page - 1) * this.pageSize;
    return this.rows.slice(start, start + this.pageSize);
  }

  setPage(page: number): void {
    this.page = page;
  }

  setPageSize(size: number): void {
    this.pageSize = size;
    this.page = 1;
  }

  centerRouteLabels(row: Center): string[] {
    const routes = [...(row.weekday_routes ?? [])].sort((a, b) => a.weekday - b.weekday);
    return routes.map((r) => {
      const day = WEEKDAY_LABELS[r.weekday] ?? String(r.weekday);
      const name = (r.department_name ?? '').trim() || `Dept #${r.department_id}`;
      const opd = (r.clinic_name ?? '').trim();
      return opd ? `${day}: ${name} · ${opd}` : `${day}: ${name}`;
    });
  }

  routeVisibleLabels(row: Center): string[] {
    return this.centerRouteLabels(row).slice(0, this.routePreviewMax);
  }

  routeHiddenCount(row: Center): number {
    const n = this.centerRouteLabels(row).length;
    return Math.max(0, n - this.routePreviewMax);
  }

  routeFullTitle(row: Center): string {
    return this.centerRouteLabels(row).join(', ');
  }

  async saveEdit(): Promise<void> {
    if (!this.editing) return;
    this.saving = true;
    try {
      await this.api.patch(
        `/centers/${this.editing.id}`,
        {
          name: this.editing.name,
          city: this.editing.city,
          address: this.editing.address || null,
          status: this.editing.status,
        },
        25000,
      );
      this.editing = null;
      await this.load();
      this.toast.success('Center updated.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not update center';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
    }
  }

  async remove(row: Center): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Delete center',
      message: `Delete center "${row.name}"?`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.request(`/centers/${row.id}`, { method: 'DELETE', timeoutMs: 25000 });
      await this.load();
      this.toast.success('Center deleted.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not delete center';
      this.toast.error(this.error);
    }
  }

  async loadWeekdayRoutes(centerId: number): Promise<void> {
    const emptyDept: Record<number, number | ''> = { 0: '', 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' };
    const emptyClinic: Record<number, number | ''> = { 0: '', 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' };
    const emptyClinics: Record<number, ClinicOpt[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    try {
      const rows = await this.api.get<RouteRow[]>(`/centers/${centerId}/weekday-routes`, 25000);
      const map = { ...emptyDept };
      const cmap = { ...emptyClinic };
      for (const r of rows) {
        map[r.weekday] = r.department_id;
        const cid = r.clinic_id ?? r.clinic?.id ?? null;
        cmap[r.weekday] = cid != null && cid !== undefined ? Number(cid) : '';
      }
      this.routeDeptByWeekday = map;
      this.routeClinicByWeekday = cmap;
      this.clinicsForWeekday = { ...emptyClinics };
      await Promise.all(
        [0, 1, 2, 3, 4, 5, 6].map((i) =>
          map[i] !== '' ? this.refreshClinicsForWeekdaySlot(centerId, i) : Promise.resolve(),
        ),
      );
    } catch {
      this.routeDeptByWeekday = { ...emptyDept };
      this.routeClinicByWeekday = { ...emptyClinic };
      this.clinicsForWeekday = { ...emptyClinics };
    }
  }

  private async refreshClinicsForWeekdaySlot(centerId: number, weekdayIndex: number): Promise<void> {
    const dep = this.routeDeptByWeekday[weekdayIndex];
    if (dep === '') {
      this.clinicsForWeekday[weekdayIndex] = [];
      return;
    }
    try {
      const q = new URLSearchParams({
        center_id: String(centerId),
        department_id: String(dep),
        active_only: 'true',
      });
      const list = await this.api.get<ClinicOpt[]>(`/clinics?${q.toString()}`, 25000);
      this.clinicsForWeekday[weekdayIndex] = list ?? [];
    } catch {
      this.clinicsForWeekday[weekdayIndex] = [];
    }
  }

  async onRouteDeptChange(weekdayIndex: number): Promise<void> {
    this.routeClinicByWeekday[weekdayIndex] = '';
    if (this.routeCenterId === '') return;
    await this.refreshClinicsForWeekdaySlot(Number(this.routeCenterId), weekdayIndex);
  }

  async saveWeekdayRoutes(): Promise<void> {
    if (this.routeCenterId === '') return;
    const body = Object.entries(this.routeDeptByWeekday)
      .filter(([, dep]) => dep !== '')
      .map(([weekday, dep]) => {
        const wd = Number(weekday);
        const c = this.routeClinicByWeekday[wd];
        return {
          weekday: wd,
          department_id: Number(dep),
          clinic_id: c === '' || c === undefined ? null : Number(c),
        };
      });
    this.saving = true;
    try {
      await this.api.request(`/centers/${this.routeCenterId}/weekday-routes`, { method: 'PUT', body, timeoutMs: 30000 });
      this.weekdayRoutesLoading = true;
      this.cdr.detectChanges();
      try {
        await this.loadWeekdayRoutes(Number(this.routeCenterId));
      } finally {
        this.weekdayRoutesLoading = false;
        this.cdr.detectChanges();
      }
      this.toast.success('Weekday routing saved.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not save weekday routes';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
    }
  }

  async onRouteCenterChange(): Promise<void> {
    if (this.routeCenterId === '') return;
    this.weekdayRoutesLoading = true;
    this.cdr.detectChanges();
    try {
      await this.loadWeekdayRoutes(Number(this.routeCenterId));
    } finally {
      this.weekdayRoutesLoading = false;
      this.cdr.detectChanges();
    }
  }

  weekdayClinicOptions(i: number): ClinicOpt[] {
    return this.clinicsForWeekday[i] ?? [];
  }
}
