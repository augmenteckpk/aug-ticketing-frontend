import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { ToastService } from '../../../core/services/toast';

type Center = { id: number; name: string; hospital_name?: string; city?: string };
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
  result?: { summary?: string | null; details?: string | null } | null;
};

@Component({
  selector: 'app-laboratory-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './laboratory-page.html',
  styleUrl: './laboratory-page.scss',
})
export class LaboratoryPage implements OnInit {
  centers: Center[] = [];
  centerId: number | '' = '';
  date = new Date().toISOString().slice(0, 10);
  pendingOnly = false;
  rows: LabRow[] = [];
  loading = false;
  saving = false;
  bootstrapped = true;
  error = '';
  selectedOrder: LabRow | null = null;
  resultForm = { summary: '', details: '' };
  private loadRunId = 0;

  constructor(
    private readonly api: ApiService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  private async withTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Request timed out. Please retry.')), ms)),
    ]);
  }

  async ngOnInit(): Promise<void> {
    await this.load();
    try {
      this.centers = await this.api.get<Center[]>('/centers');
      if (!this.centers.length) this.centers = await this.api.get<Center[]>('/public/centers');
      if (this.centers[0]) this.centerId = this.centers[0].id;
    } catch (e) {
      try {
        this.centers = await this.api.get<Center[]>('/public/centers');
        if (this.centers[0]) this.centerId = this.centers[0].id;
      } catch {
        this.centers = [];
        this.error = e instanceof Error ? e.message : 'Failed to load centers';
      }
    }
    this.cdr.detectChanges();
  }

  async load(): Promise<void> {
    const runId = ++this.loadRunId;
    this.loading = true;
    this.error = '';
    const guard = setTimeout(() => {
      if (this.loadRunId !== runId || !this.loading) return;
      this.loading = false;
      this.error = 'Request timed out. Please click Refresh.';
      this.toast.error(this.error);
      this.cdr.detectChanges();
    }, 9000);
    try {
      const params = new URLSearchParams({ date: this.date, pending_only: this.pendingOnly ? '1' : '0' });
      if (this.centerId !== '') params.set('center_id', String(this.centerId));
      this.rows = await this.withTimeout(this.api.get<LabRow[]>(`/lab/worklist?${params.toString()}`));
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load lab worklist';
      this.rows = [];
      this.toast.error(this.error);
    } finally {
      clearTimeout(guard);
      this.loading = false;
      this.bootstrapped = true;
      this.cdr.detectChanges();
    }
  }

  async openResultModal(row: LabRow): Promise<void> {
    this.selectedOrder = row;
    this.resultForm = { summary: '', details: '' };
    this.cdr.detectChanges();
    try {
      const orders = await this.withTimeout(this.api.get<LabOrderDetail[]>(`/appointments/${row.appointment_id}/lab`));
      const current = orders.find((o) => o.id === row.order_id);
      this.resultForm.summary = current?.result?.summary || '';
      this.resultForm.details = current?.result?.details || '';
    } catch {
      // Keep modal open with empty form even if prefill fails.
    }
    this.cdr.detectChanges();
  }

  closeResultModal(): void {
    this.selectedOrder = null;
    this.resultForm = { summary: '', details: '' };
    this.cdr.detectChanges();
  }

  async saveResult(): Promise<void> {
    if (!this.selectedOrder) return;
    this.saving = true;
    this.error = '';
    try {
      await this.api.patch(`/appointments/lab-orders/${this.selectedOrder.order_id}/result`, {
        summary: this.resultForm.summary.trim() || null,
        details: this.resultForm.details.trim() || null,
      });
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
      await this.api.post(`/appointments/${row.appointment_id}/complete`, {});
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
