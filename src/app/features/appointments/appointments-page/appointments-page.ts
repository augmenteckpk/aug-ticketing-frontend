import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { ToastService } from '../../../core/services/toast';
import { SpeechInput } from '../../../ui-kit/speech-input/speech-input';

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

@Component({
  selector: 'app-appointments-page',
  imports: [CommonModule, FormsModule, SpeechInput],
  templateUrl: './appointments-page.html',
  styleUrl: './appointments-page.scss',
})
export class AppointmentsPage implements OnInit {
  centers: Center[] = [];
  rows: Appointment[] = [];

  centerId: number | '' = '';
  date = new Date().toISOString().slice(0, 10);
  status = '';

  creatingWalkIn = false;
  busy = false;
  error = '';

  walkIn = {
    center_id: '' as number | '',
    appointment_date: new Date().toISOString().slice(0, 10),
    cnic: '',
    first_name: '',
    last_name: '',
  };

  constructor(
    private readonly api: ApiService,
    private readonly toast: ToastService,
  ) {}

  async ngOnInit(): Promise<void> {
    await Promise.allSettled([this.loadCenters(), this.loadAppointments()]);
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
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load appointments';
      this.rows = [];
    } finally {
      this.busy = false;
    }
  }

  async createWalkIn(): Promise<void> {
    if (this.walkIn.center_id === '' || !this.walkIn.first_name.trim() || !this.walkIn.cnic.trim()) {
      this.error = 'Center, CNIC and first name are required for walk-in token.';
      this.toast.error(this.error);
      return;
    }
    this.busy = true;
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
      this.creatingWalkIn = false;
      this.walkIn.cnic = '';
      this.walkIn.first_name = '';
      this.walkIn.last_name = '';
      await this.loadAppointments();
      this.toast.success('Walk-in token created.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not create walk-in appointment';
      this.toast.error(this.error);
    } finally {
      this.busy = false;
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
