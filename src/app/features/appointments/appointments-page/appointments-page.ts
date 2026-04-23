import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { ApiService } from '../../../core/services/api';
import { AuthService } from '../../../core/services/auth';
import { ToastService } from '../../../core/services/toast';
import { centerIdFromOpd, consoleIsAdmin, listCenterIdForRequest, listDateForRequest } from '../../../core/utils/listing-scope';
import { todayLocalYmd } from '../../../core/utils/local-date';
import { WorkflowStatusBadgePipe } from '../../../shared/pipes/status-badge.pipe';
import { SpeechInput } from '../../../ui-kit/speech-input/speech-input';
import { Pagination } from '../../../ui-kit/pagination/pagination';

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
  };

  /** Roster for selected center + walk-in date (weekday-filtered clinics). */
  walkInBooking: OpdBookingOptionsResponse | null = null;
  walkInBookingLoading = false;

  private readonly walkInPrefill$ = new Subject<void>();
  private walkInPrefillSub?: Subscription;

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
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
  }

  /** Debounced: when CNIC (+ kind / DOB rules) match an existing chart, fill name and DOB automatically. */
  scheduleWalkInPatientPrefill(): void {
    this.walkInPrefill$.next();
  }

  onWalkInIdentifierKindChanged(): void {
    if (this.walkIn.identifier_kind !== 'own') {
      this.walkIn.first_name = '';
      this.walkIn.last_name = '';
      this.walkIn.date_of_birth = '';
    }
    this.scheduleWalkInPatientPrefill();
  }

  async openWalkInModal(): Promise<void> {
    this.walkIn.identifier_kind = 'own';
    this.walkIn.escort_relationship = '';
    this.walkIn.date_of_birth = '';
    this.walkIn.opd_id = '';
    this.walkIn.clinic_id = '';
    this.walkInBooking = null;
    this.walkIn.appointment_date = listDateForRequest(this.auth.user(), this.walkIn.appointment_date);
    const wc = listCenterIdForRequest(this.auth.user(), this.walkIn.center_id);
    if (wc !== '') this.walkIn.center_id = wc;
    this.creatingWalkIn = true;
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
    this.busy = true;
    this.error = '';
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

  closeWalkInModal(): void {
    this.creatingWalkIn = false;
    this.walkInBooking = null;
  }

  private async prefillWalkInFromServer(): Promise<void> {
    if (!this.creatingWalkIn) return;
    const digits = this.walkIn.cnic.replace(/\D/g, '');
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
          cnic: this.walkIn.cnic.trim(),
          identifier_kind: this.walkIn.identifier_kind,
          escort_relationship:
            this.walkIn.identifier_kind === 'relative_escort'
              ? this.walkIn.escort_relationship.trim().slice(0, 50) || null
              : null,
          first_name: this.walkIn.first_name.trim(),
          last_name: this.walkIn.last_name.trim() || null,
          date_of_birth: dob,
        },
      });
      if (created.walk_in_notices?.length) {
        for (const line of created.walk_in_notices) {
          this.toast.info(line);
        }
      }
      this.closeWalkInModal();
      this.walkIn.cnic = '';
      this.walkIn.identifier_kind = 'own';
      this.walkIn.escort_relationship = '';
      this.walkIn.date_of_birth = '';
      this.walkIn.first_name = '';
      this.walkIn.last_name = '';
      this.walkIn.opd_id = '';
      this.walkIn.clinic_id = '';
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
