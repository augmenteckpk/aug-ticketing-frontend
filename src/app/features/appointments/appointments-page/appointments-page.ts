import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { ApiService } from '../../../core/services/api';
import { AuthService } from '../../../core/services/auth';
import { SlipPrintService } from '../../../core/services/slip-print.service';
import { ToastService } from '../../../core/services/toast';
import { centerIdFromOpd, consoleIsAdmin, listCenterIdForRequest, listDateForRequest } from '../../../core/utils/listing-scope';
import { todayLocalYmd } from '../../../core/utils/local-date';
import {
  cnicDigits,
  extractCnicDigitsFromScan,
  isProbableVisitBarcodeScan,
  isValidCnic13,
  normalizeCnicInput,
} from '../../../core/utils/cnic';
import { WorkflowStatusBadgePipe } from '../../../shared/pipes/status-badge.pipe';
import { SpeechInput } from '../../../ui-kit/speech-input/speech-input';
import { Pagination } from '../../../ui-kit/pagination/pagination';

const WALKIN_CNIC_SCAN_HINTS = new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true]]);

type Center = { id: number; name: string; city: string; hospital_name?: string };
type OpdPickRow = { id: number; name: string; display_code: string; center_id: number; center_label: string; sort_order: number };
type PatientIdentifierKind = 'own' | 'minor_father_cnic' | 'minor_mother_cnic' | 'relative_escort';

type WalkInPreviewPatient = {
  first_name: string;
  last_name?: string | null;
  phone?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  address?: string | null;
  identifier_kind?: string | null;
  escort_relationship?: string | null;
};

type Appointment = {
  id: number;
  appointment_date: string;
  token_number: number;
  ticket_display?: string | null;
  status: string;
  patient_name?: string | null;
  patient_cnic?: string | null;
  visit_barcode?: string | null;
  w_number?: string | null;
  clinic_name?: string | null;
  walk_in_notices?: string[];
  /** When not `own`, the CNIC on file is a parent’s or escort’s number; demographics are still the patient’s. */
  patient_identifier_kind?: PatientIdentifierKind | string | null;
  patient_escort_relationship?: string | null;
  center_name?: string | null;
  opd_name?: string | null;
  opd_display_code?: string | null;
};

type OpdBookingBlock = {
  opd: { id: number; name: string; display_code: string };
  clinics: { clinic_id: number; clinic_name: string | null; ticket_prefix: string; sort_order: number }[];
};

type OpdBookingOptionsResponse = { date: string; weekday: number; opds: OpdBookingBlock[] };

@Component({
  selector: 'app-appointments-page',
  imports: [CommonModule, FormsModule, SpeechInput, WorkflowStatusBadgePipe, Pagination],
  templateUrl: './appointments-page.html',
  styleUrl: './appointments-page.scss',
})
export class AppointmentsPage implements OnInit, OnDestroy {
  @ViewChild('walkInScannerVideo') walkInScannerVideoRef?: ElementRef<HTMLVideoElement>;

  centers: Center[] = [];
  /** Admin: OPD filter replaces center picker on the list. */
  opdPickList: OpdPickRow[] = [];
  filterOpdId: number | '' = '';
  rows: Appointment[] = [];
  page = 1;
  pageSize = 15;

  centerId: number | '' = '';
  date = todayLocalYmd();
  status = '';

  creatingWalkIn = false;
  busy = false;
  /** Saving walk-in token — separate so the table does not flash “Loading…”. */
  walkInSaving = false;
  error = '';

  walkIn = {
    center_id: '' as number | '',
    appointment_date: todayLocalYmd(),
    opd_id: '' as number | '',
    clinic_id: '' as number | '',
    cnic: '',
    identifier_kind: 'own' as PatientIdentifierKind,
    escort_relationship: '',
    date_of_birth: '',
    first_name: '',
    last_name: '',
    phone: '',
    gender: '',
    address: '',
  };

  walkInCnicScannerOpen = false;
  private walkInScanUserCancelled = false;
  private walkInScannerControls: IScannerControls | null = null;

  /** Roster for selected center + walk-in date (weekday-filtered clinics). */
  walkInBooking: OpdBookingOptionsResponse | null = null;
  walkInBookingLoading = false;

  /** After POST /walk-in: show token, print, and Done (desk / WebView). */
  walkInSuccess: Appointment | null = null;

  private loadRunId = 0;
  private readonly walkInPrefill$ = new Subject<void>();
  private walkInPrefillSub?: Subscription;

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly slipPrint: SlipPrintService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
    private readonly ngZone: NgZone,
  ) {}

  /** Short label for staff when CNIC on chart is not the patient’s own NIC. */
  patientIdentifierBadge(kind: string | null | undefined): string | null {
    switch (kind) {
      case 'minor_father_cnic':
        return 'Minor · father’s CNIC';
      case 'minor_mother_cnic':
        return 'Minor · mother’s CNIC';
      case 'relative_escort':
        return 'Relative / escort CNIC';
      default:
        return null;
    }
  }

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

  get pagedRows(): Appointment[] {
    const start = (this.page - 1) * this.pageSize;
    return this.rows.slice(start, start + this.pageSize);
  }

  onFilterChange(): void {
    this.page = 1;
    void this.loadAppointments();
  }

  setPage(p: number): void {
    this.page = p;
  }

  setPageSize(n: number): void {
    this.pageSize = n;
    this.page = 1;
  }

  async ngOnInit(): Promise<void> {
    this.walkInPrefillSub = this.walkInPrefill$.pipe(debounceTime(450)).subscribe(() => {
      void this.prefillWalkInFromServer();
    });
    await Promise.allSettled([this.loadCenters(), this.loadAppointments()]);
  }

  ngOnDestroy(): void {
    this.walkInPrefillSub?.unsubscribe();
    this.stopWalkInCnicScanner();
  }

  openWalkInCnicScanner(): void {
    if (this.walkInSaving || this.walkInCnicScannerOpen) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.toast.error('Camera access is not available in this browser. Use HTTPS or type the CNIC.');
      return;
    }
    this.walkInScanUserCancelled = false;
    this.walkInCnicScannerOpen = true;
    this.cdr.detectChanges();
    setTimeout(() => void this.runWalkInCnicScan(), 0);
  }

  cancelWalkInCnicScanner(): void {
    this.walkInScanUserCancelled = true;
    this.stopWalkInCnicScanner();
    this.walkInCnicScannerOpen = false;
    this.cdr.detectChanges();
  }

  private stopWalkInCnicScanner(): void {
    try {
      this.walkInScannerControls?.stop();
    } catch {
      /* ignore */
    }
    this.walkInScannerControls = null;
    const el = this.walkInScannerVideoRef?.nativeElement;
    if (el?.srcObject) {
      const stream = el.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      el.srcObject = null;
    }
  }

  private async runWalkInCnicScan(): Promise<void> {
    const video = this.walkInScannerVideoRef?.nativeElement;
    if (!video) {
      this.toast.error('Scanner could not start.');
      this.walkInCnicScannerOpen = false;
      this.cdr.detectChanges();
      return;
    }
    const reader = new BrowserMultiFormatReader(WALKIN_CNIC_SCAN_HINTS);
    try {
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      if (this.walkInScanUserCancelled) {
        this.walkInCnicScannerOpen = false;
        this.cdr.detectChanges();
        return;
      }
      const back = devices.find((d) => /back|rear|environment/i.test(d.label));
      const deviceId = back?.deviceId;
      const videoConstraints: MediaTrackConstraints = deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } };

      const controls = await reader.decodeFromConstraints({ video: videoConstraints }, video, (result, _err, ctrl) => {
        if (this.walkInScanUserCancelled) {
          ctrl.stop();
          return;
        }
        this.ngZone.run(() => {
          if (!result) return;
          const raw = result.getText();
          if (isProbableVisitBarcodeScan(raw)) {
            ctrl.stop();
            this.walkInScannerControls = null;
            this.walkInCnicScannerOpen = false;
            this.cdr.detectChanges();
            this.toast.error('That looks like a visit barcode. Use Registration desk “Scan visit barcode” for booked visits.');
            return;
          }
          const digits = extractCnicDigitsFromScan(raw);
          if (!digits) return;
          ctrl.stop();
          this.walkInScannerControls = null;
          this.walkInCnicScannerOpen = false;
          this.walkIn.cnic = normalizeCnicInput(digits);
          this.onWalkInCnicChanged(this.walkIn.cnic);
          this.cdr.detectChanges();
          this.toast.success('CNIC captured from scan.');
        });
      });
      this.walkInScannerControls = controls;
      this.cdr.detectChanges();
    } catch (e) {
      if (this.walkInScanUserCancelled) return;
      this.stopWalkInCnicScanner();
      this.walkInCnicScannerOpen = false;
      this.cdr.detectChanges();
      const name = e instanceof Error ? e.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        this.toast.error('Camera permission was denied.');
        return;
      }
      if (name === 'NotFoundError') {
        this.toast.error('No camera found on this device.');
        return;
      }
      this.toast.error(e instanceof Error ? e.message : 'Could not read barcode.');
    }
  }

  /** Debounced: when CNIC (+ kind / DOB rules) match an existing chart, fill name and DOB automatically. */
  scheduleWalkInPatientPrefill(): void {
    this.walkInPrefill$.next();
  }

  onWalkInCnicChanged(raw: string): void {
    this.walkIn.cnic = normalizeCnicInput(raw);
    this.scheduleWalkInPatientPrefill();
    this.cdr.detectChanges();
  }

  onWalkInIdentifierKindChanged(): void {
    if (this.walkIn.identifier_kind !== 'own') {
      this.walkIn.first_name = '';
      this.walkIn.last_name = '';
      this.walkIn.date_of_birth = '';
      this.walkIn.phone = '';
      this.walkIn.gender = '';
      this.walkIn.address = '';
    }
    this.scheduleWalkInPatientPrefill();
  }

  async openWalkInModal(): Promise<void> {
    this.stopWalkInCnicScanner();
    this.walkInScanUserCancelled = false;
    this.walkInCnicScannerOpen = false;
    this.walkInSuccess = null;
    this.walkIn.identifier_kind = 'own';
    this.walkIn.escort_relationship = '';
    this.walkIn.date_of_birth = '';
    this.walkIn.phone = '';
    this.walkIn.gender = '';
    this.walkIn.address = '';
    this.walkIn.opd_id = '';
    this.walkIn.clinic_id = '';
    this.walkInBooking = null;
    this.walkIn.appointment_date = listDateForRequest(this.auth.user(), this.walkIn.appointment_date);
    const wc = listCenterIdForRequest(this.auth.user(), this.walkIn.center_id);
    if (wc !== '') this.walkIn.center_id = wc;
    this.creatingWalkIn = true;
    this.cdr.detectChanges();
    await this.loadWalkInBookingOptions();
    this.scheduleWalkInPatientPrefill();
    this.cdr.detectChanges();
  }

  walkInClinicsForSelectedOpd(): OpdBookingBlock["clinics"] {
    const oid = this.walkIn.opd_id;
    if (oid === '' || !this.walkInBooking?.opds?.length) return [];
    const block = this.walkInBooking.opds.find((x) => x.opd.id === oid);
    return block?.clinics ?? [];
  }

  async loadWalkInBookingOptions(): Promise<void> {
    if (this.walkIn.center_id === '' || !this.walkIn.appointment_date) {
      this.walkInBooking = null;
      return;
    }
    this.walkInBookingLoading = true;
    try {
      const q = new URLSearchParams({ date: this.walkIn.appointment_date });
      this.walkInBooking = await this.api.get<OpdBookingOptionsResponse>(
        `/centers/${Number(this.walkIn.center_id)}/opd-booking-options?${q}`,
      );
      const opds = this.walkInBooking.opds ?? [];
      if (this.walkIn.opd_id !== '' && !opds.some((b) => b.opd.id === this.walkIn.opd_id)) {
        this.walkIn.opd_id = '';
        this.walkIn.clinic_id = '';
      }
      const clinics = this.walkInClinicsForSelectedOpd();
      if (this.walkIn.clinic_id !== '' && !clinics.some((c) => c.clinic_id === this.walkIn.clinic_id)) {
        this.walkIn.clinic_id = '';
      }
    } catch {
      this.walkInBooking = null;
      this.toast.error('Could not load OPD / clinic options for this date.');
    } finally {
      this.walkInBookingLoading = false;
    }
  }

  async onWalkInCenterOrDateChanged(): Promise<void> {
    this.walkIn.opd_id = '';
    this.walkIn.clinic_id = '';
    if (this.creatingWalkIn) await this.loadWalkInBookingOptions();
    this.cdr.detectChanges();
  }

  onWalkInOpdChanged(): void {
    this.walkIn.clinic_id = '';
    this.cdr.detectChanges();
  }

  async loadCenters(): Promise<void> {
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
      const walkInCenter = listCenterIdForRequest(this.auth.user(), this.walkIn.center_id as number | '');
      if (walkInCenter !== '') this.walkIn.center_id = walkInCenter;
      else if (this.walkIn.center_id === '' && this.centers[0]) this.walkIn.center_id = this.centers[0].id;
    } catch (e) {
      try {
        this.centers = await this.api.get<Center[]>('/public/centers', ms);
        const walkInCenter = listCenterIdForRequest(this.auth.user(), this.walkIn.center_id as number | '');
        if (walkInCenter !== '') this.walkIn.center_id = walkInCenter;
        else if (this.walkIn.center_id === '' && this.centers[0]) this.walkIn.center_id = this.centers[0].id;
      } catch {
        this.centers = [];
        this.error = e instanceof Error ? e.message : 'Failed to load centers';
      }
    }
    if (this.isAdmin() && this.walkIn.center_id === '' && this.centers[0]) {
      this.walkIn.center_id = this.centers[0].id;
    }
  }

  async onAdminOpdChanged(): Promise<void> {
    this.centerId = centerIdFromOpd(this.opdPickList, this.filterOpdId);
    this.page = 1;
    await this.loadAppointments();
  }

  async loadAppointments(): Promise<void> {
    this.syncListScope();
    const runId = ++this.loadRunId;
    this.busy = true;
    this.error = '';
    this.cdr.detectChanges();
    try {
      const q = new URLSearchParams();
      if (this.isAdmin()) {
        if (this.filterOpdId !== '') q.set('opd_id', String(this.filterOpdId));
        else if (this.centerId !== '') q.set('center_id', String(this.centerId));
      } else if (this.centerId !== '') {
        q.set('center_id', String(this.centerId));
      }
      if (this.date) q.set('date', this.date);
      if (this.status) q.set('status', this.status);
      const next = await this.api.get<Appointment[]>(`/appointments?${q.toString()}`);
      if (this.loadRunId !== runId) return;
      this.rows = next;
      const maxPage = Math.max(1, Math.ceil(this.rows.length / this.pageSize));
      if (this.page > maxPage) this.page = maxPage;
    } catch (e) {
      if (this.loadRunId !== runId) return;
      this.error = e instanceof Error ? e.message : 'Failed to load appointments';
      this.rows = [];
    } finally {
      if (this.loadRunId !== runId) return;
      this.busy = false;
      this.cdr.detectChanges();
    }
  }

  closeWalkInModal(): void {
    this.cancelWalkInCnicScanner();
    this.creatingWalkIn = false;
    this.walkInSuccess = null;
    this.walkInBooking = null;
    this.cdr.detectChanges();
  }

  /** Backdrop: ignore taps while the success step is shown so staff use Done / Print. */
  onWalkInBackdropClick(): void {
    if (this.walkInSuccess) return;
    this.closeWalkInModal();
  }

  printWalkInSuccessSlip(): void {
    const a = this.walkInSuccess;
    if (!a) return;
    const opdLine = [a.opd_display_code, a.opd_name].filter(Boolean).join(' · ') || '—';
    const ticketLine = a.ticket_display?.trim() || String(a.token_number);
    const idNote = this.patientIdentifierBadge(a.patient_identifier_kind);
    this.slipPrint.print('OPD Ticket Slip', 'Walk-in — OPD visit ticket', [
      { label: 'Ticket', value: ticketLine },
      { label: 'W number', value: a.w_number?.trim() || '-' },
      { label: 'Patient', value: a.patient_name?.trim() || '-' },
      { label: 'CNIC', value: a.patient_cnic?.trim() || this.walkIn.cnic.trim() || '-' },
      ...(idNote ? [{ label: 'CNIC note', value: idNote }] : []),
      { label: 'OPD', value: opdLine },
      { label: 'Clinic', value: a.clinic_name || '—' },
      { label: 'Campus / center', value: a.center_name || this.walkInCenterLabel() },
      { label: 'Visit date', value: String(a.appointment_date).slice(0, 10) },
      { label: 'Status', value: 'booked (walk-in)' },
    ]);
  }

  async finishWalkInSuccess(): Promise<void> {
    this.walkIn.cnic = '';
    this.walkIn.identifier_kind = 'own';
    this.walkIn.escort_relationship = '';
    this.walkIn.date_of_birth = '';
    this.walkIn.first_name = '';
    this.walkIn.last_name = '';
    this.walkIn.phone = '';
    this.walkIn.gender = '';
    this.walkIn.address = '';
    this.walkIn.opd_id = '';
    this.walkIn.clinic_id = '';
    this.walkInSuccess = null;
    this.closeWalkInModal();
    await this.loadAppointments();
  }

  private walkInCenterLabel(): string {
    const c = this.centers.find((x) => x.id === this.walkIn.center_id);
    return c ? `${c.hospital_name || ''} - ${c.name} (${c.city || ''})`.trim() : '—';
  }

  private async prefillWalkInFromServer(): Promise<void> {
    if (!this.creatingWalkIn || this.walkInSuccess) return;
    const digits = cnicDigits(this.walkIn.cnic);
    if (digits.length !== 13) return;
    const kind = this.walkIn.identifier_kind;
    const fn = this.walkIn.first_name.trim();
    const dob = String(this.walkIn.date_of_birth ?? '')
      .trim()
      .slice(0, 10);
    if (kind !== 'own' && (!fn || !/^\d{4}-\d{2}-\d{2}$/.test(dob))) return;
    try {
      const q = new URLSearchParams();
      q.set('cnic', digits);
      q.set('identifier_kind', kind);
      if (kind !== 'own') {
        q.set('first_name', fn);
        q.set('date_of_birth', dob);
      }
      const res = await this.api.get<{ patient: WalkInPreviewPatient | null }>(
        `/patients/walk-in-preview?${q.toString()}`,
        15000,
      );
      const p = res.patient;
      if (!p) return;
      this.walkIn.first_name = p.first_name ?? '';
      this.walkIn.last_name = (p.last_name ?? '').trim();
      if (p.date_of_birth) {
        this.walkIn.date_of_birth = String(p.date_of_birth).slice(0, 10);
      }
      if (kind === 'own') {
        this.walkIn.phone = (p.phone ?? '').trim();
        this.walkIn.gender = (p.gender ?? '').trim();
        this.walkIn.address = (p.address ?? '').trim();
      }
      if (p.identifier_kind === 'relative_escort' && p.escort_relationship) {
        this.walkIn.escort_relationship = p.escort_relationship;
      }
      this.cdr.detectChanges();
    } catch {
      /* no match or network — ignore */
    }
  }

  async createWalkIn(): Promise<void> {
    if (this.walkIn.center_id === '' || !this.walkIn.first_name.trim() || !this.walkIn.cnic.trim()) {
      this.error = 'Center, CNIC and first name are required for walk-in token.';
      this.toast.error(this.error);
      return;
    }
    if (!isValidCnic13(this.walkIn.cnic)) {
      this.error = 'CNIC must be exactly 13 digits.';
      this.toast.error(this.error);
      return;
    }
    if (this.walkIn.identifier_kind === 'relative_escort' && !this.walkIn.escort_relationship.trim()) {
      this.error = 'Enter how the CNIC holder is related to the patient (e.g. brother, spouse).';
      this.toast.error(this.error);
      return;
    }
    const dobNeed =
      this.walkIn.identifier_kind !== 'own' &&
      !/^\d{4}-\d{2}-\d{2}$/.test(String(this.walkIn.date_of_birth ?? '').trim().slice(0, 10));
    if (dobNeed) {
      this.error = 'Date of birth is required when the CNIC number belongs to a parent or relative (patient is still the child / visitor).';
      this.toast.error(this.error);
      return;
    }
    if (this.walkIn.opd_id === '' || this.walkIn.clinic_id === '') {
      this.error = 'Select OPD and clinic so the ticket prefix matches the roster (e.g. SKS-0001, DVC-0001).';
      this.toast.error(this.error);
      return;
    }
    this.walkInSaving = true;
    this.error = '';
    try {
      const dob =
        this.walkIn.identifier_kind === 'own'
          ? this.walkIn.date_of_birth.trim().slice(0, 10) || null
          : this.walkIn.date_of_birth.trim().slice(0, 10);
      const created = await this.api.post<Appointment>('/appointments/walk-in', {
        center_id: Number(this.walkIn.center_id),
        appointment_date: this.walkIn.appointment_date,
        opd_id: Number(this.walkIn.opd_id),
        clinic_id: Number(this.walkIn.clinic_id),
        patient: {
          cnic: normalizeCnicInput(this.walkIn.cnic).trim(),
          identifier_kind: this.walkIn.identifier_kind,
          escort_relationship:
            this.walkIn.identifier_kind === 'relative_escort'
              ? this.walkIn.escort_relationship.trim().slice(0, 50) || null
              : null,
          first_name: this.walkIn.first_name.trim(),
          last_name: this.walkIn.last_name.trim() || null,
          date_of_birth: dob,
          phone: this.walkIn.identifier_kind === 'own' && this.walkIn.phone.trim() ? this.walkIn.phone.trim().slice(0, 20) : null,
          gender: this.walkIn.identifier_kind === 'own' && this.walkIn.gender.trim() ? this.walkIn.gender.trim().slice(0, 20) : null,
          address: this.walkIn.identifier_kind === 'own' && this.walkIn.address.trim() ? this.walkIn.address.trim().slice(0, 255) : null,
        },
      });
      if (created.walk_in_notices?.length) {
        for (const line of created.walk_in_notices) {
          this.toast.info(line);
        }
      }
      this.walkInSuccess = created;
      this.page = 1;
      void this.loadAppointments();
      this.toast.success('Walk-in token created — print slip or tap Done when finished.');
      this.cdr.detectChanges();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not create walk-in appointment';
      this.toast.error(this.error);
    } finally {
      this.walkInSaving = false;
    }
  }

  async completeAppointment(row: Appointment): Promise<void> {
    this.busy = true;
    this.error = '';
    try {
      await this.api.post(`/appointments/${row.id}/complete`, {});
      this.toast.success(`Appointment for token #${row.token_number} marked completed.`);
      await this.loadAppointments();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not complete appointment';
      this.toast.error(this.error);
    } finally {
      this.busy = false;
    }
  }
}
