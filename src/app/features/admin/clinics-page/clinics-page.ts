import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { ToastService } from '../../../core/services/toast';
import { SpeechInput } from '../../../ui-kit/speech-input/speech-input';

type Center = { id: number; name: string; hospital_name?: string; city?: string };
type Department = { id: number; name: string; status?: string };
type Clinic = {
  id: number;
  name: string;
  clinic_type?: string | null;
  status?: string | null;
  location?: string | null;
  schedule?: string | null;
  department_id?: number | null;
  department_name?: string | null;
};

@Component({
  selector: 'app-clinics-page',
  imports: [CommonModule, FormsModule, SpeechInput],
  templateUrl: './clinics-page.html',
  styleUrl: './clinics-page.scss',
})
export class ClinicsPage implements OnInit {
  private readonly apiMs = 25000;
  private loadRunId = 0;

  centers: Center[] = [];
  departments: Department[] = [];
  rows: Clinic[] = [];

  centerId: number | '' = '';
  departmentId: number | '' = '';
  activeOnly = true;
  filtersLoading = false;
  loading = false;
  saving = false;
  error = '';

  creating = false;
  editing: Clinic | null = null;

  form = {
    name: '',
    clinic_type: 'OPD',
    location: '',
    schedule: '',
    status: 'Active' as 'Active' | 'Inactive',
  };

  constructor(
    private readonly api: ApiService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

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

  private scopeQuery(): string {
    return `center_id=${encodeURIComponent(String(this.centerId))}&department_id=${encodeURIComponent(String(this.departmentId))}`;
  }

  async ngOnInit(): Promise<void> {
    await this.loadFilters();
    await this.load(true);
  }

  async loadFilters(): Promise<void> {
    this.filtersLoading = true;
    this.error = '';
    const ms = this.apiMs;
    try {
      this.centers = await this.fetchCentersList(ms);
      if (this.centerId === '' && this.centers[0]) this.centerId = this.centers[0].id;
      this.cdr.detectChanges();
      await this.loadDepartmentsForCenter();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load centers';
      this.centers = [];
      this.departments = [];
      this.toast.error(this.error);
    } finally {
      this.filtersLoading = false;
      this.cdr.detectChanges();
    }
  }

  async loadDepartmentsForCenter(): Promise<void> {
    const ms = this.apiMs;
    if (this.centerId === '' || this.centerId == null) {
      this.departments = [];
      this.departmentId = '';
      return;
    }
    try {
      this.departments = await this.api.get<Department[]>(`/departments?center_id=${this.centerId}&active_only=true`, ms);
      if (this.departmentId === '' && this.departments[0]) this.departmentId = this.departments[0].id;
      if (this.departmentId !== '' && !this.departments.some((d) => d.id === this.departmentId)) {
        this.departmentId = this.departments[0]?.id ?? '';
      }
    } catch {
      this.departments = [];
      this.departmentId = '';
    }
    this.cdr.detectChanges();
  }

  async onCenterChanged(): Promise<void> {
    this.departmentId = '';
    await this.loadDepartmentsForCenter();
    await this.load();
  }

  async onDepartmentChanged(): Promise<void> {
    await this.load();
  }

  resetForm(): void {
    this.form = {
      name: '',
      clinic_type: 'OPD',
      location: '',
      schedule: '',
      status: 'Active',
    };
  }

  openCreate(): void {
    this.editing = null;
    this.resetForm();
    this.creating = true;
    this.cdr.detectChanges();
  }

  openEdit(row: Clinic, ev?: Event): void {
    ev?.stopPropagation();
    ev?.preventDefault();
    this.creating = false;
    const st = String(row.status ?? '').toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
    this.editing = { ...row, status: st };
    this.cdr.detectChanges();
  }

  closeCreate(): void {
    this.creating = false;
    this.cdr.detectChanges();
  }

  closeEdit(): void {
    this.editing = null;
    this.cdr.detectChanges();
  }

  async load(showSpinner = true): Promise<void> {
    if (this.centerId === '' || this.departmentId === '') {
      this.rows = [];
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }
    const runId = ++this.loadRunId;
    const useSpinner = showSpinner;
    if (useSpinner) this.loading = true;
    this.error = '';
    const guardMs = 26000;
    const guard = setTimeout(() => {
      if (this.loadRunId !== runId || !this.loading) return;
      this.loading = false;
      this.error = 'Request timed out. Please click Refresh or change filters.';
      this.toast.error(this.error);
      this.cdr.detectChanges();
    }, guardMs);
    try {
      const params = new URLSearchParams({
        center_id: String(this.centerId),
        department_id: String(this.departmentId),
        active_only: this.activeOnly ? '1' : '0',
      });
      const payload = await this.api.get<Clinic[] | { data?: Clinic[] }>(
        `/clinics?${params.toString()}`,
        this.apiMs,
      );
      if (this.loadRunId !== runId) return;
      const list = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
      this.rows = list;
    } catch (e) {
      if (this.loadRunId !== runId) return;
      this.error = e instanceof Error ? e.message : 'Failed to load clinics';
      this.rows = [];
      this.toast.error(this.error);
    } finally {
      clearTimeout(guard);
      if (this.loadRunId !== runId) return;
      if (useSpinner) this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async createClinic(): Promise<void> {
    if (this.centerId === '' || this.departmentId === '' || !this.form.name.trim()) {
      this.toast.error('Center, department, and clinic name are required.');
      return;
    }
    this.saving = true;
    try {
      await this.api.post(
        '/clinics',
        {
          center_id: Number(this.centerId),
          department_id: Number(this.departmentId),
          name: this.form.name.trim(),
          clinic_type: this.form.clinic_type.trim() || 'OPD',
          location: this.form.location.trim() || null,
          schedule: this.form.schedule.trim() || null,
          status: this.form.status,
        },
        this.apiMs,
      );
      this.creating = false;
      this.resetForm();
      this.toast.success('Clinic created.');
      await this.load();
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not create clinic');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async saveEdit(): Promise<void> {
    if (!this.editing) return;
    if (this.centerId === '' || this.departmentId === '') return;
    this.saving = true;
    try {
      await this.api.patch(
        `/clinics/${this.editing.id}?${this.scopeQuery()}`,
        {
          name: this.editing.name.trim(),
          clinic_type: (this.editing.clinic_type ?? 'OPD').trim() || 'OPD',
          location: this.editing.location?.trim() ? this.editing.location.trim() : null,
          schedule: this.editing.schedule?.trim() ? this.editing.schedule.trim() : null,
          status: (this.editing.status === 'Inactive' ? 'Inactive' : 'Active') as 'Active' | 'Inactive',
        },
        this.apiMs,
      );
      this.closeEdit();
      this.toast.success('Clinic updated.');
      await this.load();
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not update clinic');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async deactivate(row: Clinic): Promise<void> {
    if (this.centerId === '' || this.departmentId === '') return;
    if (!confirm(`Deactivate OPD/clinic “${row.name}”? It will be hidden when “Active only” is on.`)) return;
    this.saving = true;
    try {
      await this.api.request(`/clinics/${row.id}?${this.scopeQuery()}`, { method: 'DELETE', timeoutMs: this.apiMs });
      this.toast.success('Clinic deactivated.');
      await this.load();
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not deactivate clinic');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  display(value: string | null | undefined): string {
    if (!value) return '—';
    const cleaned = value.replace(/\uFFFD/g, '').trim();
    return cleaned || '—';
  }
}
