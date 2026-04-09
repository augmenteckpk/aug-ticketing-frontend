import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { ConfirmService } from '../../../core/services/confirm';
import { ToastService } from '../../../core/services/toast';
import { Pagination } from '../../../ui-kit/pagination/pagination';
import { SpeechInput } from '../../../ui-kit/speech-input/speech-input';

type Hospital = { id: number; name: string };
type CenterWeekdayRoute = { weekday: number; department_id: number; department_name?: string };
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
type RouteRow = { weekday: number; department_id: number };
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

  loading = false;
  saving = false;
  error = '';
  editing: Center | null = null;
  creating = false;
  page = 1;
  pageSize = 10;

  readonly weekdayLabels = WEEKDAY_LABELS;

  constructor(
    private readonly api: ApiService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const [centersRes, hospitalsRes, departmentsRes] = await Promise.allSettled([
        this.api.get<Center[]>('/centers'),
        this.api.get<Hospital[]>('/hospitals'),
        this.api.get<Department[]>('/departments'),
      ]);
      if (centersRes.status === 'fulfilled') {
        this.rows = centersRes.value;
      } else {
        throw centersRes.reason;
      }
      this.hospitals = hospitalsRes.status === 'fulfilled' ? hospitalsRes.value : [];
      this.departments = departmentsRes.status === 'fulfilled' ? departmentsRes.value : [];

      if (this.form.hospital_id === '' && this.hospitals[0]) this.form.hospital_id = this.hospitals[0].id;
      if (this.routeCenterId === '' && this.rows[0]) {
        this.routeCenterId = this.rows[0].id;
        await this.loadWeekdayRoutes(this.rows[0].id);
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load centers';
      this.rows = [];
    } finally {
      this.loading = false;
    }
  }

  async create(): Promise<void> {
    if (this.form.hospital_id === '' || !this.form.name.trim() || !this.form.city.trim()) {
      this.toast.error('Hospital, center name, and city are required.');
      return;
    }
    this.saving = true;
    try {
      await this.api.post('/centers', {
        hospital_id: Number(this.form.hospital_id),
        name: this.form.name.trim(),
        city: this.form.city.trim(),
        address: this.form.address.trim() || null,
      });
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
      return `${day}: ${name}`;
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
      await this.api.patch(`/centers/${this.editing.id}`, {
        name: this.editing.name,
        city: this.editing.city,
        address: this.editing.address || null,
        status: this.editing.status,
      });
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
      await this.api.request(`/centers/${row.id}`, { method: 'DELETE' });
      await this.load();
      this.toast.success('Center deleted.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not delete center';
      this.toast.error(this.error);
    }
  }

  async loadWeekdayRoutes(centerId: number): Promise<void> {
    try {
      const rows = await this.api.get<RouteRow[]>(`/centers/${centerId}/weekday-routes`);
      const map: Record<number, number | ''> = { 0: '', 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' };
      for (const r of rows) map[r.weekday] = r.department_id;
      this.routeDeptByWeekday = map;
    } catch {
      this.routeDeptByWeekday = { 0: '', 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' };
    }
  }

  async saveWeekdayRoutes(): Promise<void> {
    if (this.routeCenterId === '') return;
    const body = Object.entries(this.routeDeptByWeekday)
      .filter(([, dep]) => dep !== '')
      .map(([weekday, dep]) => ({ weekday: Number(weekday), department_id: Number(dep) }));
    this.saving = true;
    try {
      await this.api.request(`/centers/${this.routeCenterId}/weekday-routes`, { method: 'PUT', body });
      await this.loadWeekdayRoutes(Number(this.routeCenterId));
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
    await this.loadWeekdayRoutes(Number(this.routeCenterId));
  }
}
