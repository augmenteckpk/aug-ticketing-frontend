import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api';
import { ToastService } from '../../../core/services/toast';
import { todayLocalYmd } from '../../../core/utils/local-date';

type Center = { id: number; name: string; city: string; hospital_name?: string };
type Summary = {
  date: string;
  center_id: number | null;
  byStatus: Record<string, number>;
  total: number;
  patients?: { total_in_system: number; with_visit_on_date: number };
};

@Component({
  selector: 'app-dashboard-home',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dashboard-home.html',
  styleUrl: './dashboard-home.scss',
})
export class DashboardHome implements OnInit {
  date = todayLocalYmd();
  centerId: number | '' = '';
  centers: Center[] = [];
  summary: Summary | null = null;
  loading = false;
  error = '';

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

  constructor(
    private readonly api: ApiService,
    private readonly toast: ToastService,
  ) {}

  get chartBars(): Array<{ label: string; value: number; pct: number }> {
    const summary = this.summary;
    if (!summary || !summary.total) return [];
    return this.statusOrder.map((s) => {
      const value = summary.byStatus[s.key] || 0;
      const pct = Math.max(0, Math.min(100, Math.round((value / summary.total) * 100)));
      return { label: s.label, value, pct };
    });
  }

  get donutStyle(): string {
    const bars = this.chartBars;
    if (!bars.length) return 'background: conic-gradient(#e2e8f0 0 100%);';
    const palette = ['#2563eb', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#22c55e', '#f97316', '#64748b'];
    let start = 0;
    const slices = bars
      .map((b, i) => {
        const end = start + b.pct;
        const color = palette[i % palette.length];
        const seg = `${color} ${start}% ${end}%`;
        start = end;
        return seg;
      })
      .join(', ');
    return `background: conic-gradient(${slices});`;
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
