import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';
import { ApiError, ApiService } from '../../../core/services/api';
import { AuthService } from '../../../core/services/auth';
import { centerIdFromOpd, consoleIsAdmin, listCenterIdForRequest, listDateForRequest } from '../../../core/utils/listing-scope';
import { SpeechInput } from '../../../ui-kit/speech-input/speech-input';
import { SlipPrintService } from '../../../core/services/slip-print.service';
import { ToastService } from '../../../core/services/toast';
import { todayLocalYmd } from '../../../core/utils/local-date';
import { FingerprintReaderService } from '../../../core/services/fingerprint-reader.service';

type Center = { id: number; name: string; hospital_name?: string; city?: string };
type OpdPickRow = { id: number; name: string; display_code: string; center_id: number; center_label: string; sort_order: number };
type PatientIdentifierKind = 'own' | 'minor_father_cnic' | 'minor_mother_cnic' | 'relative_escort';

type Appt = {
  id: number;
  patient_id?: number;
  token_number: number;
  patient_name: string;
  patient_cnic?: string;
  /** From server after `patients.biometric_enrolled` + desk workflow. */
  patient_biometric_enrolled?: boolean | null;
  patient_identifier_kind?: PatientIdentifierKind | string | null;
  patient_escort_relationship?: string | null;
  center_name?: string;
  center_id?: number;
  appointment_date?: string;
  status: string;
  visit_barcode?: string | null;
  w_number?: string | null;
  opd_name?: string | null;
  opd_display_code?: string | null;
  clinic_name?: string | null;
  ticket_display?: string | null;
};
/**
 * Patient app draws CODE128 (32-char hex), not retail UPC/EAN — dedicated "1D retail" modes often skip it.
 * Do not lock POSSIBLE_FORMATS to CODE_128 only: ZXing can mis-classify marginal screen captures; TRY_HARDER helps moiré/glare.
 */
const VISIT_BARCODE_SCAN_HINTS = new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true]]);

type LookupResponse = {
  appointment: Appt;
  patient: {
    first_name: string;
    last_name?: string | null;
    father_name?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    gender?: string | null;
    date_of_birth?: string | null;
    medical_record_number?: string | null;
    identifier_kind?: PatientIdentifierKind | string | null;
    escort_relationship?: string | null;
    biometric_enrolled?: boolean | null;
  } | null;
};

type DeskBiometricIssueResponse = {
  desk_biometric_token: string;
  expires_in_minutes: number;
  biometric_enrolled: boolean;
};
@Component({
  selector: 'app-registration-page',
  imports: [CommonModule, FormsModule, SpeechInput],
  templateUrl: './registration-page.html',
  styleUrl: './registration-page.scss',
})
export class RegistrationPage implements OnInit, OnDestroy {
  @ViewChild('scannerVideo') scannerVideoRef?: ElementRef<HTMLVideoElement>;

  centers: Center[] = [];
  opdPickList: OpdPickRow[] = [];
  filterOpdId: number | '' = '';
  centerId: number | '' = '';
  date = todayLocalYmd();
  cnic = '';
  booked: Appt[] = [];
  selected: Appt | null = null;

  patient = {
    first_name: '',
    last_name: '',
    father_name: '',
    phone: '',
    address: '',
    city: '',
    gender: '',
    date_of_birth: '',
    medical_record_number: '',
    identifier_kind: 'own' as PatientIdentifierKind,
    escort_relationship: '',
  };

  loading = false;
  saving = false;
  /** When chart used escort/parent CNIC, staff can record the patient’s own 13-digit NIC (same chart, all visits kept). */
  upgradeOwnCnicDigits = '';
  upgradeOwnCnicSaving = false;
  error = '';
  scannerOpen = false;
  /** ZXing continuous-scan controls — must `.stop()` to release camera. */
  private scannerControls: IScannerControls | null = null;
  private suppressNoRecordToastOnce = false;
  private scanUserCancelled = false;

  /** UUID from POST …/desk-biometric/enroll|verify — required before POST /appointments/register. */
  deskBiometricToken: string | null = null;
  deskBiometricFinger: 'right_thumb' | 'left_thumb' = 'right_thumb';
  fingerprintBusy = false;
  /** 1 = biometric only; 2 = patient form + register (after token issued). */
  registrationWizardStep: 1 | 2 = 1;

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly slipPrint: SlipPrintService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
    private readonly ngZone: NgZone,
    private readonly fingerprintReader: FingerprintReaderService,
  ) {}

  isAdmin(): boolean {
    return consoleIsAdmin(this.auth.user());
  }

  onAdminOpdChanged(): void {
    this.centerId = centerIdFromOpd(this.opdPickList, this.filterOpdId);
    this.cdr.detectChanges();
  }

  private resetPatientForm(): void {
    this.deskBiometricToken = null;
    this.patient = {
      first_name: '',
      last_name: '',
      father_name: '',
      phone: '',
      address: '',
      city: '',
      gender: '',
      date_of_birth: '',
      medical_record_number: '',
      identifier_kind: 'own',
      escort_relationship: '',
    };
  }

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

  async ngOnInit(): Promise<void> {
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
    } else {
      const c = this.auth.user()?.opd_center_id;
      if (c != null) this.centerId = c;
    }
    this.date = listDateForRequest(this.auth.user(), this.date);
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

  ngOnDestroy(): void {
    this.stopBarcodeScanner();
  }

  openBarcodeScanner(): void {
    if (this.loading || this.scannerOpen) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.toast.error('Camera access is not available in this browser. Use a secure (HTTPS) connection or a modern browser.');
      return;
    }
    this.scanUserCancelled = false;
    this.scannerOpen = true;
    this.cdr.detectChanges();
    setTimeout(() => void this.runBarcodeScan(), 0);
  }

  cancelBarcodeScanner(): void {
    this.scanUserCancelled = true;
    this.stopBarcodeScanner();
    this.scannerOpen = false;
    this.cdr.detectChanges();
  }

  private stopBarcodeScanner(): void {
    try {
      this.scannerControls?.stop();
    } catch {
      /* ZXing stop may throw if already torn down */
    }
    this.scannerControls = null;
    const el = this.scannerVideoRef?.nativeElement;
    if (el?.srcObject) {
      const stream = el.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      el.srcObject = null;
    }
  }

  private async runBarcodeScan(): Promise<void> {
    const video = this.scannerVideoRef?.nativeElement;
    if (!video) {
      this.toast.error('Scanner could not start.');
      this.scannerOpen = false;
      this.cdr.detectChanges();
      return;
    }
    const reader = new BrowserMultiFormatReader(VISIT_BARCODE_SCAN_HINTS);
    try {
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      if (this.scanUserCancelled) {
        this.scannerOpen = false;
        this.cdr.detectChanges();
        return;
      }
      const back = devices.find((d) => /back|rear|environment/i.test(d.label));
      const deviceId = back?.deviceId;

      const videoConstraints: MediaTrackConstraints = deviceId
        ? {
            deviceId: { exact: deviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          }
        : {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          };

      const controls = await reader.decodeFromConstraints({ video: videoConstraints }, video, (result, _err, ctrl) => {
        if (this.scanUserCancelled) {
          ctrl.stop();
          return;
        }
        this.ngZone.run(() => {
          if (result) {
            const raw = result.getText();
            const token = this.visitTokenFromScan(raw);
            if (token) {
              ctrl.stop();
              this.scannerControls = null;
              this.scannerOpen = false;
              this.cdr.detectChanges();
              void this.lookupVisitBarcodeWithCode(raw);
            }
          }
        });
      });

      this.scannerControls = controls;
      this.cdr.detectChanges();
    } catch (e) {
      if (this.scanUserCancelled) return;
      this.stopBarcodeScanner();
      this.scannerOpen = false;
      this.cdr.detectChanges();
      const name = e instanceof Error ? e.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        this.toast.error('Camera permission was denied. Allow camera access to scan the visit barcode.');
        return;
      }
      if (name === 'NotFoundError') {
        this.toast.error('No camera found on this device.');
        return;
      }
      this.toast.error(
        e instanceof Error ? e.message : 'Could not read barcode. Try again, ensure good lighting, or use CNIC lookup.',
      );
    }
  }

  /**
   * Extract the 32-char hex visit token (same idea as backend `parseVisitBarcode`).
   * Prefer the first `[0-9a-f]{32}` block so label text / prefixes from scanners do not break lookup.
   */
  private visitTokenFromScan(raw: string): string | null {
    const n = String(raw ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
    const block = n.match(/[0-9a-f]{32}/);
    if (block) return block[0];
    const only = n.replace(/[^0-9a-f]/g, '');
    return /^[0-9a-f]{32}$/.test(only) ? only : null;
  }

  private async lookupVisitBarcodeWithCode(raw: string): Promise<void> {
    const code = this.visitTokenFromScan(raw);
    if (!code) {
      this.toast.error(
        'Scanned value is not a valid visit barcode. Use CODE128 from the patient app or CNIC lookup.',
      );
      return;
    }
    this.loading = true;
    this.error = '';
    try {
      const q = new URLSearchParams({ visit_barcode: code });
      const result = await this.api.get<LookupResponse>(`/appointments/lookup-visit-barcode?${q.toString()}`);
      this.booked = [result.appointment];
      this.resetPatientForm();
      if (result.patient) {
        this.patient.first_name = result.patient.first_name ?? '';
        this.patient.last_name = result.patient.last_name ?? '';
        this.patient.father_name = result.patient.father_name ?? '';
        this.patient.phone = result.patient.phone ?? '';
        this.patient.address = result.patient.address ?? '';
        this.patient.city = result.patient.city ?? '';
        this.patient.gender = result.patient.gender ?? '';
        this.patient.date_of_birth = (result.patient.date_of_birth ?? '').slice(0, 10);
        this.patient.medical_record_number = result.patient.medical_record_number ?? '';
        this.patient.identifier_kind = (result.patient.identifier_kind as PatientIdentifierKind) || 'own';
        this.patient.escort_relationship = result.patient.escort_relationship ?? '';
      }
      this.selected = null;
      this.centerId = result.appointment.center_id != null ? result.appointment.center_id : this.centerId;
      this.date = String(result.appointment.appointment_date ?? this.date).slice(0, 10);
      if (!this.suppressNoRecordToastOnce) this.toast.success('Booked visit found by barcode.');
      this.suppressNoRecordToastOnce = false;
    } catch (e) {
      this.booked = [];
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Barcode lookup failed';
      const quiet404 = e instanceof ApiError && e.status === 404 && this.suppressNoRecordToastOnce;
      this.error = quiet404 ? '' : msg;
      if (!quiet404) this.toast.error(msg);
      this.suppressNoRecordToastOnce = false;
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async lookup(): Promise<void> {
    if (this.isAdmin()) {
      this.centerId = centerIdFromOpd(this.opdPickList, this.filterOpdId);
    }
    const day = listDateForRequest(this.auth.user(), this.date);
    const cid = listCenterIdForRequest(this.auth.user(), this.centerId);
    if (cid === '' || !this.cnic.trim()) {
      this.toast.error('Site and CNIC are required for lookup.');
      return;
    }
    this.loading = true;
    this.error = '';
    try {
      const q = new URLSearchParams({
        cnic: this.cnic.trim(),
        center_id: String(cid),
        date: day,
      });
      const result = await this.api.get<LookupResponse>(`/appointments/lookup-booked?${q.toString()}`);
      this.booked = [result.appointment];
      this.resetPatientForm();
      if (result.patient) {
        this.patient.first_name = result.patient.first_name ?? '';
        this.patient.last_name = result.patient.last_name ?? '';
        this.patient.father_name = result.patient.father_name ?? '';
        this.patient.phone = result.patient.phone ?? '';
        this.patient.address = result.patient.address ?? '';
        this.patient.city = result.patient.city ?? '';
        this.patient.gender = result.patient.gender ?? '';
        this.patient.date_of_birth = (result.patient.date_of_birth ?? '').slice(0, 10);
        this.patient.medical_record_number = result.patient.medical_record_number ?? '';
        this.patient.identifier_kind = (result.patient.identifier_kind as PatientIdentifierKind) || 'own';
        this.patient.escort_relationship = result.patient.escort_relationship ?? '';
      }
      this.selected = null;
      if (!this.suppressNoRecordToastOnce) this.toast.success('Booked record found.');
      this.suppressNoRecordToastOnce = false;
    } catch (e) {
      this.booked = [];
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Failed to lookup booked appointments';
      const quiet404 = e instanceof ApiError && e.status === 404 && this.suppressNoRecordToastOnce;
      this.error = quiet404 ? '' : msg;
      if (!quiet404) this.toast.error(msg);
      this.suppressNoRecordToastOnce = false;
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  pick(appt: Appt): void {
    this.selected = appt;
    this.registrationWizardStep = 1;
    this.deskBiometricToken = null;
    this.upgradeOwnCnicDigits = '';
    this.patient.first_name = appt.patient_name?.split(' ')[0] || '';
    if (appt.patient_identifier_kind) {
      this.patient.identifier_kind = appt.patient_identifier_kind as PatientIdentifierKind;
    }
    if (appt.patient_escort_relationship != null) {
      this.patient.escort_relationship = appt.patient_escort_relationship;
    }
    this.cdr.detectChanges();
  }

  patientHasBiometricOnFile(): boolean {
    return this.selected?.patient_biometric_enrolled === true;
  }

  /** Android WebView injected native bridge (ZKFinger on tablet). */
  androidBiometricReady(): boolean {
    return this.fingerprintReader.isConfigured();
  }

  goToPatientDetailsStep(): void {
    if (!this.deskBiometricToken?.trim()) {
      this.toast.error('Enroll or verify fingerprint first, then continue.');
      return;
    }
    this.registrationWizardStep = 2;
    this.cdr.detectChanges();
  }

  backToBiometricStep(): void {
    this.registrationWizardStep = 1;
    this.cdr.detectChanges();
  }

  private fingerprintReaderErrorMessage(e: unknown): string {
    if (e instanceof HttpErrorResponse) {
      const body = e.error as { error?: string; message?: string } | null;
      return body?.error || body?.message || e.message || 'Fingerprint reader request failed';
    }
    if (e instanceof Error) return e.message;
    return 'Fingerprint reader request failed';
  }

  async deskBiometricEnroll(): Promise<void> {
    if (!this.selected?.id) return;
    this.fingerprintBusy = true;
    this.error = '';
    try {
      if (!this.fingerprintReader.isConfigured()) {
        this.toast.error(this.fingerprintReader.bridgeMissingMessage());
        return;
      }
      let template_base64: string;
      let device_id: string;
      try {
        const cap = await this.fingerprintReader.captureTemplate();
        template_base64 = cap.template_base64;
        device_id = 'ANDROID-TABLET';
      } catch (e) {
        this.toast.error(this.fingerprintReaderErrorMessage(e));
        return;
      }
      const res = await this.api.post<DeskBiometricIssueResponse>(
        `/appointments/${this.selected.id}/desk-biometric/enroll`,
        {
          finger_index: this.deskBiometricFinger,
          template_base64,
          device_id,
        },
        30000,
      );
      this.deskBiometricToken = res.desk_biometric_token;
      this.selected = { ...this.selected, patient_biometric_enrolled: res.biometric_enrolled };
      this.toast.success(
        `Fingerprint enrolled. Token ~${res.expires_in_minutes} min — press Continue to patient details when ready.`,
      );
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Enrollment failed';
      this.toast.error(this.error);
    } finally {
      this.fingerprintBusy = false;
      this.cdr.detectChanges();
    }
  }

  async deskBiometricVerify(): Promise<void> {
    if (!this.selected?.id) return;
    this.fingerprintBusy = true;
    this.error = '';
    try {
      if (!this.fingerprintReader.isConfigured()) {
        this.toast.error(this.fingerprintReader.bridgeMissingMessage());
        return;
      }
      let refs: { patient_id: number; templates: Array<{ finger_index: string; template_base64: string }> };
      try {
        refs = await this.api.get<{
          patient_id: number;
          templates: Array<{ finger_index: string; template_base64: string }>;
        }>(`/appointments/${this.selected.id}/desk-biometric/reference-templates`, 20000);
      } catch (e) {
        this.toast.error(e instanceof ApiError ? e.message : 'Could not load stored fingerprint templates');
        return;
      }
      if (!refs.templates?.length) {
        this.toast.error('No fingerprint templates on file for this patient — enroll first.');
        return;
      }
      let match: { matched: boolean };
      try {
        match = await this.fingerprintReader.matchTemplates(refs.templates);
      } catch (e) {
        this.toast.error(this.fingerprintReaderErrorMessage(e));
        return;
      }
      if (!match.matched) {
        this.toast.error('Fingerprint did not match. Try again or use another enrolled finger.');
        return;
      }
      const res = await this.api.post<DeskBiometricIssueResponse>(
        `/appointments/${this.selected.id}/desk-biometric/verify`,
        { reader_match: true, device_id: 'ANDROID-TABLET' },
        30000,
      );
      this.deskBiometricToken = res.desk_biometric_token;
      this.toast.success(
        `Fingerprint verified. Token ~${res.expires_in_minutes} min — press Continue to patient details when ready.`,
      );
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Verification failed';
      this.toast.error(this.error);
    } finally {
      this.fingerprintBusy = false;
      this.cdr.detectChanges();
    }
  }

  showUpgradeOwnCnic(): boolean {
    const k = this.selected?.patient_identifier_kind ?? this.patient.identifier_kind;
    return Boolean(this.selected?.patient_id && k && k !== 'own');
  }

  async savePatientOwnCnicOnChart(): Promise<void> {
    const pid = this.selected?.patient_id;
    if (pid == null) {
      this.toast.error('Patient id missing — use lookup again.');
      return;
    }
    const raw = this.upgradeOwnCnicDigits.replace(/\D/g, '');
    if (raw.length !== 13) {
      this.toast.error('Enter the patient’s own CNIC as 13 digits.');
      return;
    }
    const dashed = `${raw.slice(0, 5)}-${raw.slice(5, 12)}-${raw.slice(12)}`;
    this.upgradeOwnCnicSaving = true;
    this.error = '';
    try {
      await this.api.post(
        `/patients/${pid}/upgrade-own-cnic`,
        { new_cnic: dashed },
        20000,
      );
      this.toast.success('Chart updated to patient’s own CNIC. Future tickets use the new number; past visits stay on this chart.');
      this.upgradeOwnCnicDigits = '';
      if (this.selected) {
        this.selected = { ...this.selected, patient_identifier_kind: 'own', patient_cnic: dashed };
      }
      this.patient.identifier_kind = 'own';
      this.patient.escort_relationship = '';
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not update CNIC';
      this.toast.error(this.error);
    } finally {
      this.upgradeOwnCnicSaving = false;
      this.cdr.detectChanges();
    }
  }

  async register(): Promise<void> {
    if (!this.selected) return;
    if (this.registrationWizardStep !== 2) {
      this.toast.error('Use Continue to go to patient details before registering.');
      return;
    }
    if (!this.deskBiometricToken?.trim()) {
      this.toast.error('Fingerprint step is required: enroll (first visit) or verify, then register.');
      return;
    }
    if (this.patient.identifier_kind === 'relative_escort' && !this.patient.escort_relationship.trim()) {
      this.error = 'Enter how the CNIC holder is related to the patient.';
      this.toast.error(this.error);
      return;
    }
    if (
      this.patient.identifier_kind !== 'own' &&
      !/^\d{4}-\d{2}-\d{2}$/.test(this.patient.date_of_birth.trim().slice(0, 10))
    ) {
      this.error = 'Date of birth is required when CNIC on file is a parent’s or relative’s number.';
      this.toast.error(this.error);
      return;
    }
    const selected = this.selected;
    this.saving = true;
    this.error = '';
    try {
      const updated = await this.api.post<Appt>(
        '/appointments/register',
        {
          appointment_id: this.selected.id,
          desk_biometric_token: this.deskBiometricToken,
          visit_barcode: this.selected.visit_barcode?.trim() || null,
          patient: {
            first_name: this.patient.first_name,
            last_name: this.patient.last_name || null,
            father_name: this.patient.father_name || null,
            phone: this.patient.phone || null,
            address: this.patient.address || null,
            city: this.patient.city || null,
            gender: this.patient.gender || null,
            date_of_birth: this.patient.date_of_birth || null,
            medical_record_number: this.patient.medical_record_number || null,
            identifier_kind: this.patient.identifier_kind,
            escort_relationship:
              this.patient.identifier_kind === 'relative_escort'
                ? this.patient.escort_relationship.trim().slice(0, 50) || null
                : null,
          },
        },
        20000,
      );
      this.toast.success('Patient check-in confirmed.');
      const opdLine = [selected.opd_display_code, selected.opd_name].filter(Boolean).join(' · ') || '—';
      const ticketLine = updated.ticket_display?.trim() || String(selected.token_number);
      const idNote = this.patientIdentifierBadge(this.patient.identifier_kind);
      this.slipPrint.print('OPD Ticket Slip', 'Registration — OPD visit ticket', [
        { label: 'Ticket', value: ticketLine },
        { label: 'W number', value: updated.w_number?.trim() || '-' },
        { label: 'Patient', value: selected.patient_name || this.patient.first_name || '-' },
        { label: 'CNIC', value: selected.patient_cnic || this.cnic || '-' },
        ...(idNote ? [{ label: 'CNIC note', value: idNote }] : []),
        { label: 'OPD', value: opdLine },
        { label: 'Clinic', value: selected.clinic_name || updated.clinic_name || '—' },
        { label: 'Campus / center', value: selected.center_name || this.centerLabel() },
        { label: 'Visit date', value: this.date },
        { label: 'Status', value: 'registered' },
      ]);
      this.deskBiometricToken = null;
      this.registrationWizardStep = 1;
      this.suppressNoRecordToastOnce = true;
      await this.lookup();
      this.booked = [];
      this.selected = null;
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Registration failed';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  private centerLabel(): string {
    const c = this.centers.find((x) => x.id === this.centerId);
    return c ? `${c.hospital_name || ''} - ${c.name} (${c.city || ''})` : '-';
  }
}
