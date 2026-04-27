import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { AuthService } from '../../../core/services/auth';
import { centerIdFromOpd, consoleIsAdmin, listCenterIdForRequest, listDateForRequest } from '../../../core/utils/listing-scope';
import { WorkflowStatusBadgePipe } from '../../../shared/pipes/status-badge.pipe';
import { SpeechInput } from '../../../ui-kit/speech-input/speech-input';
import { ToastService } from '../../../core/services/toast';
import { todayLocalYmd } from '../../../core/utils/local-date';

type Center = { id: number; name: string; hospital_name?: string; city?: string };
type OpdPickRow = { id: number; name: string; display_code: string; center_id: number; center_label: string; sort_order: number };
type QueueRow = {
  id: number;
  token_number: number;
  patient_name: string;
  patient_cnic?: string;
  status: string;
  center_name?: string | null;
  opd_name?: string | null;
  opd_display_code?: string | null;
  clinic_name?: string | null;
  ticket_display?: string | null;
};
type PreAssessmentInput = {
  bp_systolic: number | null;
  bp_diastolic: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  blood_sugar_mg_dl: number | null;
  symptoms: string;
  medical_history_notes: string;
};

@Component({
  selector: 'app-pre-assessment-page',
  imports: [CommonModule, FormsModule, SpeechInput, WorkflowStatusBadgePipe],
  templateUrl: './pre-assessment-page.html',
  styleUrl: './pre-assessment-page.scss',
})
export class PreAssessmentPage implements OnInit {
  centers: Center[] = [];
  opdPickList: OpdPickRow[] = [];
  filterOpdId: number | '' = '';
  centerId: number | '' = '';
  date = todayLocalYmd();
  rows: QueueRow[] = [];
  loading = false;
  bootstrapped = false;
  hasLoadedOnce = false;
  saving = false;
  /** Row id while POST ready-without-preassessment is in flight */
  readyWithoutId: number | null = null;
  /** Bulk selection for ready-without-vitals */
  selectedForBulk = new Set<number>();
  bulkReadyBusy = false;
  error = '';
  private loadRunId = 0;

  selected: QueueRow | null = null;
  form: PreAssessmentInput = {
    bp_systolic: null,
    bp_diastolic: null,
    weight_kg: null,
    height_cm: null,
    blood_sugar_mg_dl: null,
    symptoms: '',
    medical_history_notes: '',
  };

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  isAdmin(): boolean {
    return consoleIsAdmin(this.auth.user());
  }

  private syncListScope(): void {
    this.date = listDateForRequest(this.auth.user(), this.date);
    this.centerId = listCenterIdForRequest(this.auth.user(), this.centerId);
    if (this.isAdmin()) {
      this.centerId = centerIdFromOpd(this.opdPickList, this.filterOpdId);
    }
  }

  private async ensureCenterSelected(): Promise<void> {
    if (this.centerId !== '') return;
    if (this.isAdmin()) {
      if (!this.opdPickList.length) await this.loadCenters();
      if (this.filterOpdId === '' && this.opdPickList[0]) this.filterOpdId = this.opdPickList[0].id;
      this.centerId = centerIdFromOpd(this.opdPickList, this.filterOpdId);
      return;
    }
    const c = this.auth.user()?.opd_center_id;
    if (c != null) this.centerId = c;
  }

  async onAdminOpdChanged(): Promise<void> {
    this.centerId = centerIdFromOpd(this.opdPickList, this.filterOpdId);
    await this.onFiltersChanged();
  }

  async ngOnInit(): Promise<void> {
    await this.loadCenters();
    await this.load(true);
  }

  private async loadCenters(): Promise<void> {
    const ms = 20000;
    if (this.isAdmin()) {
      try {
        this.opdPickList = await this.api.get<OpdPickRow[]>('/public/opds', ms);
      } catch (e) {
        this.opdPickList = [];
        this.error = e instanceof Error ? e.message : 'Failed to load OPDs';
      }
      if (this.filterOpdId === '' && this.opdPickList[0]) this.filterOpdId = this.opdPickList[0].id;
      this.centerId = centerIdFromOpd(this.opdPickList, this.filterOpdId);
      return;
    }
    const c = this.auth.user()?.opd_center_id;
    if (c != null) this.centerId = c;
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
  }

  async onFiltersChanged(): Promise<void> {
    if (!this.bootstrapped) return;
    await this.load(false);
  }

  async load(showSpinner = !this.bootstrapped): Promise<void> {
    this.syncListScope();
    await this.ensureCenterSelected();
    const runId = ++this.loadRunId;
    const hasVisibleData = this.rows.length > 0;
    const useSpinner = showSpinner && !hasVisibleData;
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
    const apptMs = 20000;
    try {
      const base = new URLSearchParams({ date: this.date });
      if (this.isAdmin() && this.filterOpdId !== '') base.set('opd_id', String(this.filterOpdId));
      else if (this.centerId !== '') base.set('center_id', String(this.centerId));
      const qRegistered = new URLSearchParams(base);
      qRegistered.set('status', 'registered');
      const qCheckedIn = new URLSearchParams(base);
      qCheckedIn.set('status', 'checked_in');
      const [regRes, chkRes] = await Promise.allSettled([
        this.api.get<QueueRow[]>(`/appointments?${qRegistered.toString()}`, apptMs),
        this.api.get<QueueRow[]>(`/appointments?${qCheckedIn.toString()}`, apptMs),
      ]);

      if (this.loadRunId !== runId) return;

      const registered = regRes.status === 'fulfilled' ? regRes.value : [];
      const checkedIn = chkRes.status === 'fulfilled' ? chkRes.value : [];

      if (regRes.status === 'rejected' && chkRes.status === 'rejected') {
        const r0 = regRes.reason;
        this.error = r0 instanceof Error ? r0.message : 'Failed to load pre-assessment queue';
        if (!this.bootstrapped) this.rows = [];
        this.toast.error(this.error);
      } else if (registered.length > 0) {
        this.rows = registered;
      } else {
        this.rows = checkedIn;
      }
    } catch (e) {
      if (this.loadRunId !== runId) return;
      this.error = e instanceof Error ? e.message : 'Failed to load pre-assessment queue';
      if (!this.bootstrapped) this.rows = [];
      this.toast.error(this.error);
    } finally {
      clearTimeout(guard);
      if (this.loadRunId !== runId) return;
      if (useSpinner) this.loading = false;
      this.bootstrapped = true;
      this.hasLoadedOnce = true;
      const keep = new Set(this.rows.map((r) => r.id));
      this.selectedForBulk = new Set([...this.selectedForBulk].filter((id) => keep.has(id)));
      this.cdr.detectChanges();
    }
  }

  openAssessment(row: QueueRow): void {
    this.selected = row;
    this.form = {
      bp_systolic: null,
      bp_diastolic: null,
      weight_kg: null,
      height_cm: null,
      blood_sugar_mg_dl: null,
      symptoms: '',
      medical_history_notes: '',
    };
    this.cdr.detectChanges();
  }

  closeAssessment(): void {
    this.selected = null;
    this.cdr.detectChanges();
  }

  get allRowsSelected(): boolean {
    return this.rows.length > 0 && this.rows.every((r) => this.selectedForBulk.has(r.id));
  }

  toggleSelectAll(checked: boolean): void {
    if (checked) {
      this.rows.forEach((r) => this.selectedForBulk.add(r.id));
    } else {
      this.selectedForBulk.clear();
    }
    this.cdr.detectChanges();
  }

  toggleBulkRow(id: number, checked: boolean): void {
    if (checked) this.selectedForBulk.add(id);
    else this.selectedForBulk.delete(id);
    this.cdr.detectChanges();
  }

  async bulkReadyWithoutVitals(): Promise<void> {
    const ids = this.rows.filter((r) => this.selectedForBulk.has(r.id)).map((r) => r.id);
    if (!ids.length) {
      this.toast.error('Select at least one patient.');
      return;
    }
    this.bulkReadyBusy = true;
    this.error = '';
    try {
      for (const id of ids) {
        await this.api.post(`/appointments/${id}/ready-without-preassessment`, {});
      }
      this.toast.success(`${ids.length} patient(s) marked ready without pre-assessment vitals.`);
      this.selectedForBulk.clear();
      await this.load();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not complete bulk action';
      this.toast.error(this.error);
    } finally {
      this.bulkReadyBusy = false;
      this.cdr.detectChanges();
    }
  }

  async markReadyWithoutVitals(row: QueueRow): Promise<void> {
    this.readyWithoutId = row.id;
    this.error = '';
    try {
      await this.api.post(`/appointments/${row.id}/ready-without-preassessment`, {});
      this.toast.success('Patient marked ready without pre-assessment vitals.');
      this.rows = this.rows.filter((r) => r.id !== row.id);
      await this.load();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not mark ready';
      this.toast.error(this.error);
    } finally {
      this.readyWithoutId = null;
      this.cdr.detectChanges();
    }
  }

  async submitAssessment(): Promise<void> {
    if (!this.selected) return;
    const selected = this.selected;
    this.saving = true;
    this.error = '';
    try {
      await this.api.patch(`/appointments/${this.selected.id}/pre-assessment`, {
        ...this.form,
        symptoms: this.form.symptoms.trim() || null,
        medical_history_notes: this.form.medical_history_notes.trim() || null,
      });
      this.toast.success('Pre-assessment saved. Patient moved to ready pool. Vitals print on the doctor registration slip after consultation.');
      this.rows = this.rows.filter((r) => r.id !== selected.id);
      this.closeAssessment();
      await this.load();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to save pre-assessment';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

}
