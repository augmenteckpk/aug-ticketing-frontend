import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { ConfirmService } from '../../../core/services/confirm';
import { ToastService } from '../../../core/services/toast';
import { Pagination } from '../../../ui-kit/pagination/pagination';
import { EntityStatusBadgePipe } from '../../../shared/pipes/status-badge.pipe';
import { SpeechInput } from '../../../ui-kit/speech-input/speech-input';

type Department = { id: number; name: string; description?: string | null; status: string };

@Component({
  selector: 'app-departments-page',
  imports: [CommonModule, FormsModule, Pagination, SpeechInput, EntityStatusBadgePipe],
  templateUrl: './departments-page.html',
  styleUrl: './departments-page.scss',
})
export class DepartmentsPage implements OnInit {
  rows: Department[] = [];
  form = { name: '', description: '' };
  loading = false;
  saving = false;
  error = '';
  editing: Department | null = null;
  creating = false;
  page = 1;
  pageSize = 10;

  constructor(
    private readonly api: ApiService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> { await this.load(); }

  async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      this.rows = await this.api.get<Department[]>('/departments');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load departments';
      this.rows = [];
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  startCreate(): void {
    this.creating = true;
    this.cdr.detectChanges();
  }

  startEdit(r: Department): void {
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

  get paged(): Department[] {
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

  display(value: string | null | undefined): string {
    if (!value) return '—';
    const cleaned = value.replace(/\uFFFD/g, '').trim();
    return cleaned || '—';
  }

  async create(): Promise<void> {
    if (!this.form.name.trim()) {
      this.toast.error('Department name is required.');
      return;
    }
    this.saving = true;
    try {
      await this.api.post('/departments', { name: this.form.name.trim(), description: this.form.description.trim() || null });
      this.form = { name: '', description: '' };
      this.creating = false;
      await this.load();
      this.toast.success('Department created.');
    } catch (e) { this.error = e instanceof Error ? e.message : 'Could not create department'; this.toast.error(this.error); }
    finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async saveEdit(): Promise<void> {
    if (!this.editing) return;
    this.saving = true;
    try {
      await this.api.patch(`/departments/${this.editing.id}`, {
        name: this.editing.name,
        description: this.editing.description || null,
        status: this.editing.status,
      });
      this.editing = null;
      await this.load();
      this.toast.success('Department updated.');
    } catch (e) { this.error = e instanceof Error ? e.message : 'Could not update department'; this.toast.error(this.error); }
    finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async remove(row: Department): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Delete department',
      message: `Delete department "${row.name}"?`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.request(`/departments/${row.id}`, { method: 'DELETE' });
      await this.load();
      this.toast.success('Department deleted.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not delete department';
      this.toast.error(this.error);
    } finally {
      this.cdr.detectChanges();
    }
  }
}
