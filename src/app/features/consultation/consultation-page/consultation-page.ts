import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { AuthService } from '../../../core/services/auth';
import { SlipPrintService, type SlipField } from '../../../core/services/slip-print.service';
import { centerIdFromOpd, consoleIsAdmin, listCenterIdForRequest, listDateForRequest } from '../../../core/utils/listing-scope';
import { todayLocalYmd } from '../../../core/utils/local-date';
import { WorkflowStatusBadgePipe } from '../../../shared/pipes/status-badge.pipe';
import { SpeechInput } from '../../../ui-kit/speech-input/speech-input';
import { ToastService } from '../../../core/services/toast';
import { Pagination } from '../../../ui-kit/pagination/pagination';

type Center = { id: number; name: string; hospital_name?: string; city?: string };
type OpdPickRow = { id: number; name: string; display_code: string; center_id: number; center_label: string; sort_order: number };
type Appointment = {
  id: number;
  token_number: number;
  patient_name: string;
  patient_cnic?: string | null;
  center_id: number;
  center_name?: string | null;
  opd_name?: string | null;
  opd_display_code?: string | null;
  clinic_name?: string | null;
  ticket_display?: string | null;
  status: string;
  consultation_outcome?: string | null;
  follow_up_advised_date?: string | null;
  follow_up_advised_department_id?: number | null;
  follow_up_advised_clinic_id?: number | null;
  follow_up_advised_department_name?: string | null;
  follow_up_advised_clinic_name?: string | null;
};

type ClinicRow = {
  id: number;
  name: string;
  opd_display_code?: string | null;
  opd_name?: string | null;
  schedule?: string | null;
};
type BookingPreview = {
  date: string;
  weekday: number;
  opds: Array<{
    opd: { id: number; name: string; display_code: string };
    clinics: Array<{ clinic_id: number; clinic_name: string | null; ticket_prefix: string; sort_order: number }>;
  }>;
};
type LabOrder = {
  id: number;
  test_code?: string | null;
  notes?: string | null;
  status?: string | null;
  follow_up_advised_date?: string | null;
  follow_up_notes?: string | null;
  return_for_doctor_review?: boolean | null;
  result?: unknown;
};
type RadOrder = {
  id: number;
  study_code?: string | null;
  notes?: string | null;
  status?: string | null;
  follow_up_advised_date?: string | null;
  follow_up_notes?: string | null;
  return_for_doctor_review?: boolean | null;
  result?: unknown;
};
type LabReportResult = { summary?: string | null; details?: string | null; file_path?: string | null };
type ReportModalData = { appointment: Appointment; orders: LabOrder[]; radOrders: RadOrder[] };

@Component({
  selector: 'app-consultation-page',
  imports: [CommonModule, FormsModule, SpeechInput, WorkflowStatusBadgePipe, Pagination],
  templateUrl: './consultation-page.html',
  styleUrl: './consultation-page.scss',
})
export class ConsultationPage implements OnInit {
  centers: Center[] = [];
  opdPickList: OpdPickRow[] = [];
  filterOpdId: number | '' = '';
  centerId: number | '' = '';
  date = todayLocalYmd();
  rows: Appointment[] = [];
  followUpRows: Appointment[] = [];
  page = 1;
  pageSize = 15;
  selected: Appointment | null = null;
  selectedReport: ReportModalData | null = null;
  labOrders: LabOrder[] = [];
  radOrders: RadOrder[] = [];

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
    follow_up_advised_clinic_id: '' as number | '',
  };

  /** Active clinics under the selected visit's center (all OPDs). */
  centerClinics: ClinicRow[] = [];
  /** OPD roster for the consultation list date (patient booking view). */
  bookingPreview: BookingPreview | null = null;

  labForm = {
    test_code: '',
    notes: '',
    follow_up_advised_date: '',
    follow_up_advised_clinic_id: '' as number | '',
    follow_up_notes: '',
    return_for_doctor_review: false,
  };

  radiologyForm = {
    study_code: '',
    notes: '',
    follow_up_advised_date: '',
    follow_up_advised_clinic_id: '' as number | '',
    follow_up_notes: '',
    return_for_doctor_review: false,
  };

  creatingLabOrder = false;
  creatingRadiologyOrder = false;
  followUpSearch = '';

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly slipPrint: SlipPrintService,
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
    if (this.isAdmin()) {
      try {
        this.opdPickList = await this.api.get<OpdPickRow[]>('/public/opds', ms);
      } catch (e) {
        this.opdPickList = [];
        this.error = e instanceof Error ? e.message : 'Failed to load OPDs';
      }
      if (this.filterOpdId === '' && this.opdPickList[0]) this.filterOpdId = this.opdPickList[0].id;
      this.centerId = centerIdFromOpd(this.opdPickList, this.filterOpdId);
      this.cdr.detectChanges();
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
    this.cdr.detectChanges();
  }

  async onAdminOpdChanged(): Promise<void> {
    this.centerId = centerIdFromOpd(this.opdPickList, this.filterOpdId);
    this.page = 1;
    await this.refreshAll();
  }

  async refreshAll(): Promise<void> {
    await this.load();
    void this.loadFollowUpRows();
  }

  get pagedRows(): Appointment[] {
    const start = (this.page - 1) * this.pageSize;
    return this.rows.slice(start, start + this.pageSize);
  }

  setPageConsultation(p: number): void {
    this.page = p;
  }

  setPageSizeConsultation(n: number): void {
    this.pageSize = n;
    this.page = 1;
  }

  async onFiltersChanged(): Promise<void> {
    if (!this.bootstrapped) return;
    this.page = 1;
    await this.load(false);
    void this.loadFollowUpRows();
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
    try {
      const q = new URLSearchParams({ date: this.date, status: 'dispatched' });
      if (this.isAdmin() && this.filterOpdId !== '') q.set('opd_id', String(this.filterOpdId));
      else if (this.centerId !== '') q.set('center_id', String(this.centerId));
      this.rows = await this.withTimeout(this.api.get<Appointment[]>(`/appointments?${q.toString()}`, 20000), 21000);
      const maxPage = Math.max(1, Math.ceil(this.rows.length / this.pageSize));
      if (this.page > maxPage) this.page = maxPage;
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
      if (this.isAdmin() && this.filterOpdId !== '') q.set('opd_id', String(this.filterOpdId));
      else if (this.centerId !== '') q.set('center_id', String(this.centerId));
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
            const [orders, rads] = await Promise.all([
              this.withTimeout(this.api.get<LabOrder[]>(`/appointments/${row.id}/lab`, 12000), 13000),
              this.withTimeout(this.api.get<RadOrder[]>(`/appointments/${row.id}/radiology`, 12000), 13000),
            ]);
            const hasLabReport =
              orders.length > 0 &&
              orders.some(
                (o) =>
                  String(o.status || '').toLowerCase() === 'completed' ||
                  !!this.parseResult(o.result).summary ||
                  !!this.parseResult(o.result).details ||
                  !!this.parseResult(o.result).file_path,
              );
            const hasRadReport =
              rads.length > 0 &&
              rads.some(
                (o) =>
                  String(o.status || '').toLowerCase() === 'completed' ||
                  !!this.parseResult(o.result).summary ||
                  !!this.parseResult(o.result).details ||
                  !!this.parseResult(o.result).file_path,
              );
            const reviewFlagged =
              [...orders, ...rads].some(
                (o) =>
                  !!o.return_for_doctor_review &&
                  (String(o.status || '').toLowerCase() === 'completed' ||
                    !!this.parseResult(o.result).summary ||
                    !!this.parseResult(o.result).file_path),
              );
            return hasLabReport || hasRadReport || reviewFlagged ? row : null;
          } catch {
            return null;
          }
        }),
      ).then((reportRows) => {
        const seen = new Set(this.followUpRows.map((r) => r.id));
        const merged = [...this.followUpRows];
        for (const row of reportRows) {
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
    this.creatingLabOrder = false;
    this.creatingRadiologyOrder = false;
    this.selected = row;
    const adv = row.follow_up_advised_date ? String(row.follow_up_advised_date).slice(0, 10) : '';
    this.consultForm = {
      consultation_outcome: (row.consultation_outcome || 'medication_only') as string,
      doctor_notes: '',
      follow_up_advised_date: adv,
      follow_up_advised_clinic_id: row.follow_up_advised_clinic_id ?? '',
    };
    this.centerClinics = [];
    this.bookingPreview = null;
    this.cdr.detectChanges();
    await Promise.all([this.loadCenterClinics(row.center_id), this.loadBookingPreview(row.center_id)]);
    await this.loadLabOrders();
    await this.loadRadiologyOrders();
  }

  clinicOptionLabel(c: ClinicRow): string {
    const code = (c.opd_display_code ?? '').trim();
    const op = (c.opd_name ?? '').trim();
    const prefix = code ? `${code}` : op ? op : '';
    return prefix ? `${prefix} · ${c.name}` : c.name;
  }

  private async loadCenterClinics(centerId: number): Promise<void> {
    try {
      const q = new URLSearchParams({ center_id: String(centerId), active_only: 'true' });
      this.centerClinics = await this.withTimeout(
        this.api.get<ClinicRow[]>(`/clinics/by-center?${q.toString()}`, 15000),
        16000,
      );
    } catch {
      this.centerClinics = [];
    }
    this.cdr.detectChanges();
  }

  private async loadBookingPreview(centerId: number): Promise<void> {
    try {
      const d = encodeURIComponent(this.date);
      this.bookingPreview = await this.withTimeout(
        this.api.get<BookingPreview>(`/centers/${centerId}/opd-booking-options?date=${d}`, 15000),
        16000,
      );
    } catch {
      this.bookingPreview = null;
    }
    this.cdr.detectChanges();
  }

  async loadLabOrders(): Promise<void> {
    if (!this.selected) return;
    try {
      this.labOrders = await this.withTimeout(this.api.get<LabOrder[]>(`/appointments/${this.selected.id}/lab`, 15000), 16000);
    } catch {
      this.labOrders = [];
    }
    this.cdr.detectChanges();
  }

  async loadRadiologyOrders(): Promise<void> {
    if (!this.selected) return;
    try {
      this.radOrders = await this.withTimeout(this.api.get<RadOrder[]>(`/appointments/${this.selected.id}/radiology`, 15000), 16000);
    } catch {
      this.radOrders = [];
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
        follow_up_advised_department_id: null,
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
    if (this.consultForm.consultation_outcome === 'radiology_required') {
      this.toast.error('Radiology-required visits must be completed from Radiology after report upload.');
      return;
    }
    this.saving = true;
    this.error = '';
    try {
      await this.api.post(`/appointments/${this.selected.id}/complete`, {});
      this.toast.success(`Patient journey completed for token #${this.selected.token_number}.`);
      this.closeConsultationModal();
      await this.refreshAll();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not complete patient journey';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  openLabOrderModal(): void {
    this.creatingRadiologyOrder = false;
    this.creatingLabOrder = true;
    this.cdr.detectChanges();
  }

  closeLabOrderModal(): void {
    this.creatingLabOrder = false;
    this.cdr.detectChanges();
  }

  openRadiologyOrderModal(): void {
    this.creatingLabOrder = false;
    this.creatingRadiologyOrder = true;
    this.cdr.detectChanges();
  }

  closeRadiologyOrderModal(): void {
    this.creatingRadiologyOrder = false;
    this.cdr.detectChanges();
  }

  closeConsultationModal(): void {
    this.selected = null;
    this.creatingLabOrder = false;
    this.creatingRadiologyOrder = false;
    this.cdr.detectChanges();
  }

  async createLabOrder(): Promise<void> {
    if (!this.selected) return;
    const appt = this.selected;
    this.saving = true;
    this.error = '';
    try {
      const order = await this.api.post<LabOrder>(`/appointments/${appt.id}/lab-orders`, {
        test_code: this.labForm.test_code || null,
        notes: this.labForm.notes || null,
        follow_up_advised_date: this.labForm.follow_up_advised_date || null,
        follow_up_notes: this.labForm.follow_up_notes.trim() || null,
        return_for_doctor_review: this.labForm.return_for_doctor_review,
        follow_up_advised_department_id: null,
        follow_up_advised_clinic_id:
          this.labForm.follow_up_advised_clinic_id !== '' ? Number(this.labForm.follow_up_advised_clinic_id) : null,
      });
      this.labForm = {
        test_code: '',
        notes: '',
        follow_up_advised_date: '',
        follow_up_advised_clinic_id: '',
        follow_up_notes: '',
        return_for_doctor_review: false,
      };
      this.closeLabOrderModal();
      await this.loadLabOrders();
      await this.printInvestigationSlip('lab', order, appt);
      this.toast.success('Lab order created.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not create lab order';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async createRadiologyOrder(): Promise<void> {
    if (!this.selected) return;
    const appt = this.selected;
    this.saving = true;
    this.error = '';
    try {
      const order = await this.api.post<RadOrder>(`/appointments/${appt.id}/radiology-orders`, {
        study_code: this.radiologyForm.study_code || null,
        notes: this.radiologyForm.notes || null,
        follow_up_advised_date: this.radiologyForm.follow_up_advised_date || null,
        follow_up_notes: this.radiologyForm.follow_up_notes.trim() || null,
        return_for_doctor_review: this.radiologyForm.return_for_doctor_review,
        follow_up_advised_department_id: null,
        follow_up_advised_clinic_id:
          this.radiologyForm.follow_up_advised_clinic_id !== '' ? Number(this.radiologyForm.follow_up_advised_clinic_id) : null,
      });
      this.radiologyForm = {
        study_code: '',
        notes: '',
        follow_up_advised_date: '',
        follow_up_advised_clinic_id: '',
        follow_up_notes: '',
        return_for_doctor_review: false,
      };
      this.closeRadiologyOrderModal();
      await this.loadRadiologyOrders();
      await this.printInvestigationSlip('rad', order, appt);
      this.toast.success('Radiology order created.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not create radiology order';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  /** Printable slip with QR encoding the same payload for lab/radiology verification. */
  private async printInvestigationSlip(kind: 'lab' | 'rad', order: LabOrder | RadOrder, appt: Appointment): Promise<void> {
    try {
      const QRCode = (await import('qrcode')).default;
      const code =
        kind === 'lab'
          ? String((order as LabOrder).test_code ?? '').trim() || '—'
          : String((order as RadOrder).study_code ?? '').trim() || '—';
      const notes =
        kind === 'lab' ? String((order as LabOrder).notes ?? '').trim() : String((order as RadOrder).notes ?? '').trim();
      const payload = {
        v: 1 as const,
        kind,
        orderId: order.id,
        appointmentId: appt.id,
        token: appt.token_number,
        code,
        patient: appt.patient_name,
        cnic: appt.patient_cnic ?? null,
      };
      const qrDataUrl = await QRCode.toDataURL(JSON.stringify(payload), {
        width: 200,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
      const opdLine = [appt.opd_display_code, appt.opd_name].filter(Boolean).join(' · ') || '—';
      const fields: SlipField[] = [
        { label: 'Ticket', value: appt.ticket_display?.trim() || String(appt.token_number) },
        { label: 'Patient', value: appt.patient_name || '—' },
        { label: 'CNIC', value: appt.patient_cnic || '—' },
        { label: 'OPD', value: opdLine },
        { label: 'Clinic', value: appt.clinic_name || '—' },
        { label: 'Campus / center', value: appt.center_name || '—' },
        { label: kind === 'lab' ? 'Test code' : 'Study code', value: code },
        { label: 'Notes', value: notes || '—' },
        { label: 'Order ID', value: String(order.id) },
      ];
      const title = kind === 'lab' ? 'Laboratory slip' : 'Radiology slip';
      this.slipPrint.print(title, `Verification · OPD visit`, fields, {
        qrDataUrl,
        qrCaption: 'Scan to verify — do not alter items on this slip',
      });
    } catch {
      this.toast.error('Order saved but slip/QR print failed. You can re-print from the order list if needed.');
    }
  }

  private printConsultationSlip(row: Appointment): void {
    const clinicName =
      this.consultForm.follow_up_advised_clinic_id !== ''
        ? this.centerClinics.find((c) => c.id === Number(this.consultForm.follow_up_advised_clinic_id))?.name
        : undefined;
    const pendingLab = this.labOrders.filter((o) => String(o.status || '').toLowerCase() !== 'completed').length;
    const pendingRad = this.radOrders.filter((o) => String(o.status || '').toLowerCase() !== 'completed').length;
    const opdLine = [row.opd_display_code, row.opd_name].filter(Boolean).join(' · ') || '—';
    this.slipPrint.print('Consultation Slip', 'Doctor consultation — OPD visit', [
      { label: 'Ticket', value: row.ticket_display?.trim() || String(row.token_number) },
      { label: 'Patient', value: row.patient_name || '-' },
      { label: 'CNIC', value: row.patient_cnic || '-' },
      { label: 'OPD', value: opdLine },
      { label: 'Clinic', value: row.clinic_name || '—' },
      { label: 'Campus / center', value: row.center_name || '-' },
      { label: 'Visit date', value: this.date },
      { label: 'Outcome', value: this.consultForm.consultation_outcome || '-' },
      { label: 'Pending lab orders', value: pendingLab ? String(pendingLab) : '—' },
      { label: 'Pending radiology orders', value: pendingRad ? String(pendingRad) : '—' },
      { label: 'Doctor notes', value: this.consultForm.doctor_notes.trim() || '-' },
      {
        label: 'Follow-up date',
        value:
          this.consultForm.consultation_outcome === 'follow_up'
            ? this.consultForm.follow_up_advised_date || '-'
            : '-',
      },
      {
        label: 'Follow-up clinic',
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
      const [orders, radOrders] = await Promise.all([
        this.withTimeout(this.api.get<LabOrder[]>(`/appointments/${row.id}/lab`, 15000), 16000),
        this.withTimeout(this.api.get<RadOrder[]>(`/appointments/${row.id}/radiology`, 15000), 16000),
      ]);
      this.selectedReport = { appointment: row, orders, radOrders };
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
