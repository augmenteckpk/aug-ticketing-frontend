import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { SlipPrintService } from '../../../core/services/slip-print.service';
import { SpeechInput } from '../../../ui-kit/speech-input/speech-input';
import { ToastService } from '../../../core/services/toast';

type Center = { id: number; name: string; hospital_name?: string; city?: string };
type Appointment = {
  id: number;
  token_number: number;
  patient_name: string;
  patient_cnic?: string | null;
  center_id: number;
  center_name?: string | null;
  status: string;
  consultation_outcome?: string | null;
  follow_up_advised_date?: string | null;
  follow_up_advised_department_id?: number | null;
  follow_up_advised_clinic_id?: number | null;
  follow_up_advised_department_name?: string | null;
  follow_up_advised_clinic_name?: string | null;
};

type DepartmentRow = { id: number; name: string };
type ClinicRow = { id: number; name: string; department_name: string; schedule?: string | null };
type WeekdayRouteRow = {
  weekday: number;
  department_id: number;
  department?: { id: number; name: string } | null;
};
type LabOrder = { id: number; test_code?: string | null; notes?: string | null; status?: string | null; result?: unknown };
type LabReportResult = { summary?: string | null; details?: string | null };
type ReportModalData = { appointment: Appointment; orders: LabOrder[] };

@Component({
  selector: 'app-consultation-page',
  imports: [CommonModule, FormsModule, SpeechInput],
  templateUrl: './consultation-page.html',
  styleUrl: './consultation-page.scss',
})
export class ConsultationPage implements OnInit {
  centers: Center[] = [];
  centerId: number | '' = '';
  date = new Date().toISOString().slice(0, 10);
  rows: Appointment[] = [];
  followUpRows: Appointment[] = [];
  selected: Appointment | null = null;
  selectedReport: ReportModalData | null = null;
  labOrders: LabOrder[] = [];

  loading = false;
  bootstrapped = false;
  hasLoadedOnce = false;
  saving = false;
  error = '';
  private loadRunId = 0;

  consultForm = {
    consultation_outcome: 'medication_only',
    doctor_notes: '',
    follow_up_advised_date: '',
    follow_up_advised_department_id: '' as number | '',
    follow_up_advised_clinic_id: '' as number | '',
  };

  /** Departments linked to the selected visit's center */
  departmentsForCenter: DepartmentRow[] = [];
  /** OPD weekday routing for that center (which department runs which day) */
  weekdayRoutes: WeekdayRouteRow[] = [];
  /** Clinics for chosen follow-up department */
  clinicsForFollowUp: ClinicRow[] = [];
  readonly weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

  labForm = {
    test_code: '',
    notes: '',
  };

  creatingLabOrder = false;
  followUpSearch = '';

  constructor(
    private readonly api: ApiService,
    private readonly slipPrint: SlipPrintService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  private async withTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
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
    await this.refreshAll();
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
    this.cdr.detectChanges();
  }

  async refreshAll(): Promise<void> {
    await this.load();
    void this.loadFollowUpRows();
  }

  async onFiltersChanged(): Promise<void> {
    if (!this.bootstrapped) return;
    await this.load(false);
    void this.loadFollowUpRows();
  }

  async load(showSpinner = !this.bootstrapped): Promise<void> {
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
    try {
      const q = new URLSearchParams({ date: this.date, status: 'dispatched' });
      if (this.centerId !== '') q.set('center_id', String(this.centerId));
      this.rows = await this.withTimeout(this.api.get<Appointment[]>(`/appointments?${q.toString()}`, 20000), 21000);
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load consultation queue';
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

  async loadFollowUpRows(): Promise<void> {
    try {
      const q = new URLSearchParams({ status: 'completed' });
      if (this.centerId !== '') q.set('center_id', String(this.centerId));
      const completed = await this.withTimeout(this.api.get<Appointment[]>(`/appointments?${q.toString()}`, 20000), 21000);
      // Fast initial render: show explicit follow-up outcomes immediately.
      const followUpByOutcome = completed.filter((row) => String(row.consultation_outcome || '') === 'follow_up');
      this.followUpRows = followUpByOutcome;
      this.cdr.detectChanges();
      // Background enrichment: append completed visits that have lab reports.
      const sample = completed.slice(0, 40);
      void Promise.all(
        sample.map(async (row) => {
          try {
            const orders = await this.withTimeout(this.api.get<LabOrder[]>(`/appointments/${row.id}/lab`, 8000), 9000);
            const hasLabReport =
              orders.length > 0 &&
              orders.some(
                (o) =>
                  String(o.status || '').toLowerCase() === 'completed' ||
                  !!this.parseResult(o.result).summary ||
                  !!this.parseResult(o.result).details,
              );
            return hasLabReport ? row : null;
          } catch {
            return null;
          }
        }),
      ).then((labReportRows) => {
        const seen = new Set(this.followUpRows.map((r) => r.id));
        const merged = [...this.followUpRows];
        for (const row of labReportRows) {
          if (!row || seen.has(row.id)) continue;
          seen.add(row.id);
          merged.push(row);
        }
        this.followUpRows = merged;
        this.cdr.detectChanges();
      });
    } catch {
      this.followUpRows = [];
      this.cdr.detectChanges();
    }
  }

  async selectAppointment(row: Appointment): Promise<void> {
    this.selected = row;
    const adv = row.follow_up_advised_date ? String(row.follow_up_advised_date).slice(0, 10) : '';
    this.consultForm = {
      consultation_outcome: (row.consultation_outcome || 'medication_only') as string,
      doctor_notes: '',
      follow_up_advised_date: adv,
      follow_up_advised_department_id: row.follow_up_advised_department_id ?? '',
      follow_up_advised_clinic_id: row.follow_up_advised_clinic_id ?? '',
    };
    this.clinicsForFollowUp = [];
    this.cdr.detectChanges();
    await this.loadConsultReference(row.center_id);
    if (this.consultForm.follow_up_advised_department_id !== '') {
      await this.loadFollowUpClinics(row.center_id, Number(this.consultForm.follow_up_advised_department_id));
    }
    await this.loadLabOrders();
  }

  private async loadConsultReference(centerId: number): Promise<void> {
    try {
      const [depts, routes] = await Promise.all([
        this.withTimeout(
          this.api.get<DepartmentRow[]>(`/departments?center_id=${centerId}&active_only=true`, 15000),
          16000,
        ),
        this.withTimeout(this.api.get<WeekdayRouteRow[]>(`/centers/${centerId}/weekday-routes`, 15000), 16000),
      ]);
      this.departmentsForCenter = depts ?? [];
      this.weekdayRoutes = routes ?? [];
    } catch {
      this.departmentsForCenter = [];
      this.weekdayRoutes = [];
    }
    this.cdr.detectChanges();
  }

  async onFollowUpDepartmentChange(id: number | ''): Promise<void> {
    this.consultForm.follow_up_advised_department_id = id;
    this.consultForm.follow_up_advised_clinic_id = '';
    this.clinicsForFollowUp = [];
    if (!this.selected || id === '') {
      this.cdr.detectChanges();
      return;
    }
    await this.loadFollowUpClinics(this.selected.center_id, Number(id));
    this.cdr.detectChanges();
  }

  private async loadFollowUpClinics(centerId: number, departmentId: number): Promise<void> {
    try {
      const q = new URLSearchParams({
        center_id: String(centerId),
        department_id: String(departmentId),
        active_only: 'true',
      });
      this.clinicsForFollowUp = await this.withTimeout(
        this.api.get<ClinicRow[]>(`/clinics?${q.toString()}`, 15000),
        16000,
      );
    } catch {
      this.clinicsForFollowUp = [];
    }
    this.cdr.detectChanges();
  }

  weekdayRouteLabel(wd: number): string {
    const r = this.weekdayRoutes.find((x) => x.weekday === wd);
    if (!r) return '—';
    return (
      r.department?.name ?? this.departmentsForCenter.find((d) => d.id === r.department_id)?.name ?? '—'
    );
  }

  async loadLabOrders(): Promise<void> {
    if (!this.selected) return;
    try {
      this.labOrders = await this.withTimeout(this.api.get<LabOrder[]>(`/appointments/${this.selected.id}/lab`, 8000), 9000);
    } catch {
      this.labOrders = [];
    }
    this.cdr.detectChanges();
  }

  async saveConsultation(): Promise<void> {
    if (!this.selected) return;
    this.saving = true;
    this.error = '';
    try {
      await this.api.patch(`/appointments/${this.selected.id}/consultation`, {
        consultation_outcome: this.consultForm.consultation_outcome,
        doctor_notes: this.consultForm.doctor_notes || null,
        follow_up_advised_date:
          this.consultForm.consultation_outcome === 'follow_up'
            ? this.consultForm.follow_up_advised_date || null
            : null,
        follow_up_advised_department_id:
          this.consultForm.consultation_outcome === 'follow_up' && this.consultForm.follow_up_advised_department_id !== ''
            ? Number(this.consultForm.follow_up_advised_department_id)
            : null,
        follow_up_advised_clinic_id:
          this.consultForm.consultation_outcome === 'follow_up' && this.consultForm.follow_up_advised_clinic_id !== ''
            ? Number(this.consultForm.follow_up_advised_clinic_id)
            : null,
      });
      this.printConsultationSlip(this.selected);
      await this.refreshAll();
      this.toast.success('Consultation saved.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not save consultation';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async completeFromConsultation(): Promise<void> {
    if (!this.selected) return;
    if (this.consultForm.consultation_outcome === 'lab_required') {
      this.toast.error('Lab-required visits must be completed from Laboratory after result entry.');
      return;
    }
    this.saving = true;
    this.error = '';
    try {
      await this.api.post(`/appointments/${this.selected.id}/complete`, {});
      this.toast.success(`Patient journey completed for token #${this.selected.token_number}.`);
      this.selected = null;
      await this.refreshAll();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not complete patient journey';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async createLabOrder(): Promise<void> {
    if (!this.selected) return;
    this.saving = true;
    this.error = '';
    try {
      await this.api.post(`/appointments/${this.selected.id}/lab-orders`, {
        test_code: this.labForm.test_code || null,
        notes: this.labForm.notes || null,
      });
      this.labForm = { test_code: '', notes: '' };
      this.creatingLabOrder = false;
      await this.loadLabOrders();
      this.toast.success('Lab order created.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not create lab order';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  private printConsultationSlip(row: Appointment): void {
    const deptName =
      this.consultForm.follow_up_advised_department_id !== ''
        ? this.departmentsForCenter.find((d) => d.id === Number(this.consultForm.follow_up_advised_department_id))?.name
        : undefined;
    const clinicName =
      this.consultForm.follow_up_advised_clinic_id !== ''
        ? this.clinicsForFollowUp.find((c) => c.id === Number(this.consultForm.follow_up_advised_clinic_id))?.name
        : undefined;
    this.slipPrint.print('Consultation Slip', 'Doctor consultation outcome', [
      { label: 'Token', value: String(row.token_number) },
      { label: 'Patient', value: row.patient_name || '-' },
      { label: 'CNIC', value: row.patient_cnic || '-' },
      { label: 'Center', value: row.center_name || '-' },
      { label: 'Visit date', value: this.date },
      { label: 'Outcome', value: this.consultForm.consultation_outcome || '-' },
      { label: 'Doctor notes', value: this.consultForm.doctor_notes.trim() || '-' },
      {
        label: 'Follow-up date',
        value:
          this.consultForm.consultation_outcome === 'follow_up'
            ? this.consultForm.follow_up_advised_date || '-'
            : '-',
      },
      {
        label: 'Follow-up department',
        value:
          this.consultForm.consultation_outcome === 'follow_up'
            ? deptName || (this.consultForm.follow_up_advised_department_id !== '' ? String(this.consultForm.follow_up_advised_department_id) : '-')
            : '-',
      },
      {
        label: 'Follow-up OPD / clinic',
        value: this.consultForm.consultation_outcome === 'follow_up' ? clinicName || '-' : '-',
      },
    ]);
  }

  get filteredFollowUpRows(): Appointment[] {
    const q = this.followUpSearch.trim().toLowerCase();
    if (!q) return this.followUpRows;
    return this.followUpRows.filter((r) => {
      const patient = String(r.patient_name || '').toLowerCase();
      const cnic = String(r.patient_cnic || '').toLowerCase();
      const token = String(r.token_number || '');
      return patient.includes(q) || cnic.includes(q) || token.includes(q);
    });
  }

  async openReportModal(row: Appointment): Promise<void> {
    try {
      const orders = await this.withTimeout(this.api.get<LabOrder[]>(`/appointments/${row.id}/lab`, 8000), 9000);
      this.selectedReport = { appointment: row, orders };
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not load report details');
      this.selectedReport = null;
    }
    this.cdr.detectChanges();
  }

  closeReportModal(): void {
    this.selectedReport = null;
    this.cdr.detectChanges();
  }

  parseResult(result: unknown): LabReportResult {
    if (result && typeof result === 'object') return result as LabReportResult;
    return {};
  }
}
