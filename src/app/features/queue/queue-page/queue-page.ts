import { CommonModule } from '@angular/common';
import { WorkflowStatusBadgePipe } from '../../../shared/pipes/status-badge.pipe';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { AuthService } from '../../../core/services/auth';
import { ConfirmService } from '../../../core/services/confirm';
import { ToastService } from '../../../core/services/toast';
import { centerIdFromOpd, listDateForRequest } from '../../../core/utils/listing-scope';
import { todayLocalYmd } from '../../../core/utils/local-date';

type Center = { id: number; name: string; hospital_name?: string; city?: string };
type OpdPickRow = { id: number; name: string; display_code: string; center_id: number; center_label: string; sort_order: number };
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
type DoctorRoom = {
  dispatched_total: number;
  remaining_with_doctor: number;
  remaining_token_numbers: number[];
};
type Batch = {
  id: number;
  status: string;
  item_count: number;
  batch_index?: number;
  appointment_date?: string;
  created_at?: string;
  clinic_id?: number | null;
  doctor_room?: DoctorRoom;
};
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
    opd_display_code?: string | null;
    opd_name?: string | null;
    clinic_name?: string | null;
    location?: string | null;
    status?: string | null;
  }>;
  doctor_room?: DoctorRoom;
};
const EMERGENCY_LEVELS = new Set(['critical_immediate', 'critical_today']);

@Component({
  selector: 'app-queue-page',
  imports: [CommonModule, FormsModule, WorkflowStatusBadgePipe],
  templateUrl: './queue-page.html',
  styleUrl: './queue-page.scss',
})
export class QueuePage implements OnInit, OnDestroy {
  centers: Center[] = [];
  centerId: number | '' = '';
  /** Admin: pick OPD → we derive `centerId` for queue APIs. */
  opdPickList: OpdPickRow[] = [];
  adminFilterOpdId: number | '' = '';
  date = todayLocalYmd();
  readyRows: QueueReady[] = [];
  notArrivedRows: QueueNotArrived[] = [];
  flaggedRows: QueueFlagged[] = [];
  notAttendingRows: QueueFlagged[] = [];
  batches: Batch[] = [];
  selectedBatch: BatchDetail | null = null;
  selectedBatchLoading = false;
  priorityModal: QueueReady | null = null;
  priorityLevel: PhysicianTriageLevel = 'critical_immediate';
  priorityNotes = '';
  swapBatch: BatchDetail | null = null;
  swapLoading = false;
  swapRemoveId: number | '' = '';
  swapAddId: number | '' = '';
  loading = false;
  refreshing = false;
  saving = false;
  error = '';
  poolSize = 20;
  /** Per-clinic batch lane (required for non-admin queue APIs). */
  clinicLaneId: number | '' = '';
  clinicOptions: { id: number; label: string }[] = [];
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

  isQueueAdmin(): boolean {
    return this.auth.user()?.role === 'admin';
  }

  private queueQueryString(): string {
    const d = listDateForRequest(this.auth.user(), this.date);
    const params = new URLSearchParams({ date: d, center_id: String(this.centerId) });
    if (this.clinicLaneId !== '') params.set('clinic_id', String(this.clinicLaneId));
    return params.toString();
  }

  private async loadClinicLaneOptions(): Promise<void> {
    if (this.centerId === '' || !this.date) return;
    const d = listDateForRequest(this.auth.user(), this.date);
    try {
      const res = await this.api.get<{
        opds: Array<{
          opd: { id: number; name: string };
          clinics: Array<{ clinic_id: number; clinic_name: string | null }>;
        }>;
      }>(`/centers/${this.centerId}/opd-booking-options?date=${encodeURIComponent(d)}`);
      const staffOpdId = this.auth.user()?.opd_id;
      const opts: { id: number; label: string }[] = [];
      for (const block of res.opds ?? []) {
        if (!this.isQueueAdmin() && staffOpdId != null && block.opd.id !== staffOpdId) continue;
        for (const cl of block.clinics ?? []) {
          opts.push({
            id: cl.clinic_id,
            label: `${block.opd.name} — ${cl.clinic_name ?? 'Clinic ' + cl.clinic_id}`,
          });
        }
      }
      this.clinicOptions = opts;
      if (!this.isQueueAdmin() && opts.length && this.clinicLaneId === '') {
        this.clinicLaneId = opts[0].id;
      }
    } catch {
      this.clinicOptions = [];
    }
  }

  private async ensureCenterSelected(): Promise<void> {
    if (this.centerId !== '') return;
    if (this.isQueueAdmin()) {
      if (!this.opdPickList.length) await this.loadCenters();
      if (this.adminFilterOpdId === '' && this.opdPickList[0]) this.adminFilterOpdId = this.opdPickList[0].id;
      this.centerId = centerIdFromOpd(this.opdPickList, this.adminFilterOpdId);
      return;
    }
    const c = this.auth.user()?.opd_center_id;
    if (c != null) this.centerId = c;
  }

  async ngOnInit(): Promise<void> {
    await this.loadCenters();
    await this.load(true);
    this.startPolling();
  }

  private async loadCenters(): Promise<void> {
    const ms = 20000;
    if (this.isQueueAdmin()) {
      try {
        this.opdPickList = await this.api.get<OpdPickRow[]>('/public/opds', ms);
      } catch (e) {
        this.opdPickList = [];
        this.error = e instanceof Error ? e.message : 'Failed to load OPDs';
      }
      if (this.adminFilterOpdId === '' && this.opdPickList[0]) this.adminFilterOpdId = this.opdPickList[0].id;
      this.centerId = centerIdFromOpd(this.opdPickList, this.adminFilterOpdId);
      return;
    }
    const c = this.auth.user()?.opd_center_id;
    if (c != null) this.centerId = c;
    this.centers = [];
  }

  async onAdminOpdChanged(): Promise<void> {
    this.centerId = centerIdFromOpd(this.opdPickList, this.adminFilterOpdId);
    this.clinicLaneId = '';
    await this.load(false);
  }

  async onFiltersChanged(): Promise<void> {
    if (!this.isQueueAdmin()) {
      this.date = listDateForRequest(this.auth.user(), this.date);
    }
    this.clinicLaneId = '';
    await this.load(false);
  }

  async onClinicLaneChanged(): Promise<void> {
    await this.load(false);
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  async load(showSpinner = true): Promise<void> {
    this.date = listDateForRequest(this.auth.user(), this.date);
    await this.ensureCenterSelected();
    if (this.centerId === '') {
      this.error = this.isQueueAdmin()
        ? 'Select an OPD to load the queue.'
        : 'Your account has no site (OPD center) assigned. Ask an administrator to assign you to an OPD.';
      this.toast.error(this.error);
      this.cdr.detectChanges();
      return;
    }
    await this.loadClinicLaneOptions();
    if (!this.isQueueAdmin() && this.clinicLaneId === '') {
      this.error =
        'No clinic lane is available for your OPD on this date (check the weekday roster), or your account has no OPD assigned.';
      this.toast.error(this.error);
      this.readyRows = [];
      this.notArrivedRows = [];
      this.batches = [];
      this.flaggedRows = [];
      this.notAttendingRows = [];
      this.cdr.detectChanges();
      return;
    }
    const runId = ++this.loadRunId;
    const hasAnyRows =
      this.readyRows.length +
        this.notArrivedRows.length +
        this.batches.length +
        this.flaggedRows.length +
        this.notAttendingRows.length >
      0;
    const useSpinner = showSpinner && !hasAnyRows;
    if (useSpinner) this.loading = true;
    if (!useSpinner) this.refreshing = true;
    this.error = '';
    this.cdr.detectChanges();
    const guardMs = 25000;
    const guard = setTimeout(() => {
      if (this.loadRunId !== runId || !this.loading) return;
      if (useSpinner) this.loading = false;
      this.error = 'Request timed out. Please click Refresh.';
      this.toast.error(this.error);
      this.cdr.detectChanges();
    }, guardMs);
    try {
      const q = this.queueQueryString();
      const reqMs = 20000;
      const [readyRes, batchesRes, notArrivedRes, flaggedRes, notAttendingRes] = await Promise.allSettled([
        this.withTimeout(this.api.get<QueueReady[]>(`/queue/ready?${q}`, reqMs), reqMs),
        this.withTimeout(this.api.get<Batch[]>(`/queue/batches?${q}`, reqMs), reqMs),
        this.withTimeout(this.api.get<QueueNotArrived[]>(`/queue/not-arrived?${q}`, reqMs), reqMs),
        this.withTimeout(this.api.get<QueueFlagged[]>(`/queue/flagged-pool?${q}`, reqMs), reqMs),
        this.withTimeout(this.api.get<QueueFlagged[]>(`/queue/not-attending-today?${q}`, reqMs), reqMs),
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
      this.refreshing = false;
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

  /** Cleared “doctor room” slots (consultation outcome and/or lab or radiology recorded). */
  doctorSlotsCleared(b: Batch): number {
    const dr = b.doctor_room;
    if (!dr) return 0;
    return Math.max(0, dr.dispatched_total - dr.remaining_with_doctor);
  }

  /**
   * Visual strip: first cells are cleared (green), remainder still with doctor (amber).
   * Capped for very large batches; see `doctorSlotsHiddenCount`.
   */
  doctorSlotPattern(b: Batch): Array<'cleared' | 'open'> {
    const dr = b.doctor_room;
    if (!dr) return [];
    const cleared = this.doctorSlotsCleared(b);
    const cap = 48;
    const total = Math.min(dr.dispatched_total, cap);
    const out: Array<'cleared' | 'open'> = [];
    for (let i = 0; i < total; i++) {
      out.push(i < cleared ? 'cleared' : 'open');
    }
    return out;
  }

  doctorSlotsHiddenCount(b: Batch): number {
    const dr = b.doctor_room;
    if (!dr) return 0;
    return Math.max(0, dr.dispatched_total - 48);
  }

  formatRemainingTokens(nums: number[]): string {
    return nums.map((t) => `#${t}`).join(' · ');
  }

  async createBatch(): Promise<void> {
    if (this.centerId === '') return;
    if (!this.isQueueAdmin() && this.clinicLaneId === '') {
      this.toast.error('A clinic lane is required to create batches for your OPD. Check the roster for this date.');
      return;
    }
    const ok = await this.confirm.ask({
      title: 'Create batch',
      message: 'Create a new queue batch for this center and date?',
      confirmText: 'Create',
    });
    if (!ok) return;
    this.saving = true;
    try {
      const body: Record<string, unknown> = {
        center_id: this.centerId,
        appointment_date: listDateForRequest(this.auth.user(), this.date),
        size: Math.max(1, Math.min(200, Number(this.poolSize) || 20)),
      };
      if (this.clinicLaneId !== '') body['clinic_id'] = this.clinicLaneId;
      await this.api.post('/queue/batches', body);
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
    this.swapBatch = { batch, appointments: [] };
    this.swapRemoveId = '';
    this.swapAddId = '';
    this.swapLoading = true;
    this.cdr.detectChanges();
    try {
      const next = await this.api.get<BatchDetail>(`/queue/batches/${batch.id}`);
      if (!this.swapBatch || this.swapBatch.batch.id !== batch.id) return;
      this.swapBatch = next;
      this.swapRemoveId = this.swapBatch.appointments[0]?.id || '';
      this.swapAddId = this.flaggedRows[0]?.id || '';
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not load batch details');
      this.swapBatch = null;
    }
    this.swapLoading = false;
    this.cdr.detectChanges();
  }

  async openBatchDetails(batchId: number): Promise<void> {
    this.selectedBatch = { batch: { id: batchId, status: '—', item_count: 0 }, appointments: [] };
    this.selectedBatchLoading = true;
    this.cdr.detectChanges();
    try {
      const next = await this.api.get<BatchDetail>(`/queue/batches/${batchId}`);
      if (!this.selectedBatch || this.selectedBatch.batch.id !== batchId) return;
      this.selectedBatch = next;
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not load batch details');
      this.selectedBatch = null;
    }
    this.selectedBatchLoading = false;
    this.cdr.detectChanges();
  }

  closeSwapModal(): void {
    this.swapBatch = null;
    this.swapLoading = false;
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
