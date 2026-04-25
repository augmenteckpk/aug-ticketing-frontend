import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { AuthService } from '../../../core/services/auth';
import { ToastService } from '../../../core/services/toast';
import { WorkflowStatusBadgePipe } from '../../../shared/pipes/status-badge.pipe';
import { centerIdFromOpd, consoleIsAdmin, listCenterIdForRequest, listDateForRequest } from '../../../core/utils/listing-scope';
import { todayLocalYmd } from '../../../core/utils/local-date';

type Center = { id: number; name: string; hospital_name?: string; city?: string };
type OpdPickRow = { id: number; name: string; display_code: string; center_id: number; center_label: string; sort_order: number };
type LabRow = {
  order_id: number;
  appointment_id: number;
  token_number: number;
  first_name?: string | null;
  last_name?: string | null;
  cnic?: string | null;
  test_code?: string | null;
  order_status?: string | null;
  appointment_status?: string | null;
};
type LabOrderDetail = {
  id: number;
  result?: { summary?: string | null; details?: string | null; file_path?: string | null } | null;
};

@Component({
  selector: 'app-laboratory-page',
  imports: [CommonModule, FormsModule, WorkflowStatusBadgePipe],
  templateUrl: './laboratory-page.html',
  styleUrl: './laboratory-page.scss',
})
export class LaboratoryPage implements OnInit {
  centers: Center[] = [];
  opdPickList: OpdPickRow[] = [];
  filterOpdId: number | '' = '';
  centerId: number | '' = '';
  date = todayLocalYmd();
  pendingOnly = false;
  rows: LabRow[] = [];
  loading = false;
  saving = false;
  bootstrapped = true;
  error = '';
  selectedOrder: LabRow | null = null;
  resultForm = { summary: '', details: '' };
  resultFile: File | null = null;
  existingFilePath: string | null = null;
  private loadRunId = 0;
  /** After the first worklist fetch, filter changes refresh without blanking the table. */
  private hasLoadedWorklist = false;

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  isAdmin(): boolean {
    return consoleIsAdmin(this.auth.user());
  }

  private async loadListingBootstrap(): Promise<void> {
    const ms = 20000;
    if (this.isAdmin()) {
      try {
        this.opdPickList = await this.api.get<OpdPickRow[]>('/public/opds', ms);
      } catch {
        this.opdPickList = [];
      }
      if (this.filterOpdId === '' && this.opdPickList[0]) this.filterOpdId = this.opdPickList[0].id;
      this.centerId = centerIdFromOpd(this.opdPickList, this.filterOpdId);
    } else {
      const c = this.auth.user()?.opd_center_id;
      if (c != null) this.centerId = c;
    }
    try {
      this.centers = await this.api.get<Center[]>('/centers', ms);
      if (!this.centers.length) this.centers = await this.api.get<Center[]>('/public/centers', ms);
    } catch (e) {
      try {
        this.centers = await this.api.get<Center[]>('/public/centers', ms);
      } catch {
        this.centers = [];
        this.error = e instanceof Error ? e.message : 'Failed to load centers';
      }
    }
    this.cdr.detectChanges();
  }

  private async withTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Request timed out. Please retry.')), ms)),
    ]);
  }

  async ngOnInit(): Promise<void> {
    await this.loadListingBootstrap();
    await this.load();
  }

  async onAdminOpdChanged(): Promise<void> {
    this.centerId = centerIdFromOpd(this.opdPickList, this.filterOpdId);
    await this.load();
  }

  async load(): Promise<void> {
    const runId = ++this.loadRunId;
    const useSpinner = !this.hasLoadedWorklist;
    if (useSpinner) this.loading = true;
    this.error = '';
    const guard = setTimeout(() => {
      if (this.loadRunId !== runId || !this.loading) return;
      if (useSpinner) this.loading = false;
      this.error = 'Request timed out. Please click Refresh.';
      this.toast.error(this.error);
      this.cdr.detectChanges();
    }, 9000);
    try {
      this.date = listDateForRequest(this.auth.user(), this.date);
      if (!this.isAdmin()) {
        this.centerId = listCenterIdForRequest(this.auth.user(), this.centerId);
      } else {
        this.centerId = centerIdFromOpd(this.opdPickList, this.filterOpdId);
      }
      const params = new URLSearchParams({ date: this.date, pending_only: this.pendingOnly ? '1' : '0' });
      if (this.isAdmin() && this.filterOpdId !== '') params.set('opd_id', String(this.filterOpdId));
      else if (this.centerId !== '') params.set('center_id', String(this.centerId));
      this.rows = await this.withTimeout(this.api.get<LabRow[]>(`/lab/worklist?${params.toString()}`, 20000));
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load lab worklist';
      this.rows = [];
      this.toast.error(this.error);
    } finally {
      clearTimeout(guard);
      if (useSpinner) this.loading = false;
      this.hasLoadedWorklist = true;
      this.bootstrapped = true;
      this.cdr.detectChanges();
    }
  }

  async openResultModal(row: LabRow): Promise<void> {
    this.selectedOrder = row;
    this.resultForm = { summary: '', details: '' };
    this.resultFile = null;
    this.existingFilePath = null;
    this.cdr.detectChanges();
    try {
      const orders = await this.withTimeout(this.api.get<LabOrderDetail[]>(`/appointments/${row.appointment_id}/lab`, 15000));
      const current = orders.find((o) => o.id === row.order_id);
      this.resultForm.summary = current?.result?.summary || '';
      this.resultForm.details = current?.result?.details || '';
      this.existingFilePath = current?.result?.file_path ?? null;
    } catch {
      // keep empty
    }
    this.cdr.detectChanges();
  }

  closeResultModal(): void {
    this.selectedOrder = null;
    this.resultForm = { summary: '', details: '' };
    this.resultFile = null;
    this.existingFilePath = null;
    this.cdr.detectChanges();
  }

  onFilePick(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    this.resultFile = f ?? null;
    this.cdr.detectChanges();
  }

  async downloadFile(): Promise<void> {
    if (!this.selectedOrder) return;
    try {
      const blob = await this.api.getBlob(`/investigations/file/lab/${this.selectedOrder.order_id}`, 60000);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not download file');
    }
  }

  async saveResult(): Promise<void> {
    if (!this.selectedOrder) return;
    this.saving = true;
    this.error = '';
    try {
      if (this.resultFile) {
        const fd = new FormData();
        fd.set('summary', this.resultForm.summary.trim());
        fd.set('details', this.resultForm.details.trim());
        fd.set('file', this.resultFile);
        await this.api.postFormData(`/appointments/lab-orders/${this.selectedOrder.order_id}/result-file`, fd);
      } else {
        await this.api.patch(`/appointments/lab-orders/${this.selectedOrder.order_id}/result`, {
          summary: this.resultForm.summary.trim() || null,
          details: this.resultForm.details.trim() || null,
        });
      }
      this.toast.success(`Lab result saved for order #${this.selectedOrder.order_id}.`);
      this.closeResultModal();
      await this.load();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not save lab result';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async completeFromLab(row: LabRow): Promise<void> {
    this.saving = true;
    this.error = '';
    try {
      await this.api.post(`/appointments/${row.appointment_id}/complete`, {}, 25000);
      this.toast.success(`Patient journey completed for token #${row.token_number}.`);
      if (this.selectedOrder?.order_id === row.order_id) this.closeResultModal();
      await this.load();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not complete patient journey';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }
}
