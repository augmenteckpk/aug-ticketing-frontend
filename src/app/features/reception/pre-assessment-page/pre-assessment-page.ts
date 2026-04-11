import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { SpeechInput } from '../../../ui-kit/speech-input/speech-input';
import { SlipPrintService } from '../../../core/services/slip-print.service';
import { ToastService } from '../../../core/services/toast';

type Center = { id: number; name: string; hospital_name?: string; city?: string };
type QueueRow = { id: number; token_number: number; patient_name: string; patient_cnic?: string; status: string };
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
  imports: [CommonModule, FormsModule, SpeechInput],
  templateUrl: './pre-assessment-page.html',
  styleUrl: './pre-assessment-page.scss',
})
export class PreAssessmentPage implements OnInit {
  centers: Center[] = [];
  centerId: number | '' = '';
  date = new Date().toISOString().slice(0, 10);
  rows: QueueRow[] = [];
  loading = false;
  bootstrapped = false;
  hasLoadedOnce = false;
  saving = false;
  /** Row id while POST ready-without-preassessment is in flight */
  readyWithoutId: number | null = null;
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
    private readonly slipPrint: SlipPrintService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  private async ensureCenterSelected(): Promise<void> {
    if (this.centerId !== '') return;
    if (!this.centers.length) await this.loadCenters();
    if (this.centerId === '' && this.centers[0]) this.centerId = this.centers[0].id;
  }

  async ngOnInit(): Promise<void> {
    await this.loadCenters();
    await this.load(true);
  }

  private async loadCenters(): Promise<void> {
    const ms = 20000;
    try {
      this.centers = await this.api.get<Center[]>('/centers', ms);
      if (!this.centers.length) this.centers = await this.api.get<Center[]>('/public/centers', ms);
      if (this.centers[0]) this.centerId = this.centers[0].id;
    } catch (e) {
      try {
        this.centers = await this.api.get<Center[]>('/public/centers', ms);
        if (this.centers[0]) this.centerId = this.centers[0].id;
      } catch {
        this.centers = [];
        this.error = e instanceof Error ? e.message : 'Failed to load centers';
      }
    }
    if (this.centerId === '' && this.centers[0]) {
      this.centerId = this.centers[0].id;
    }
  }

  async onFiltersChanged(): Promise<void> {
    if (!this.bootstrapped) return;
    await this.load(false);
  }

  async load(showSpinner = !this.bootstrapped): Promise<void> {
    await this.ensureCenterSelected();
    if (this.centerId === '' && this.centers[0]) this.centerId = this.centers[0].id;
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
      if (this.centerId !== '') base.set('center_id', String(this.centerId));
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
      this.toast.success('Pre-assessment saved. Patient moved to ready pool.');
      this.slipPrint.print('Pre-Assessment Slip', 'Vitals and triage notes', [
        { label: 'Token', value: String(selected.token_number) },
        { label: 'Patient', value: selected.patient_name || '-' },
        { label: 'CNIC', value: selected.patient_cnic || '-' },
        { label: 'Visit date', value: this.date },
        { label: 'BP', value: `${this.form.bp_systolic ?? '-'} / ${this.form.bp_diastolic ?? '-'}` },
        { label: 'Weight (kg)', value: this.form.weight_kg == null ? '-' : String(this.form.weight_kg) },
        { label: 'Height (cm)', value: this.form.height_cm == null ? '-' : String(this.form.height_cm) },
        { label: 'Blood sugar', value: this.form.blood_sugar_mg_dl == null ? '-' : String(this.form.blood_sugar_mg_dl) },
        { label: 'Symptoms', value: this.form.symptoms.trim() || '-' },
        { label: 'History', value: this.form.medical_history_notes.trim() || '-' },
        { label: 'Status after save', value: 'ready' },
      ]);
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
