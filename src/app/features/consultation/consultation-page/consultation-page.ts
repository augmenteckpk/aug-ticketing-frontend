import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QuillModule } from 'ngx-quill';
import { ApiService } from '../../../core/services/api';
import { AuthService } from '../../../core/services/auth';
import { LAB_REQUEST_FORM, RADIOLOGY_REQUEST_FORM } from '../../../core/constants/registration-slip-brand';
import { SlipPrintService } from '../../../core/services/slip-print.service';
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
  patient_gender?: string | null;
  patient_father_name?: string | null;
  patient_date_of_birth?: string | null;
  visit_barcode?: string | null;
  w_number?: string | null;
  registered_at?: string | null;
  checked_in_at?: string | null;
  appointment_date?: string | null;
  height_cm?: number | string | null;
  weight_kg?: number | string | null;
  doctor_notes?: string | null;
  center_id: number;
  center_name?: string | null;
  hospital_name?: string | null;
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

type ConsultationOutcomeSaved =
  | 'medication_only'
  | 'lab_required'
  | 'radiology_required'
  | 'follow_up'
  | 'admission'
  | 'mixed';

@Component({
  selector: 'app-consultation-page',
  imports: [CommonModule, FormsModule, QuillModule, SpeechInput, WorkflowStatusBadgePipe, Pagination],
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
  reportLoading = false;
  labOrders: LabOrder[] = [];
  radOrders: RadOrder[] = [];

  loading = false;
  bootstrapped = false;
  hasLoadedOnce = false;
  saving = false;
  error = '';
  private loadRunId = 0;

  consultForm = {
    doctor_notes: '',
    follow_up_advised_date: '',
    follow_up_advised_clinic_id: '' as number | '',
  };

  /** Multiple clinical paths can apply; saved as one `consultation_outcome` (including `mixed`). */
  consultPaths = {
    medication: true,
    admission: false,
    followUp: false,
    lab: false,
    radiology: false,
  };

  /** Booking preview for the chosen follow-up date (roster that day). */
  followUpBooking: BookingPreview | null = null;
  followUpOpdId: number | '' = '';
  followUpBookingLoading = false;
  /** Seven-day OPD/clinic roster from the list date (for follow-up planning). */
  centerWeekRoster: Array<{
    ymd: string;
    headline: string;
    lines: Array<{ trackId: string; opdCode: string; opdName: string; clinicChips: string[] }>;
  }> = [];

  labForm = {
    test_code: '',
    notes: '',
    return_for_doctor_review: false,
  };

  radiologyForm = {
    study_code: '',
    notes: '',
    return_for_doctor_review: false,
  };

  creatingLabOrder = false;
  creatingRadiologyOrder = false;
  followUpSearch = '';

  /** Shown above the lab order fields — matches printed SIUT lab request header. */
  readonly labRequestFormBrand = LAB_REQUEST_FORM;
  /** Shown above the radiology order fields — matches printed SIUT radiology request header. */
  readonly radRequestFormBrand = RADIOLOGY_REQUEST_FORM;

  /** Plain preview of rich-text notes (lab tests / radiology exams) in order tables. */
  richNotesPreview(raw: string | null | undefined): string {
    const t = this.slipPrint.htmlToPlainText(raw);
    if (!t) return '—';
    return t.length > 100 ? `${t.slice(0, 100)}…` : t;
  }

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
      const followUpByOutcome = completed.filter((row) => {
        const o = String(row.consultation_outcome || '');
        return o === 'follow_up' || o === 'mixed';
      });
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
    this.hydrateConsultPathsFromRow(row);
    this.consultForm = {
      doctor_notes: row.doctor_notes ?? '',
      follow_up_advised_date: adv,
      follow_up_advised_clinic_id: row.follow_up_advised_clinic_id ?? '',
    };
    this.followUpBooking = null;
    this.followUpOpdId = '';
    this.centerWeekRoster = [];
    this.cdr.detectChanges();
    await this.loadCenterWeekRoster(row.center_id, this.date);
    if (adv && /^\d{4}-\d{2}-\d{2}$/.test(adv)) {
      await this.loadFollowUpDateBooking(row.center_id, adv);
      this.hydrateFollowUpOpdFromSavedClinic(row.follow_up_advised_clinic_id);
    }
    await this.loadLabOrders();
    await this.loadRadiologyOrders();
  }

  /** Clinics on roster for the selected follow-up OPD and date. */
  get followUpClinicsForSelectedOpd(): Array<{
    clinic_id: number;
    clinic_name: string | null;
    ticket_prefix: string;
    sort_order: number;
  }> {
    const oid = this.followUpOpdId;
    if (oid === '' || !this.followUpBooking?.opds?.length) return [];
    const block = this.followUpBooking.opds.find((x) => x.opd.id === oid);
    return block?.clinics ?? [];
  }

  followUpClinicOptionLabel(cl: {
    clinic_id: number;
    clinic_name: string | null;
    ticket_prefix: string;
  }): string {
    const nm = cl.clinic_name?.trim() || `Clinic #${cl.clinic_id}`;
    return `${cl.ticket_prefix} · ${nm}`;
  }

  async onFollowUpDateChanged(): Promise<void> {
    if (!this.selected) return;
    this.followUpOpdId = '';
    this.consultForm.follow_up_advised_clinic_id = '';
    const d = String(this.consultForm.follow_up_advised_date ?? '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      this.followUpBooking = null;
      this.cdr.detectChanges();
      return;
    }
    await this.loadFollowUpDateBooking(this.selected.center_id, d);
  }

  onFollowUpOpdChanged(): void {
    const clinics = this.followUpClinicsForSelectedOpd;
    const cid = this.consultForm.follow_up_advised_clinic_id;
    if (cid !== '' && !clinics.some((c) => c.clinic_id === cid)) {
      this.consultForm.follow_up_advised_clinic_id = '';
    }
    this.cdr.detectChanges();
  }

  onFollowUpPathChanged(checked: boolean): void {
    if (checked) return;
    this.followUpBooking = null;
    this.followUpOpdId = '';
    this.consultForm.follow_up_advised_date = '';
    this.consultForm.follow_up_advised_clinic_id = '';
    this.cdr.detectChanges();
  }

  private async loadFollowUpDateBooking(centerId: number, ymd: string): Promise<void> {
    this.followUpBookingLoading = true;
    this.cdr.detectChanges();
    try {
      this.followUpBooking = await this.withTimeout(
        this.api.get<BookingPreview>(
          `/centers/${centerId}/opd-booking-options?date=${encodeURIComponent(ymd)}`,
          12000,
        ),
        13000,
      );
    } catch {
      this.followUpBooking = null;
    } finally {
      this.followUpBookingLoading = false;
      this.cdr.detectChanges();
    }
  }

  private hydrateFollowUpOpdFromSavedClinic(clinicId: number | null | undefined): void {
    const cid = clinicId ?? null;
    if (cid == null || !this.followUpBooking?.opds?.length) return;
    const block = this.followUpBooking.opds.find((b) => b.clinics.some((c) => c.clinic_id === cid));
    if (block) {
      this.followUpOpdId = block.opd.id;
    } else {
      this.consultForm.follow_up_advised_clinic_id = '';
    }
    this.cdr.detectChanges();
  }

  private addDaysYmd(ymd: string, days: number): string {
    const [y, m, d] = ymd.split('-').map((x) => Number(x));
    const dt = new Date(y, m - 1, d + days);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  private async loadCenterWeekRoster(centerId: number, startYmd: string): Promise<void> {
    const out: Array<{
      ymd: string;
      headline: string;
      lines: Array<{ trackId: string; opdCode: string; opdName: string; clinicChips: string[] }>;
    }> = [];
    try {
      for (let i = 0; i < 7; i++) {
        const ymd = this.addDaysYmd(startYmd, i);
        const [yy, mm, dd] = ymd.split('-').map(Number);
        const headline = new Date(yy, mm - 1, dd).toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        out.push({ ymd, headline, lines: [] });
      }
      const previews = await Promise.all(
        out.map((slot) =>
          this.withTimeout(
            this.api.get<BookingPreview>(
              `/centers/${centerId}/opd-booking-options?date=${encodeURIComponent(slot.ymd)}`,
              12000,
            ),
            13000,
          ).catch(() => null),
        ),
      );
      previews.forEach((p, i) => {
        const ymd = out[i].ymd;
        const opds = p?.opds ?? [];
        for (const b of opds) {
          const clinicChips = (b.clinics ?? []).map((cl) => {
            const nm = cl.clinic_name?.trim() || `#${cl.clinic_id}`;
            return `${cl.ticket_prefix} · ${nm}`;
          });
          out[i].lines.push({
            trackId: `${ymd}-opd-${b.opd.id}`,
            opdCode: b.opd.display_code,
            opdName: b.opd.name,
            clinicChips,
          });
        }
      });
      this.centerWeekRoster = out;
    } catch {
      this.centerWeekRoster = [];
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

  private hydrateConsultPathsFromRow(row: Appointment): void {
    const o = String(row.consultation_outcome || 'medication_only');
    this.consultPaths = {
      medication: o !== 'admission',
      admission: o === 'admission',
      followUp: o === 'follow_up' || o === 'mixed',
      lab: o === 'lab_required' || o === 'mixed',
      radiology: o === 'radiology_required' || o === 'mixed',
    };
  }

  private deriveConsultationOutcome(): ConsultationOutcomeSaved {
    const p = this.consultPaths;
    if (p.admission) return 'admission';
    const n = (p.followUp ? 1 : 0) + (p.lab ? 1 : 0) + (p.radiology ? 1 : 0);
    if (n >= 2) return 'mixed';
    if (p.followUp) return 'follow_up';
    if (p.lab) return 'lab_required';
    if (p.radiology) return 'radiology_required';
    return 'medication_only';
  }

  onConsultAdmissionChanged(checked: boolean): void {
    if (checked) {
      this.consultPaths.followUp = false;
      this.consultPaths.lab = false;
      this.consultPaths.radiology = false;
      this.consultPaths.medication = false;
      this.followUpBooking = null;
      this.followUpOpdId = '';
      this.consultForm.follow_up_advised_date = '';
      this.consultForm.follow_up_advised_clinic_id = '';
    } else {
      this.consultPaths.medication = true;
    }
  }

  consultCompleteAllowed(): boolean {
    const o = this.deriveConsultationOutcome();
    return o !== 'lab_required' && o !== 'radiology_required';
  }

  async saveConsultation(): Promise<void> {
    if (!this.selected) return;
    const outcome = this.deriveConsultationOutcome();
    if (this.consultPaths.followUp && !String(this.consultForm.follow_up_advised_date ?? '').trim()) {
      this.toast.error('Follow-up is selected: enter the advised return date.');
      return;
    }
    this.saving = true;
    this.error = '';
    try {
      await this.api.patch(`/appointments/${this.selected.id}/consultation`, {
        consultation_outcome: outcome,
        doctor_notes: this.consultForm.doctor_notes || null,
        follow_up_advised_date:
          (outcome === 'follow_up' || outcome === 'mixed') && this.consultPaths.followUp
            ? this.consultForm.follow_up_advised_date || null
            : null,
        follow_up_advised_department_id: null,
        follow_up_advised_clinic_id:
          (outcome === 'follow_up' || outcome === 'mixed') &&
          this.consultPaths.followUp &&
          this.consultForm.follow_up_advised_clinic_id !== ''
            ? Number(this.consultForm.follow_up_advised_clinic_id)
            : null,
      });
      try {
        await this.slipPrint.printPatientRegistrationSlip({
          opdClinicLine: this.formatOpdClinicLineForSlip(this.selected),
          tokenDisplay: (this.selected.ticket_display ?? '').trim() || String(this.selected.token_number),
          wNumber: this.selected.w_number ?? null,
          visitDateTimeLabel: this.visitDateTimeForSlip(this.selected),
          patientName: this.selected.patient_name || '',
          fatherName: this.selected.patient_father_name,
          gender: this.selected.patient_gender,
          cnic: this.selected.patient_cnic,
          heightCm: this.selected.height_cm,
          weightKg: this.selected.weight_kg,
          ageLabel: this.ageLabelFromDob(this.selected.patient_date_of_birth),
          visitBarcodeHex: this.selected.visit_barcode ?? null,
          notesHtml: this.consultForm.doctor_notes || '',
        });
      } catch {
        this.toast.error('Consultation saved but registration slip print failed.');
      }
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
    const outcome = this.deriveConsultationOutcome();
    if (outcome === 'lab_required') {
      this.toast.error('Lab-required visits must be completed from Laboratory after result entry.');
      return;
    }
    if (outcome === 'radiology_required') {
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
    this.centerWeekRoster = [];
    this.followUpBooking = null;
    this.followUpOpdId = '';
    this.followUpBookingLoading = false;
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
      const testsHtml = this.labForm.notes;
      const testsPlainForApi = this.slipPrint.htmlToPlainText(testsHtml);
      const order = await this.api.post<LabOrder>(`/appointments/${appt.id}/lab-orders`, {
        test_code: this.labForm.test_code || null,
        notes: testsPlainForApi.length > 0 ? testsHtml : null,
        follow_up_advised_date: null,
        follow_up_notes: null,
        return_for_doctor_review: this.labForm.return_for_doctor_review,
        follow_up_advised_department_id: null,
        follow_up_advised_clinic_id: null,
      });
      this.labForm = {
        test_code: '',
        notes: '',
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
      const examsHtml = this.radiologyForm.notes;
      const examsPlainForApi = this.slipPrint.htmlToPlainText(examsHtml);
      const order = await this.api.post<RadOrder>(`/appointments/${appt.id}/radiology-orders`, {
        study_code: this.radiologyForm.study_code || null,
        notes: examsPlainForApi.length > 0 ? examsHtml : null,
        follow_up_advised_date: null,
        follow_up_notes: null,
        return_for_doctor_review: this.radiologyForm.return_for_doctor_review,
        follow_up_advised_department_id: null,
        follow_up_advised_clinic_id: null,
      });
      this.radiologyForm = {
        study_code: '',
        notes: '',
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

  /** SIUT-style lab / radiology request forms + QR for verification. */
  private async printInvestigationSlip(kind: 'lab' | 'rad', order: LabOrder | RadOrder, appt: Appointment): Promise<void> {
    try {
      const QRCode = (await import('qrcode')).default;
      const code =
        kind === 'lab'
          ? String((order as LabOrder).test_code ?? '').trim() || '—'
          : String((order as RadOrder).study_code ?? '').trim() || '—';
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
      const dateLine = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const locationLine =
        [appt.center_name, appt.hospital_name].filter((s) => String(s ?? '').trim()).join(' · ') || '—';
      const visitNo = (appt.ticket_display ?? '').trim() || String(appt.token_number);
      const opdClinic = this.formatOpdClinicLineForSlip(appt) || '—';
      const age = this.ageLabelFromDob(appt.patient_date_of_birth);
      const doctor = this.auth.user()?.username?.trim() || '—';

      if (kind === 'lab') {
        const labNotesPlain = this.slipPrint.htmlToPlainText((order as LabOrder).notes);
        const testsPlain = [String((order as LabOrder).test_code ?? '').trim(), labNotesPlain].filter(Boolean).join('\n');
        this.slipPrint.printLabRequestForm({
          formNumber: String(order.id),
          patientName: appt.patient_name || '—',
          ageLabel: age,
          visitNo,
          locationLine,
          dateLine,
          opdClinicLine: opdClinic,
          testsPlain: testsPlain || ' ',
          requestingDoctor: doctor,
          qrDataUrl,
        });
      } else {
        const sex = (appt.patient_gender ?? '').trim() || '—';
        const radNotesPlain = this.slipPrint.htmlToPlainText((order as RadOrder).notes);
        const exams = [String((order as RadOrder).study_code ?? '').trim(), radNotesPlain].filter(Boolean).join('\n');
        this.slipPrint.printRadiologyRequestForm({
          formNumber: String(order.id),
          patientName: appt.patient_name || '—',
          ageLabel: age,
          sexLabel: sex,
          bedNo: 'OPD',
          examinationsPlain: exams || ' ',
          requestingDoctor: doctor,
          dateRequested: dateLine,
          qrDataUrl,
        });
      }
    } catch {
      this.toast.error('Order saved but slip/QR print failed. You can re-print from the order list if needed.');
    }
  }

  private visitDateTimeForSlip(row: Appointment): string {
    const parse = (v: unknown): Date | null => {
      if (v == null || v === '') return null;
      const d = new Date(String(v));
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const day = String(row.appointment_date ?? '').slice(0, 10);
    return (
      parse(row.registered_at)?.toLocaleString() ??
      parse(row.checked_in_at)?.toLocaleString() ??
      (day || '—')
    );
  }

  /**
   * Registration slip header: OPD ticket prefix / clinic name (e.g. `OPD14 / Prostate Clinic`).
   * Uses `opd_display_code` when set, otherwise `opd_name`.
   */
  private formatOpdClinicLineForSlip(row: Appointment): string {
    const code = (row.opd_display_code ?? '').trim() || (row.opd_name ?? '').trim();
    const clinic = (row.clinic_name ?? '').trim();
    if (!code && !clinic) return '';
    if (!clinic) return code;
    if (!code) return clinic;
    return `${code} / ${clinic}`;
  }

  private ageLabelFromDob(dob?: string | null): string {
    const s = dob ? String(dob).slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '—';
    const born = new Date(`${s}T12:00:00`);
    if (Number.isNaN(born.getTime())) return '—';
    const today = new Date();
    let yrs = today.getFullYear() - born.getFullYear();
    const md = today.getMonth() - born.getMonth();
    if (md < 0 || (md === 0 && today.getDate() < born.getDate())) yrs -= 1;
    return yrs >= 0 ? `${yrs} yr` : '—';
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
    this.selectedReport = { appointment: row, orders: [], radOrders: [] };
    this.reportLoading = true;
    this.cdr.detectChanges();
    try {
      const [orders, radOrders] = await Promise.all([
        this.withTimeout(this.api.get<LabOrder[]>(`/appointments/${row.id}/lab`, 15000), 16000),
        this.withTimeout(this.api.get<RadOrder[]>(`/appointments/${row.id}/radiology`, 15000), 16000),
      ]);
      if (!this.selectedReport || this.selectedReport.appointment.id !== row.id) return;
      this.selectedReport = { appointment: row, orders, radOrders };
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not load report details');
      this.selectedReport = null;
    } finally {
      if (this.selectedReport?.appointment.id === row.id) {
        this.reportLoading = false;
      } else {
        this.reportLoading = false;
      }
    }
    this.cdr.detectChanges();
  }

  closeReportModal(): void {
    this.selectedReport = null;
    this.reportLoading = false;
    this.cdr.detectChanges();
  }

  parseResult(result: unknown): LabReportResult {
    if (result && typeof result === 'object') return result as LabReportResult;
    return {};
  }
}
