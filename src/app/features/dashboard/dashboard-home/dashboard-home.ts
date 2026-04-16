import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api';
import { WorkflowStatusBadgePipe } from '../../../shared/pipes/status-badge.pipe';
import { ToastService } from '../../../core/services/toast';
import { todayLocalYmd } from '../../../core/utils/local-date';

type Center = { id: number; name: string; city: string; hospital_name?: string };

export type DashboardRangePreset = 'day' | 'yesterday' | '7d' | '30d' | 'month';

type Summary = {
  date: string;
  date_start: string;
  date_end: string;
  range: DashboardRangePreset;
  center_id: number | null;
  byStatus: Record<string, number>;
  total: number;
  daily_volume?: Array<{ date: string; total: number }>;
  patients?: { total_in_system: number; with_visit_on_date: number };
  system?: {
    hospitals: number;
    centers: number;
    departments: number;
    clinics: number;
    users_active: number;
  };
};

/** Bar fills aligned with workflow badge emphasis (see styles.scss). */
const STATUS_BAR_COLORS: Record<string, string> = {
  booked: '#2563eb',
  registered: '#7c3aed',
  ready: '#d97706',
  batched: '#db2777',
  dispatched: '#4f46e5',
  completed: '#16a34a',
  skipped: '#ca8a04',
  cancelled: '#dc2626',
};

@Component({
  selector: 'app-dashboard-home',
  imports: [CommonModule, FormsModule, RouterLink, WorkflowStatusBadgePipe],
  templateUrl: './dashboard-home.html',
  styleUrl: './dashboard-home.scss',
})
export class DashboardHome implements OnInit {
  date = todayLocalYmd();
  rangePreset: DashboardRangePreset = 'day';
  centerId: number | '' = '';
  centers: Center[] = [];
  summary: Summary | null = null;
  loading = false;
  error = '';

  readonly rangeOptions: Array<{ id: DashboardRangePreset; label: string }> = [
    { id: 'day', label: '1 day' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: '7d', label: '7 days' },
    { id: '30d', label: '30 days' },
    { id: 'month', label: 'This month' },
  ];

  readonly statusOrder = [
    { key: 'booked', label: 'Booked' },
    { key: 'registered', label: 'Registered' },
    { key: 'ready', label: 'Ready' },
    { key: 'batched', label: 'Batched' },
    { key: 'dispatched', label: 'Dispatched' },
    { key: 'completed', label: 'Completed' },
    { key: 'skipped', label: 'Skipped' },
    { key: 'cancelled', label: 'Cancelled' },
  ] as const;

  readonly pipelineKeys = ['booked', 'registered', 'ready', 'batched', 'dispatched'] as const;

  constructor(
    private readonly api: ApiService,
    private readonly toast: ToastService,
  ) {}

  get chartBars(): Array<{ key: string; label: string; value: number; pct: number; color: string }> {
    const summary = this.summary;
    if (!summary) return [];
    const total = summary.total || 0;
    return this.statusOrder.map((s) => {
      const value = summary.byStatus[s.key] || 0;
      const pct = total ? Math.round((value / total) * 100) : 0;
      return {
        key: s.key,
        label: s.label,
        value,
        pct,
        color: STATUS_BAR_COLORS[s.key] ?? '#64748b',
      };
    });
  }

  get dailyVolume(): Array<{ date: string; total: number }> {
    return this.summary?.daily_volume ?? [];
  }

  get dailyChartMax(): number {
    const rows = this.dailyVolume;
    if (!rows.length) return 1;
    return Math.max(1, ...rows.map((r) => r.total));
  }

  dailyBarHeight(total: number): number {
    return Math.round((total / this.dailyChartMax) * 100);
  }

  shortDayLabel(ymd: string): string {
    const parts = ymd.split('-').map((x) => Number(x));
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd;
    const [y, m, d] = parts;
    const dt = new Date(y, m - 1, d);
    if (this.rangePreset === '30d' || this.rangePreset === 'month') {
      return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    return dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
  }

  setPreset(p: DashboardRangePreset): void {
    this.rangePreset = p;
    if (p === 'day' || p === 'yesterday' || p === 'month') {
      this.date = todayLocalYmd();
    }
    void this.loadSummary();
  }

  resetToToday(): void {
    this.date = todayLocalYmd();
    this.rangePreset = 'day';
    void this.loadSummary();
  }

  get completedCount(): number {
    return this.summary?.byStatus['completed'] ?? 0;
  }

  get pipelineCount(): number {
    const s = this.summary?.byStatus;
    if (!s) return 0;
    return this.pipelineKeys.reduce((acc, k) => acc + (s[k] ?? 0), 0);
  }

  get completionRate(): number {
    const t = this.summary?.total ?? 0;
    if (!t) return 0;
    return Math.round((this.completedCount / t) * 100);
  }

  get scopeDescription(): string {
    if (!this.summary) return '';
    const start = this.summary.date_start ?? this.summary.date;
    const end = this.summary.date_end ?? this.summary.date;
    const rangePart = this.formatRangeSpan(start, end);
    if (this.centerId === '') {
      return `${rangePart} · All centers`;
    }
    const c = this.centers.find((x) => x.id === this.centerId);
    if (!c) return `${rangePart} · One center`;
    const hosp = c.hospital_name ? `${c.hospital_name} · ` : '';
    return `${rangePart} · ${hosp}${c.name} (${c.city})`;
  }

  formatRangeSpan(start: string, end: string): string {
    if (start === end) {
      return this.formatDisplayDate(start);
    }
    return `${this.formatDisplayDate(start)} – ${this.formatDisplayDate(end)}`;
  }

  formatDisplayDate(ymd: string): string {
    const parts = ymd.split('-').map((x) => Number(x));
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd;
    const [y, m, d] = parts;
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  periodTitle(): string {
    if (!this.summary) return 'Selected period';
    if (this.summary.date_start === this.summary.date_end) {
      return 'Selected day';
    }
    return 'Selected period';
  }

  async ngOnInit(): Promise<void> {
    await Promise.allSettled([this.loadCenters(), this.loadSummary()]);
  }

  async loadCenters(): Promise<void> {
    try {
      this.centers = await this.api.get<Center[]>('/centers');
      if (!this.centers.length) this.centers = await this.api.get<Center[]>('/public/centers');
    } catch (e) {
      try {
        this.centers = await this.api.get<Center[]>('/public/centers');
      } catch {
        this.centers = [];
        this.error = e instanceof Error ? e.message : 'Failed to load centers';
        this.toast.error(this.error);
      }
    }
  }

  async loadSummary(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const q = new URLSearchParams();
      q.set('date', this.date);
      q.set('range', this.rangePreset);
      if (this.centerId !== '') q.set('center_id', String(this.centerId));
      this.summary = await this.api.get<Summary>(`/dashboard/summary?${q.toString()}`);
    } catch (e) {
      this.summary = null;
      this.error = e instanceof Error ? e.message : 'Failed to load dashboard summary';
      this.toast.error(this.error);
    } finally {
      this.loading = false;
    }
  }
}
