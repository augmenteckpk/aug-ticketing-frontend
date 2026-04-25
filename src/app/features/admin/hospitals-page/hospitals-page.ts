import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { ConfirmService } from '../../../core/services/confirm';
import { ToastService } from '../../../core/services/toast';
import { Pagination } from '../../../ui-kit/pagination/pagination';
import { EntityStatusBadgePipe } from '../../../shared/pipes/status-badge.pipe';
import { SpeechInput } from '../../../ui-kit/speech-input/speech-input';

type Hospital = { id: number; name: string; code: string; status: string };

@Component({
  selector: 'app-hospitals-page',
  imports: [CommonModule, FormsModule, Pagination, SpeechInput, EntityStatusBadgePipe],
  templateUrl: './hospitals-page.html',
  styleUrl: './hospitals-page.scss',
})
export class HospitalsPage implements OnInit {
  rows: Hospital[] = [];
  name = '';
  code = '';
  loading = false;
  saving = false;
  error = '';
  editing: Hospital | null = null;
  creating = false;
  page = 1;
  pageSize = 10;

  get paged(): Hospital[] {
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

  constructor(
    private readonly api: ApiService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      this.rows = await this.api.get<Hospital[]>('/hospitals', 20000);
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load hospitals';
      this.rows = [];
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async create(): Promise<void> {
    if (!this.name.trim() || !this.code.trim()) {
      this.toast.error('Hospital name and code are required.');
      return;
    }
    this.saving = true;
    try {
      await this.api.post('/hospitals', { name: this.name.trim(), code: this.code.trim() });
      this.name = '';
      this.code = '';
      this.creating = false;
      await this.load();
      this.toast.success('Hospital created successfully.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not create hospital';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async saveEdit(): Promise<void> {
    if (!this.editing) return;
    this.saving = true;
    try {
      await this.api.patch(`/hospitals/${this.editing.id}`, {
        name: this.editing.name,
        code: this.editing.code,
        status: this.editing.status,
      });
      this.editing = null;
      await this.load();
      this.toast.success('Hospital updated.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not update hospital';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async remove(row: Hospital): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Delete hospital',
      message: `Delete hospital "${row.name}"?`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.request(`/hospitals/${row.id}`, { method: 'DELETE' });
      await this.load();
      this.toast.success('Hospital deleted.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not delete hospital';
      this.toast.error(this.error);
    } finally {
      this.cdr.detectChanges();
    }
  }

  openCreate(): void {
    this.creating = true;
    this.cdr.detectChanges();
  }

  openEditRow(r: Hospital): void {
    this.editing = { ...r };
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
}
