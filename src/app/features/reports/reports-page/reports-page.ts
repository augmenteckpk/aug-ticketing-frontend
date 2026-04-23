import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, getToken } from '../../../core/services/api';
import { AuthService } from '../../../core/services/auth';
import { resolveApiBaseUrl } from '../../../../environments/api-base';
import { ToastService } from '../../../core/services/toast';
import { WorkflowStatusBadgePipe } from '../../../shared/pipes/status-badge.pipe';
import { consoleIsAdmin, listDateForRequest } from '../../../core/utils/listing-scope';
import { todayLocalYmd } from '../../../core/utils/local-date';

type OpdPickRow = { id: number; name: string; display_code: string; center_id: number; center_label: string; sort_order: number };

type DailyReport = {
  date: string;
  total: number;
  by_status: Record<string, number>;
  by_center: Array<{ center_id: number; center_name: string; hospital_name: string; total: number }>;
  by_opd?: Array<{ opd_id: number | null; opd_name: string | null; display_code: string | null; total: number }>;
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
    opd_name: string | null;
    opd_display_code: string | null;
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
  opdFilterList: OpdPickRow[] = [];
  filterOpdId: number | '' = '';
  loading = false;
  error = '';
  data: DailyReport | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  isAdmin(): boolean {
    return consoleIsAdmin(this.auth.user());
  }

  async ngOnInit(): Promise<void> {
    if (this.isAdmin()) {
      try {
        this.opdFilterList = await this.api.get<OpdPickRow[]>('/public/opds', 20000);
      } catch {
        this.opdFilterList = [];
      }
      this.cdr.detectChanges();
    }
    await this.load();
  }

  get statusRows(): Array<{ key: string; value: number }> {
    return Object.entries(this.data?.by_status || {}).map(([key, value]) => ({ key, value }));
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const effDate = listDateForRequest(this.auth.user(), this.date);
      const q = new URLSearchParams({ date: effDate });
      if (this.isAdmin() && this.filterOpdId !== '') q.set('opd_id', String(this.filterOpdId));
      this.data = await this.api.get<DailyReport>(`/reports/daily?${q.toString()}`, 20000);
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load reports';
      this.data = null;
      this.toast.error(this.error);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async downloadCsv(): Promise<void> {
    try {
      const token = getToken();
      const base = resolveApiBaseUrl();
      const date = listDateForRequest(this.auth.user(), this.date);
      const q = new URLSearchParams({ date });
      if (this.isAdmin() && this.filterOpdId !== '') q.set('opd_id', String(this.filterOpdId));
      const res = await fetch(`${base}/api/v1/reports/daily.csv?${q.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Failed to download report (HTTP ${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `daily-report-${date}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      this.toast.success('Report download started.');
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Failed to download report');
    }
  }
}
