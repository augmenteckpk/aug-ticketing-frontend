import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api';
import { EntityStatusBadgePipe, WorkflowStatusBadgePipe } from '../../../shared/pipes/status-badge.pipe';

export type PatientDetail = {
  id: number;
  cnic: string;
  identifier_kind?: string | null;
  escort_relationship?: string | null;
  first_name: string;
  last_name?: string | null;
  first_name_ur?: string | null;
  last_name_ur?: string | null;
  father_name?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  medical_record_number?: string | null;
  preferred_language?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AppointmentRow = {
  id: number;
  patient_id: number;
  center_id: number;
  appointment_date: string;
  token_number: number;
  status: string;
  location?: string | null;
  visit_barcode?: string | null;
  notes?: string | null;
  consultation_outcome?: string | null;
  follow_up_advised_date?: string | null;
  hospital_name?: string | null;
  center_name?: string | null;
  center_city?: string | null;
  opd_display_code?: string | null;
  opd_name?: string | null;
  clinic_name?: string | null;
  registered_at?: string | null;
  checked_in_at?: string | null;
  pre_assessed_at?: string | null;
  created_at?: string | null;
};

@Component({
  selector: 'app-patient-detail-page',
  imports: [CommonModule, RouterLink, EntityStatusBadgePipe, WorkflowStatusBadgePipe],
  templateUrl: './patient-detail-page.html',
  styleUrl: './patient-detail-page.scss',
})
export class PatientDetailPage implements OnInit {
  loading = true;
  error = '';
  patient: PatientDetail | null = null;
  appointments: AppointmentRow[] = [];
  appointmentsError = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly api: ApiService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    const patientId = Number(this.route.snapshot.paramMap.get('patientId'));
    if (!Number.isFinite(patientId) || patientId <= 0) {
      this.error = 'Invalid patient id';
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    this.loading = true;
    this.error = '';
    this.appointmentsError = '';
    try {
      const [p, appts] = await Promise.all([
        this.api.get<PatientDetail>(`/patients/${patientId}`, 15000),
        this.api.get<AppointmentRow[]>(`/appointments?patient_id=${patientId}`, 15000).catch((e) => {
          this.appointmentsError = e instanceof Error ? e.message : 'Could not load visits';
          return [] as AppointmentRow[];
        }),
      ]);
      this.patient = p;
      this.appointments = this.sortAppointments(appts);
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load patient';
      this.patient = null;
      this.appointments = [];
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  sortAppointments(rows: AppointmentRow[]): AppointmentRow[] {
    return [...rows].sort((a, b) => {
      const da = String(a.appointment_date ?? '').slice(0, 10);
      const db = String(b.appointment_date ?? '').slice(0, 10);
      if (da !== db) return db.localeCompare(da);
      return b.id - a.id;
    });
  }

  display(value: string | null | undefined): string {
    if (value === null || value === undefined) return '—';
    const s = String(value).replace(/\uFFFD/g, '').trim();
    return s.length ? s : '—';
  }

  dateOnly(value: string | null | undefined): string {
    if (!value) return '—';
    const s = String(value);
    return s.length >= 10 ? s.slice(0, 10) : s;
  }

  dateTime(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
  }

  identifierKindCaption(kind: string | null | undefined): string {
    switch (kind) {
      case 'minor_father_cnic':
        return 'Minor: the CNIC above is the father’s (the patient record is the child).';
      case 'minor_mother_cnic':
        return 'Minor: the CNIC above is the mother’s (the patient record is the child).';
      case 'relative_escort': {
        const rel = (this.patient?.escort_relationship ?? '').trim();
        return rel
          ? `Relative/escort CNIC (${rel}); demographics are the patient’s.`
          : 'Relative/escort CNIC; demographics are the patient’s.';
      }
      default:
        return String(kind ?? '');
    }
  }
}
