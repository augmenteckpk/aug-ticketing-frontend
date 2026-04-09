import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../../core/services/api';

type Patient = {
  id: number;
  cnic: string;
  first_name: string;
  last_name?: string | null;
  father_name?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  phone?: string | null;
  address?: string | null;
  status?: string | null;
};

@Component({
  selector: 'app-patient-detail-page',
  imports: [CommonModule],
  templateUrl: './patient-detail-page.html',
  styleUrl: './patient-detail-page.scss',
})
export class PatientDetailPage implements OnInit {
  loading = true;
  error = '';
  patient: Patient | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly api: ApiService,
  ) {}

  async ngOnInit(): Promise<void> {
    const patientId = Number(this.route.snapshot.paramMap.get('patientId'));
    if (!Number.isFinite(patientId) || patientId <= 0) {
      this.error = 'Invalid patient id';
      this.loading = false;
      return;
    }

    this.loading = true;
    this.error = '';
    try {
      this.patient = await this.api.get<Patient>(`/patients/${patientId}`);
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load patient';
      this.patient = null;
    } finally {
      this.loading = false;
    }
  }
}
