import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { AsyncState } from '../../../ui-kit/async-state/async-state';
import { PageHeader } from '../../../ui-kit/page-header/page-header';
import { Pagination } from '../../../ui-kit/pagination/pagination';

@Component({
  selector: 'app-feature-page',
  imports: [CommonModule, FormsModule, PageHeader, AsyncState, Pagination],
  templateUrl: './feature-page.html',
  styleUrl: './feature-page.scss',
})
export class FeaturePage implements OnInit {
  @Input({ required: true }) title = '';
  @Input() subtitle = '';
  @Input() endpoint = '';

  loading = true;
  error = '';
  rows: Record<string, unknown>[] = [];
  search = '';
  page = 1;
  pageSize = 10;

  constructor(private readonly api: ApiService) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    if (!this.endpoint) {
      this.loading = false;
      return;
    }

    this.loading = true;
    this.error = '';
    try {
      const data = await this.api.get<unknown>(this.endpoint);
      if (Array.isArray(data)) {
        this.rows = data.filter((r) => r != null).map((r) => (typeof r === 'object' ? (r as Record<string, unknown>) : { value: r }));
      } else if (data && typeof data === 'object') {
        this.rows = [data as Record<string, unknown>];
      } else if (data != null) {
        this.rows = [{ value: data }];
      } else {
        this.rows = [];
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load';
    } finally {
      this.loading = false;
    }
  }

  get columns(): string[] {
    const first = this.rows[0];
    if (!first) return [];
    const preferred = [
      'id',
      'name',
      'status',
      'code',
      'token_number',
      'appointment_date',
      'patient_name',
      'center_name',
      'opd_display_code',
      'opd_name',
      'city',
      'username',
      'role',
    ];
    const keys = Object.keys(first);
    const ordered = preferred.filter((k) => keys.includes(k));
    const rest = keys.filter((k) => !ordered.includes(k)).slice(0, 8);
    return [...ordered, ...rest];
  }

  get filteredRows(): Record<string, unknown>[] {
    const q = this.search.trim().toLowerCase();
    if (!q) return this.rows;
    return this.rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }

  get pagedRows(): Record<string, unknown>[] {
    const start = (this.page - 1) * this.pageSize;
    return this.filteredRows.slice(start, start + this.pageSize);
  }

  onPageChange(page: number): void {
    this.page = page;
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.page = 1;
  }

  displayValue(v: unknown): string {
    if (v == null) return '—';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    const text = JSON.stringify(v);
    return text.length > 140 ? `${text.slice(0, 140)}…` : text;
  }
}
