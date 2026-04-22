import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { ConfirmService } from '../../../core/services/confirm';
import { ToastService } from '../../../core/services/toast';
import { EntityStatusBadgePipe } from '../../../shared/pipes/status-badge.pipe';
import { Pagination } from '../../../ui-kit/pagination/pagination';
import { SpeechInput } from '../../../ui-kit/speech-input/speech-input';

type Hospital = { id: number; name: string };
type Center = {
  id: number;
  hospital_id: number;
  hospital_name?: string;
  name: string;
  city: string;
  address?: string | null;
  status: string;
};

@Component({
  selector: 'app-centers-page',
  imports: [CommonModule, FormsModule, Pagination, SpeechInput, EntityStatusBadgePipe],
  templateUrl: './centers-page.html',
  styleUrl: './centers-page.scss',
})
export class CentersPage implements OnInit {
  hospitals: Hospital[] = [];
  rows: Center[] = [];

  form = { hospital_id: '' as number | '', name: '', city: '', address: '' };

  loading = false;
  saving = false;
  error = '';
  private loadRunId = 0;
  editing: Center | null = null;
  creating = false;
  page = 1;
  pageSize = 10;

  constructor(
    private readonly api: ApiService,
    private readonly confirm: ConfirmService,
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
      const [rows, hospitalsRes] = await Promise.all([
        this.fetchCentersList(ms),
        this.api.get<Hospital[]>('/hospitals', ms).catch(() => [] as Hospital[]),
      ]);
      if (this.loadRunId !== runId) return;

      this.rows = rows;
      this.hospitals = hospitalsRes;

      if (this.form.hospital_id === '' && this.hospitals[0]) this.form.hospital_id = this.hospitals[0].id;
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
}
