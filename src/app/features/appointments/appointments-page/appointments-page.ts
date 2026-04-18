import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { ToastService } from '../../../core/services/toast';
import { todayLocalYmd } from '../../../core/utils/local-date';
import { WorkflowStatusBadgePipe } from '../../../shared/pipes/status-badge.pipe';
import { SpeechInput } from '../../../ui-kit/speech-input/speech-input';
import { Pagination } from '../../../ui-kit/pagination/pagination';

type Center = { id: number; name: string; city: string; hospital_name?: string };
type Appointment = {
  id: number;
  appointment_date: string;
  token_number: number;
  status: string;
  patient_name?: string | null;
  patient_cnic?: string | null;
  center_name?: string | null;
  department_name?: string | null;
};

/** Matches `POST /public/cnic-extract` (same as mobile `extractCnicViaBackend`). */
type CnicExtractApiResponse = {
  cnic: string | null;
  first_name: string | null;
  last_name: string | null;
  father_name: string | null;
  gender: string | null;
  date_of_birth: string | null;
  name_confidence: 'high' | 'medium' | 'low';
};

const VISION_EXTRACT_TIMEOUT_MS = 120_000;

@Component({
  selector: 'app-appointments-page',
  imports: [CommonModule, FormsModule, SpeechInput, WorkflowStatusBadgePipe, Pagination],
  templateUrl: './appointments-page.html',
  styleUrl: './appointments-page.scss',
})
export class AppointmentsPage implements OnInit {
  centers: Center[] = [];
  rows: Appointment[] = [];
  page = 1;
  pageSize = 15;

  centerId: number | '' = '';
  date = todayLocalYmd();
  status = '';

  creatingWalkIn = false;
  busy = false;
  /** AI + OCR pipeline on CNIC photo — separate from list loading. */
  walkInCnicProcessing = false;
  /** Shown on preview overlay: AI phase vs OCR fallback. */
  walkInScanMessage = '';
  /** Saving walk-in token — separate so the table does not flash “Loading…”. */
  walkInSaving = false;
  error = '';

  /** Object URL for CNIC scan preview (revoked on clear / close). */
  walkInCnicPreviewUrl: string | null = null;
  private walkInPreviewRevokeUrl?: string;

  walkIn = {
    center_id: '' as number | '',
    appointment_date: todayLocalYmd(),
    cnic: '',
    first_name: '',
    last_name: '',
  };

  constructor(
    private readonly api: ApiService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

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
    await Promise.allSettled([this.loadCenters(), this.loadAppointments()]);
  }

  openWalkInModal(): void {
    this.clearWalkInCnicPreview();
    this.walkInScanMessage = '';
    this.creatingWalkIn = true;
  }

  async loadCenters(): Promise<void> {
    try {
      this.centers = await this.api.get<Center[]>('/centers');
      if (!this.centers.length) this.centers = await this.api.get<Center[]>('/public/centers');
      if (this.walkIn.center_id === '' && this.centers[0]) this.walkIn.center_id = this.centers[0].id;
    } catch (e) {
      try {
        this.centers = await this.api.get<Center[]>('/public/centers');
        if (this.walkIn.center_id === '' && this.centers[0]) this.walkIn.center_id = this.centers[0].id;
      } catch {
        this.centers = [];
        this.error = e instanceof Error ? e.message : 'Failed to load centers';
      }
    }
  }

  async loadAppointments(): Promise<void> {
    this.busy = true;
    this.error = '';
    try {
      const q = new URLSearchParams();
      if (this.centerId !== '') q.set('center_id', String(this.centerId));
      if (this.date) q.set('date', this.date);
      if (this.status) q.set('status', this.status);
      this.rows = await this.api.get<Appointment[]>(`/appointments?${q.toString()}`);
      const maxPage = Math.max(1, Math.ceil(this.rows.length / this.pageSize));
      if (this.page > maxPage) this.page = maxPage;
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load appointments';
      this.rows = [];
    } finally {
      this.busy = false;
    }
  }

  clearWalkInCnicPreview(): void {
    if (this.walkInPreviewRevokeUrl) {
      URL.revokeObjectURL(this.walkInPreviewRevokeUrl);
      this.walkInPreviewRevokeUrl = undefined;
    }
    this.walkInCnicPreviewUrl = null;
  }

  closeWalkInModal(): void {
    this.creatingWalkIn = false;
    this.walkInScanMessage = '';
    this.clearWalkInCnicPreview();
  }

  private mimeForVisionApi(file: File): 'image/jpeg' | 'image/png' | null {
    const t = file.type.toLowerCase();
    if (t === 'image/jpeg' || t === 'image/jpg') return 'image/jpeg';
    if (t === 'image/png') return 'image/png';
    // Camera/gallery on some browsers leaves MIME empty — still send bytes (usually JPEG).
    if (t === '' || t === 'application/octet-stream') {
      const n = file.name.toLowerCase();
      if (n.endsWith('.png')) return 'image/png';
      return 'image/jpeg';
    }
    return null;
  }

  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const s = String(reader.result ?? '');
        const comma = s.indexOf(',');
        resolve(comma >= 0 ? s.slice(comma + 1) : s);
      };
      reader.onerror = () => reject(reader.error ?? new Error('read failed'));
      reader.readAsDataURL(file);
    });
  }

  private formatCnicDashes13(digits: string): string {
    const d = digits.replace(/\D/g, '');
    if (d.length !== 13) return digits;
    return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
  }

  /** Apply server vision result to walk-in fields (CNIC + names when present). */
  private applyVisionToWalkIn(data: CnicExtractApiResponse): void {
    const raw = data.cnic?.replace(/\D/g, '') ?? '';
    if (raw.length === 13) {
      this.walkIn.cnic = this.formatCnicDashes13(raw);
    }
    const fn = data.first_name?.trim();
    const ln = data.last_name?.trim();
    if (fn)     this.walkIn.first_name = fn;
    if (ln) this.walkIn.last_name = ln;
  }

  /**
   * HttpClient may still deliver `{ data, message, status }` if unwrap mismatches;
   * also handles nested `data` once.
   */
  private coalesceCnicExtract(body: unknown): CnicExtractApiResponse | null {
    if (!body || typeof body !== 'object') return null;
    const o = body as Record<string, unknown>;
    const inner = o['data'];
    if (inner && typeof inner === 'object' && ('cnic' in inner || 'first_name' in inner)) {
      return this.coalesceCnicExtract(inner);
    }
    if ('cnic' in o || 'first_name' in o || 'last_name' in o) {
      return {
        cnic: (o['cnic'] as string | null) ?? null,
        first_name: (o['first_name'] as string | null) ?? null,
        last_name: (o['last_name'] as string | null) ?? null,
        father_name: (o['father_name'] as string | null) ?? null,
        gender: (o['gender'] as string | null) ?? null,
        date_of_birth: (o['date_of_birth'] as string | null) ?? null,
        name_confidence: (o['name_confidence'] as CnicExtractApiResponse['name_confidence']) ?? 'medium',
      };
    }
    return null;
  }

  /**
   * Primary: `POST /public/cnic-extract` (OpenAI on backend when `OPENAI_API_KEY` is set).
   * Fallback: Tesseract in the browser (same role as on-device OCR on mobile).
   */
  async onWalkInCnicPhoto(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !file.type.startsWith('image/')) return;

    this.clearWalkInCnicPreview();
    const url = URL.createObjectURL(file);
    this.walkInPreviewRevokeUrl = url;
    this.walkInCnicPreviewUrl = url;

    this.walkInCnicProcessing = true;
    this.walkInScanMessage = '';

    const mime = this.mimeForVisionApi(file);
    let cnicFromVision = false;

    if (mime) {
      this.walkInScanMessage = 'Scanning with AI…';
      try {
        const image_base64 = await this.fileToBase64(file);
        const raw = await this.api.post<unknown>(
          '/public/cnic-extract',
          { image_base64, mime_type: mime },
          VISION_EXTRACT_TIMEOUT_MS,
        );
        const data = this.coalesceCnicExtract(raw);
        if (data) {
          this.applyVisionToWalkIn(data);
          const d = data.cnic?.replace(/\D/g, '') ?? '';
          if (d.length === 13) cnicFromVision = true;
          this.cdr.detectChanges();
          this.toast.success('CNIC details filled from scan — review and tap Create token.');
        }
      } catch {
        /* Same as mobile: missing API key (503), model errors (502), etc. → OCR fallback, no toast here. */
      }
    }

    if (!cnicFromVision) {
      this.walkInScanMessage = 'Reading CNIC (OCR)…';
      await this.runTesseractCnic(file);
    }

    this.walkInCnicProcessing = false;
    this.walkInScanMessage = '';
    this.cdr.detectChanges();
  }

  private async runTesseractCnic(file: File): Promise<void> {
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      const {
        data: { text },
      } = await worker.recognize(file);
      await worker.terminate();
      const digits = text.replace(/\D/g, '');
      const m = digits.match(/(\d{13})/);
      if (m) {
        const raw = m[1];
        this.walkIn.cnic = `${raw.slice(0, 5)}-${raw.slice(5, 12)}-${raw.slice(12)}`;
        this.cdr.detectChanges();
      } else {
        this.toast.error('Could not read CNIC from image. Enter manually.');
      }
    } catch {
      this.toast.error('OCR failed. Enter details manually.');
    }
  }

  async createWalkIn(): Promise<void> {
    if (this.walkIn.center_id === '' || !this.walkIn.first_name.trim() || !this.walkIn.cnic.trim()) {
      this.error = 'Center, CNIC and first name are required for walk-in token.';
      this.toast.error(this.error);
      return;
    }
    this.walkInSaving = true;
    this.error = '';
    try {
      await this.api.post('/appointments/walk-in', {
        center_id: Number(this.walkIn.center_id),
        appointment_date: this.walkIn.appointment_date,
        patient: {
          cnic: this.walkIn.cnic.trim(),
          first_name: this.walkIn.first_name.trim(),
          last_name: this.walkIn.last_name.trim() || null,
        },
      });
      this.closeWalkInModal();
      this.walkIn.cnic = '';
      this.walkIn.first_name = '';
      this.walkIn.last_name = '';
      this.page = 1;
      await this.loadAppointments();
      this.toast.success('Walk-in token created.');
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
