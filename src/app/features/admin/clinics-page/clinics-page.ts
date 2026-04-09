import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
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
  centers: Center[] = [];
  departments: Department[] = [];
  rows: Clinic[] = [];

  centerId: number | '' = '';
  departmentId: number | '' = '';
  activeOnly = true;
  loading = false;
  error = '';

  constructor(
    private readonly api: ApiService,
    private readonly toast: ToastService,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadFilters();
    await this.load();
  }

  async loadFilters(): Promise<void> {
    try {
      const [centersRes, departmentsRes] = await Promise.allSettled([
        this.api.get<Center[]>('/centers'),
        this.api.get<Department[]>('/departments'),
      ]);
      if (centersRes.status === 'fulfilled') {
        this.centers = centersRes.value;
      } else {
        throw centersRes.reason;
      }
      if (this.centerId === '' && this.centers[0]) this.centerId = this.centers[0].id;
      this.departments = departmentsRes.status === 'fulfilled' ? departmentsRes.value : [];
      if (this.departmentId === '' && this.departments[0]) this.departmentId = this.departments[0].id;
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load center and department filters';
      this.centers = [];
      this.departments = [];
      this.toast.error(this.error);
    }
  }

  async load(): Promise<void> {
    if (this.centerId === '' || this.departmentId === '') {
      this.rows = [];
      this.loading = false;
      return;
    }
    this.loading = true;
    this.error = '';
    try {
      const params = new URLSearchParams({
        center_id: String(this.centerId),
        department_id: String(this.departmentId),
        active_only: this.activeOnly ? '1' : '0',
      });
      const payload = await this.api.get<Clinic[] | { data?: Clinic[] }>(`/clinics?${params.toString()}`);
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
      this.error = e instanceof Error ? e.message : 'Failed to load clinics';
      this.rows = [];
      this.toast.error(this.error);
    } finally {
      this.loading = false;
    }
  }

  display(value: string | null | undefined): string {
    if (!value) return '—';
    const cleaned = value.replace(/\uFFFD/g, '').trim();
    return cleaned || '—';
  }
}
