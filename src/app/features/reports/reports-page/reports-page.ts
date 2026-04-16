import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, getToken } from '../../../core/services/api';
import { resolveApiBaseUrl } from '../../../../environments/api-base';
import { ToastService } from '../../../core/services/toast';
import { WorkflowStatusBadgePipe } from '../../../shared/pipes/status-badge.pipe';
import { todayLocalYmd } from '../../../core/utils/local-date';

type DailyReport = {
  date: string;
  total: number;
  by_status: Record<string, number>;
  by_center: Array<{ center_id: number; center_name: string; hospital_name: string; total: number }>;
  by_department: Array<{ department_id: number | null; department_name: string | null; total: number }>;
  /** Executive KPIs (mobile + analytics); optional for older API builds. */
  executive?: {
    total_scheduled_appointments: number;
    total_awaiting_arrival_booked: number;
    total_in_clinic_flow: number;
    emergency_priority_visits: number;
    dialysis_appointments_total: number;
    dialysis_emergency: number;
    dialysis_routine: number;
  };
  patient_visits: Array<{
    appointment_id: number;
    appointment_date: string;
    token_number: number;
    status: string;
    patient_name: string;
    patient_cnic: string;
    center_name: string;
    hospital_name: string;
    department_name: string | null;
  }>;
};

@Component({
  selector: 'app-reports-page',
  imports: [CommonModule, FormsModule, WorkflowStatusBadgePipe],
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.scss',
})
export class ReportsPage implements OnInit {
  date = todayLocalYmd();
  loading = false;
  error = '';
  data: DailyReport | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly toast: ToastService,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  get statusRows(): Array<{ key: string; value: number }> {
    return Object.entries(this.data?.by_status || {}).map(([key, value]) => ({ key, value }));
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      this.data = await this.api.get<DailyReport>(`/reports/daily?date=${encodeURIComponent(this.date)}`);
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load reports';
      this.data = null;
      this.toast.error(this.error);
    } finally {
      this.loading = false;
    }
  }

  async downloadCsv(): Promise<void> {
    try {
      const token = getToken();
      const base = resolveApiBaseUrl();
      const res = await fetch(`${base}/api/v1/reports/daily.csv?date=${encodeURIComponent(this.date)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Failed to download report (HTTP ${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `daily-report-${this.date}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      this.toast.success('Report download started.');
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Failed to download report');
    }
  }
}
