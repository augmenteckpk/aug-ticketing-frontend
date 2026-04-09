import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { AuthService } from '../../../core/services/auth';
import { ConfirmService } from '../../../core/services/confirm';
import { ToastService } from '../../../core/services/toast';

type Center = { id: number; name: string; hospital_name?: string; city?: string };
type QueueReady = {
  id: number;
  token_number: number;
  patient_name: string;
  status: string;
  priority_level?: string | null;
  priority_notes?: string | null;
  priority_flagged_at?: string | null;
  priority_flagged_by_username?: string | null;
};
type Batch = { id: number; status: string; item_count: number; batch_index?: number; appointment_date?: string; created_at?: string };
type QueueNotArrived = { id: number; token_number: number; patient_name: string; status: string };
type QueueFlagged = {
  id: number;
  token_number: number;
  patient_name: string;
  patient_cnic?: string | null;
  priority_level?: string | null;
  priority_notes?: string | null;
  priority_flagged_at?: string | null;
  priority_flagged_by_username?: string | null;
};
type PhysicianTriageLevel = 'critical_immediate' | 'critical_today' | 'not_attending_today';
type BatchDetail = {
  batch: Batch;
  appointments: Array<{
    id: number;
    token_number: number;
    patient_name: string;
    patient_cnic?: string | null;
    department_name?: string | null;
    location?: string | null;
    status?: string | null;
  }>;
};
const EMERGENCY_LEVELS = new Set(['critical_immediate', 'critical_today']);

@Component({
  selector: 'app-queue-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './queue-page.html',
  styleUrl: './queue-page.scss',
})
export class QueuePage implements OnInit, OnDestroy {
  centers: Center[] = [];
  centerId: number | '' = '';
  date = new Date().toISOString().slice(0, 10);
  readyRows: QueueReady[] = [];
  notArrivedRows: QueueNotArrived[] = [];
  flaggedRows: QueueFlagged[] = [];
  notAttendingRows: QueueFlagged[] = [];
  batches: Batch[] = [];
  selectedBatch: BatchDetail | null = null;
  priorityModal: QueueReady | null = null;
  priorityLevel: PhysicianTriageLevel = 'critical_immediate';
  priorityNotes = '';
  swapBatch: BatchDetail | null = null;
  swapRemoveId: number | '' = '';
  swapAddId: number | '' = '';
  loading = false;
  saving = false;
  error = '';
  poolSize = 20;
  live = true;
  bootstrapped = false;
  hasLoadedOnce = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private loadRunId = 0;

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  private async withTimeout<T>(promise: Promise<T>, ms = 20000): Promise<T> {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Request timed out. Please retry.')), ms)),
    ]);
  }

  private async ensureCenterSelected(): Promise<void> {
    if (this.centerId !== '') return;
    if (!this.centers.length) await this.loadCenters();
    if (this.centerId === '' && this.centers[0]) this.centerId = this.centers[0].id;
  }

  async ngOnInit(): Promise<void> {
    await this.loadCenters();
    await this.load(true);
    this.startPolling();
  }

  private async loadCenters(): Promise<void> {
    try {
      this.centers = await this.api.get<Center[]>('/centers', 20000);
      if (!this.centers.length) this.centers = await this.api.get<Center[]>('/public/centers', 20000);
      if (this.centers[0]) this.centerId = this.centers[0].id;
    } catch (e) {
      try {
        this.centers = await this.api.get<Center[]>('/public/centers', 20000);
        if (this.centers[0]) this.centerId = this.centers[0].id;
      } catch {
        this.centers = [];
        this.error = e instanceof Error ? e.message : 'Failed to load centers';
      }
    }
  }

  async onFiltersChanged(): Promise<void> {
    await this.load(true);
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  async load(showSpinner = true): Promise<void> {
    await this.ensureCenterSelected();
    if (this.centerId === '') {
      this.error = this.centers.length ? 'Select a center to load the queue.' : 'No centers available.';
      this.toast.error(this.error);
      this.cdr.detectChanges();
      return;
    }
    const runId = ++this.loadRunId;
    const useSpinner = showSpinner;
    if (useSpinner) this.loading = true;
    this.error = '';
    const guardMs = 25000;
    const guard = setTimeout(() => {
      if (this.loadRunId !== runId || !this.loading) return;
      if (useSpinner) this.loading = false;
      this.error = 'Request timed out. Please click Refresh.';
      this.toast.error(this.error);
      this.cdr.detectChanges();
    }, guardMs);
    try {
      const params = new URLSearchParams({ date: this.date, center_id: String(this.centerId) });
      const q = params.toString();
      const [readyRes, batchesRes, notArrivedRes, flaggedRes, notAttendingRes] = await Promise.allSettled([
        this.withTimeout(this.api.get<QueueReady[]>(`/queue/ready?${q}`), 20000),
        this.withTimeout(this.api.get<Batch[]>(`/queue/batches?${q}`), 20000),
        this.withTimeout(this.api.get<QueueNotArrived[]>(`/queue/not-arrived?${q}`), 20000),
        this.withTimeout(this.api.get<QueueFlagged[]>(`/queue/flagged-pool?${q}`), 20000),
        this.withTimeout(this.api.get<QueueFlagged[]>(`/queue/not-attending-today?${q}`), 20000),
      ]);

      if (this.loadRunId !== runId) return;

      if (readyRes.status !== 'fulfilled') throw readyRes.reason;
      const readyRows = readyRes.value;
      const flaggedFromReady = readyRows.filter((r) => EMERGENCY_LEVELS.has(String(r.priority_level || '')));
      const notAttendingFromReady = readyRows.filter((r) => String(r.priority_level || '') === 'not_attending_today');

      this.readyRows = readyRows;
      this.batches = batchesRes.status === 'fulfilled' ? batchesRes.value : [];
      this.notArrivedRows = notArrivedRes.status === 'fulfilled' ? notArrivedRes.value : [];
      this.flaggedRows = flaggedRes.status === 'fulfilled' ? flaggedRes.value : flaggedFromReady;
      this.notAttendingRows = notAttendingRes.status === 'fulfilled' ? notAttendingRes.value : notAttendingFromReady;
    } catch (e) {
      if (this.loadRunId !== runId) return;
      this.error = e instanceof Error ? e.message : 'Failed to load queue';
      if (!this.bootstrapped) {
        this.readyRows = [];
        this.notArrivedRows = [];
        this.batches = [];
        this.flaggedRows = [];
        this.notAttendingRows = [];
      }
      this.toast.error(this.error);
    } finally {
      clearTimeout(guard);
      if (this.loadRunId !== runId) return;
      if (useSpinner) this.loading = false;
      this.bootstrapped = true;
      this.hasLoadedOnce = true;
      this.cdr.detectChanges();
    }
  }

  startPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      if (!this.live || this.saving || this.loading) return;
      void this.load(false);
    }, 5000);
  }

  get draftBatches(): Batch[] {
    return this.batches.filter((b) => b.status === 'draft');
  }

  get dispatchedBatches(): Batch[] {
    return this.batches.filter((b) => b.status === 'dispatched');
  }

  get totalBatchItems(): number {
    return this.batches.reduce((sum, b) => sum + (b.item_count || 0), 0);
  }

  async createBatch(): Promise<void> {
    if (this.centerId === '') return;
    const ok = await this.confirm.ask({
      title: 'Create batch',
      message: 'Create a new queue batch for this center and date?',
      confirmText: 'Create',
    });
    if (!ok) return;
    this.saving = true;
    try {
      await this.api.post('/queue/batches', {
        center_id: this.centerId,
        appointment_date: this.date,
        size: Math.max(1, Math.min(200, Number(this.poolSize) || 20)),
      });
      await this.load();
      this.toast.success('Batch created.');
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Failed to create batch';
      this.error = raw.includes('No patients in the ready pool')
        ? 'No patients in Ready Pool. Complete registration and pre-assessment first.'
        : raw;
      this.toast.error(this.error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async dispatchBatch(id: number): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Dispatch batch',
      message: `Dispatch batch #${id} now?`,
      confirmText: 'Dispatch',
    });
    if (!ok) return;
    this.saving = true;
    try {
      await this.api.post(`/queue/batches/${id}/dispatch`, {});
      await this.load();
      this.toast.success(`Batch #${id} dispatched.`);
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to dispatch batch';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  can(permission: string): boolean {
    return this.auth.can(permission);
  }

  triageLabel(level?: string | null): string {
    if (level === 'critical_immediate') return 'See immediately';
    if (level === 'critical_today') return 'See today';
    if (level === 'not_attending_today') return 'Not attending today';
    return '—';
  }

  openPriorityModal(row: QueueReady): void {
    this.priorityModal = row;
    this.priorityLevel = (row.priority_level as PhysicianTriageLevel) || 'critical_immediate';
    this.priorityNotes = row.priority_notes || '';
    this.cdr.detectChanges();
  }

  closePriorityModal(): void {
    this.priorityModal = null;
    this.priorityNotes = '';
    this.cdr.detectChanges();
  }

  async savePriorityFlag(): Promise<void> {
    if (!this.priorityModal) return;
    this.saving = true;
    try {
      await this.api.patch(`/appointments/${this.priorityModal.id}/priority`, {
        priority_level: this.priorityLevel,
        priority_notes: this.priorityNotes.trim() || null,
      });
      this.toast.success('Priority flag saved.');
      this.closePriorityModal();
      await this.load();
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not save priority flag');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async clearPriorityFlag(): Promise<void> {
    if (!this.priorityModal) return;
    this.saving = true;
    try {
      await this.api.patch(`/appointments/${this.priorityModal.id}/priority`, {
        priority_level: 'normal',
        priority_notes: null,
      });
      this.toast.success('Priority flag cleared.');
      this.closePriorityModal();
      await this.load();
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not clear priority flag');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async openSwapModal(batch: Batch): Promise<void> {
    try {
      this.swapBatch = await this.api.get<BatchDetail>(`/queue/batches/${batch.id}`);
      this.swapRemoveId = this.swapBatch.appointments[0]?.id || '';
      this.swapAddId = this.flaggedRows[0]?.id || '';
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not load batch details');
    }
    this.cdr.detectChanges();
  }

  async openBatchDetails(batchId: number): Promise<void> {
    try {
      this.selectedBatch = await this.api.get<BatchDetail>(`/queue/batches/${batchId}`);
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not load batch details');
      this.selectedBatch = null;
    }
    this.cdr.detectChanges();
  }

  closeSwapModal(): void {
    this.swapBatch = null;
    this.swapRemoveId = '';
    this.swapAddId = '';
    this.cdr.detectChanges();
  }

  async confirmSwap(): Promise<void> {
    if (!this.swapBatch || this.swapRemoveId === '' || this.swapAddId === '') return;
    this.saving = true;
    try {
      await this.api.post(`/queue/batches/${this.swapBatch.batch.id}/swap`, {
        remove_appointment_id: this.swapRemoveId,
        add_appointment_id: this.swapAddId,
      });
      this.toast.success('Batch slot replaced.');
      this.closeSwapModal();
      await this.load();
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not replace slot');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }
}
