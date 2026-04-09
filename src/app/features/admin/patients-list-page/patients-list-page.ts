import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { ConfirmService } from '../../../core/services/confirm';
import { ToastService } from '../../../core/services/toast';
import { Pagination } from '../../../ui-kit/pagination/pagination';
import { SpeechInput } from '../../../ui-kit/speech-input/speech-input';

type Patient = {
  id: number;
  cnic: string;
  first_name: string;
  last_name?: string | null;
  father_name?: string | null;
  phone?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  city?: string | null;
  status?: string;
};

@Component({
  selector: 'app-patients-list-page',
  imports: [CommonModule, FormsModule, Pagination, SpeechInput],
  templateUrl: './patients-list-page.html',
  styleUrl: './patients-list-page.scss',
})
export class PatientsListPage implements OnInit {
  rows: Patient[] = [];
  loading = false;
  saving = false;
  error = '';
  search = '';

  form = { cnic: '', first_name: '', last_name: '', father_name: '', phone: '', gender: '', date_of_birth: '', city: '' };
  editing: Patient | null = null;
  creating = false;
  page = 1;
  pageSize = 10;

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
      this.rows = await this.api.get<Patient[]>('/patients');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load patients';
      this.rows = [];
    } finally {
      this.loading = false;
    }
  }

  get filtered(): Patient[] {
    const q = this.search.trim().toLowerCase();
    if (!q) return this.rows;
    return this.rows.filter((p) => `${p.cnic} ${p.first_name} ${p.last_name || ''} ${p.phone || ''}`.toLowerCase().includes(q));
  }

  get paged(): Patient[] {
    const start = (this.page - 1) * this.pageSize;
    return this.filtered.slice(start, start + this.pageSize);
  }

  setPage(page: number): void {
    this.page = page;
  }

  setPageSize(size: number): void {
    this.pageSize = size;
    this.page = 1;
  }

  display(value: string | null | undefined): string {
    if (!value) return '—';
    const cleaned = value.replace(/\uFFFD/g, '').trim();
    return cleaned || '—';
  }

  async create(): Promise<void> {
    if (!this.form.cnic.trim() || !this.form.first_name.trim()) {
      this.toast.error('CNIC and first name are required.');
      return;
    }
    this.saving = true;
    try {
      await this.api.post('/patients', {
        cnic: this.form.cnic.trim(),
        first_name: this.form.first_name.trim(),
        last_name: this.form.last_name.trim() || null,
        father_name: this.form.father_name.trim() || null,
        phone: this.form.phone.trim() || null,
        gender: this.form.gender.trim() || null,
        date_of_birth: this.form.date_of_birth || null,
        city: this.form.city.trim() || null,
      });
      this.form = { cnic: '', first_name: '', last_name: '', father_name: '', phone: '', gender: '', date_of_birth: '', city: '' };
      this.creating = false;
      await this.load();
      this.toast.success('Patient created.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not create patient';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
    }
  }

  async saveEdit(): Promise<void> {
    if (!this.editing) return;
    this.saving = true;
    try {
      await this.api.patch(`/patients/${this.editing.id}`, {
        first_name: this.editing.first_name,
        last_name: this.editing.last_name || null,
        father_name: this.editing.father_name || null,
        phone: this.editing.phone || null,
        gender: this.editing.gender || null,
        date_of_birth: this.editing.date_of_birth || null,
        city: this.editing.city || null,
        status: this.editing.status || 'Active',
      });
      this.editing = null;
      await this.load();
      this.toast.success('Patient updated.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not update patient';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
    }
  }

  async remove(row: Patient): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Delete patient',
      message: `Delete patient "${row.first_name} ${row.last_name || ''}"?`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.request(`/patients/${row.id}`, { method: 'DELETE' });
      await this.load();
      this.toast.success('Patient deleted.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not delete patient';
      this.toast.error(this.error);
    }
  }
}
