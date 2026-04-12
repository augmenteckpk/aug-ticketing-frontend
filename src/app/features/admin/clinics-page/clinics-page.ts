import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { ToastService } from '../../../core/services/toast';

type Center = { id: number; name: string; hospital_name?: string; city?: string };
type Department = { id: number; name: string; status?: string };
type Clinic = {
  id: number;
  name: string;
  clinic_type?: string | null;
  status?: string | null;
  location?: string | null;
  department_id?: number | null;
  department_name?: string | null;
};

@Component({
  selector: 'app-clinics-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './clinics-page.html',
  styleUrl: './clinics-page.scss',
})
export class ClinicsPage implements OnInit {
  /** Default API timeout is 5s — too short on slow links (see queue / pre-assessment). */
  private readonly apiMs = 25000;
  private loadRunId = 0;

  centers: Center[] = [];
  departments: Department[] = [];
  rows: Clinic[] = [];

  centerId: number | '' = '';
  departmentId: number | '' = '';
  activeOnly = true;
  /** Initial center + department dropdowns */
  filtersLoading = false;
  /** Clinic table */
  loading = false;
  error = '';

  constructor(
    private readonly api: ApiService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  /** Same as registration / queue: `/centers` then `/public/centers` if empty or error. */
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
    await this.loadFilters();
    await this.load(true);
  }

  /** Load centers first so the UI can paint; then departments (matches pre-assessment UX). */
  async loadFilters(): Promise<void> {
    this.filtersLoading = true;
    this.error = '';
    const ms = this.apiMs;
    try {
      this.centers = await this.fetchCentersList(ms);
      if (this.centerId === '' && this.centers[0]) this.centerId = this.centers[0].id;
      this.cdr.detectChanges();

      this.departments = await this.api.get<Department[]>('/departments', ms).catch(() => [] as Department[]);
      if (this.departmentId === '' && this.departments[0]) this.departmentId = this.departments[0].id;
      if (!this.departments.length) {
        this.toast.error('Departments could not be loaded. Check your connection and refresh.');
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load center and department filters';
      this.centers = [];
      this.departments = [];
      this.toast.error(this.error);
    } finally {
      this.filtersLoading = false;
      this.cdr.detectChanges();
    }
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
      this.rows = list.map((r) => ({
        ...r,
        name: this.display(r.name),
        clinic_type: this.display(r.clinic_type),
        location: this.display(r.location),
        status: this.display(r.status),
        department_name: this.display(r.department_name),
      }));
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

  display(value: string | null | undefined): string {
    if (!value) return '—';
    const cleaned = value.replace(/\uFFFD/g, '').trim();
    return cleaned || '—';
  }
}
