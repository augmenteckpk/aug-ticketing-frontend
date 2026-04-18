import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';
import { ApiError, ApiService } from '../../../core/services/api';
import { SpeechInput } from '../../../ui-kit/speech-input/speech-input';
import { SlipPrintService } from '../../../core/services/slip-print.service';
import { ToastService } from '../../../core/services/toast';
import { todayLocalYmd } from '../../../core/utils/local-date';

type Center = { id: number; name: string; hospital_name?: string; city?: string };
type Appt = {
  id: number;
  token_number: number;
  patient_name: string;
  patient_cnic?: string;
  center_name?: string;
  center_id?: number;
  appointment_date?: string;
  status: string;
  visit_barcode?: string | null;
  w_number?: string | null;
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
    father_cnic?: string | null;
    mother_cnic?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    gender?: string | null;
    date_of_birth?: string | null;
    medical_record_number?: string | null;
  } | null;
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
  centerId: number | '' = '';
  date = todayLocalYmd();
  cnic = '';
  booked: Appt[] = [];
  selected: Appt | null = null;

  patient = {
    first_name: '',
    last_name: '',
    father_name: '',
    father_cnic: '',
    mother_cnic: '',
    phone: '',
    address: '',
    city: '',
    gender: '',
    date_of_birth: '',
    medical_record_number: '',
  };

  loading = false;
  saving = false;
  error = '';
  scannerOpen = false;
  /** USB / Bluetooth keyboard-wedge scanners, or paste from tools like Dynamsoft. */
  wedgeBarcode = '';
  private suppressNoRecordToastOnce = false;
  private scanUserCancelled = false;

  constructor(
    private readonly api: ApiService,
    private readonly slipPrint: SlipPrintService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  private resetPatientForm(): void {
    this.patient = {
      first_name: '',
      last_name: '',
      father_name: '',
      father_cnic: '',
      mother_cnic: '',
      phone: '',
      address: '',
      city: '',
      gender: '',
      date_of_birth: '',
      medical_record_number: '',
    };
  }

  async ngOnInit(): Promise<void> {
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
      const back = devices.find((d) => /back|rear|environment/i.test(d.label));
      const deviceId = back?.deviceId;
      const result = await reader.decodeOnceFromVideoDevice(deviceId, video);
      if (this.scanUserCancelled) {
        this.stopBarcodeScanner();
        return;
      }
      const raw = result.getText();
      this.stopBarcodeScanner();
      this.scannerOpen = false;
      this.cdr.detectChanges();
      await this.lookupVisitBarcodeWithCode(raw);
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

  async onWedgeBarcodeSubmit(): Promise<void> {
    const raw = this.wedgeBarcode.trim();
    if (!raw) {
      this.toast.error('Enter or scan the visit barcode first.');
      return;
    }
    if (!this.visitTokenFromScan(raw)) {
      this.toast.error('Not a valid visit barcode (32 hex characters, as on the patient app).');
      return;
    }
    this.wedgeBarcode = '';
    await this.lookupVisitBarcodeWithCode(raw);
  }

  private async lookupVisitBarcodeWithCode(raw: string): Promise<void> {
    const code = this.visitTokenFromScan(raw);
    if (!code) {
      this.toast.error(
        'Scanned value is not a valid visit barcode. Use CODE128 from the patient app, USB scanner / paste field, or CNIC lookup.',
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
        this.patient.father_cnic = result.patient.father_cnic ?? '';
        this.patient.mother_cnic = result.patient.mother_cnic ?? '';
        this.patient.phone = result.patient.phone ?? '';
        this.patient.address = result.patient.address ?? '';
        this.patient.city = result.patient.city ?? '';
        this.patient.gender = result.patient.gender ?? '';
        this.patient.date_of_birth = (result.patient.date_of_birth ?? '').slice(0, 10);
        this.patient.medical_record_number = result.patient.medical_record_number ?? '';
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
    if (this.centerId === '' || !this.cnic.trim()) {
      this.toast.error('Center and CNIC are required for lookup.');
      return;
    }
    this.loading = true;
    this.error = '';
    try {
      const q = new URLSearchParams({
        cnic: this.cnic.trim(),
        center_id: String(this.centerId),
        date: this.date,
      });
      const result = await this.api.get<LookupResponse>(`/appointments/lookup-booked?${q.toString()}`);
      this.booked = [result.appointment];
      this.resetPatientForm();
      if (result.patient) {
        this.patient.first_name = result.patient.first_name ?? '';
        this.patient.last_name = result.patient.last_name ?? '';
        this.patient.father_name = result.patient.father_name ?? '';
        this.patient.father_cnic = result.patient.father_cnic ?? '';
        this.patient.mother_cnic = result.patient.mother_cnic ?? '';
        this.patient.phone = result.patient.phone ?? '';
        this.patient.address = result.patient.address ?? '';
        this.patient.city = result.patient.city ?? '';
        this.patient.gender = result.patient.gender ?? '';
        this.patient.date_of_birth = (result.patient.date_of_birth ?? '').slice(0, 10);
        this.patient.medical_record_number = result.patient.medical_record_number ?? '';
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
    this.patient.first_name = appt.patient_name?.split(' ')[0] || '';
    this.cdr.detectChanges();
  }

  async register(): Promise<void> {
    if (!this.selected) return;
    const selected = this.selected;
    this.saving = true;
    this.error = '';
    try {
      const updated = await this.api.post<Appt>(
        '/appointments/register',
        {
          appointment_id: this.selected.id,
          visit_barcode: this.selected.visit_barcode?.trim() || null,
          patient: {
            first_name: this.patient.first_name,
            last_name: this.patient.last_name || null,
            father_name: this.patient.father_name || null,
            father_cnic: this.patient.father_cnic || null,
            mother_cnic: this.patient.mother_cnic || null,
            phone: this.patient.phone || null,
            address: this.patient.address || null,
            city: this.patient.city || null,
            gender: this.patient.gender || null,
            date_of_birth: this.patient.date_of_birth || null,
            medical_record_number: this.patient.medical_record_number || null,
          },
        },
        20000,
      );
      this.toast.success('Patient check-in confirmed.');
      this.slipPrint.print('OPD Ticket Slip', 'Registration confirmed ticket', [
        { label: 'Token', value: String(selected.token_number) },
        { label: 'W number', value: updated.w_number?.trim() || '-' },
        { label: 'Patient', value: selected.patient_name || this.patient.first_name || '-' },
        { label: 'CNIC', value: selected.patient_cnic || this.cnic || '-' },
        { label: 'Center', value: selected.center_name || this.centerLabel() },
        { label: 'Visit date', value: this.date },
        { label: 'Status', value: 'registered' },
      ]);
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
