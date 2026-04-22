import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard';
import { LoginPage } from './features/auth/login-page/login-page';
import { WaitingBoardPage } from './features/display/waiting-board-page/waiting-board-page';
import { AppShell } from './layout/app-shell/app-shell';
import { DashboardHome } from './features/dashboard/dashboard-home/dashboard-home';
import { AppointmentsPage } from './features/appointments/appointments-page/appointments-page';
import { ReportsPage } from './features/reports/reports-page/reports-page';
import { RegistrationPage } from './features/reception/registration-page/registration-page';
import { PreAssessmentPage } from './features/reception/pre-assessment-page/pre-assessment-page';
import { ConsultationPage } from './features/consultation/consultation-page/consultation-page';
import { LaboratoryPage } from './features/laboratory/laboratory-page/laboratory-page';
import { RadiologyPage } from './features/radiology/radiology-page/radiology-page';
import { QueuePage } from './features/queue/queue-page/queue-page';
import { HospitalsPage } from './features/admin/hospitals-page/hospitals-page';
import { CentersPage } from './features/admin/centers-page/centers-page';
import { OpdsPage } from './features/admin/opds-page/opds-page';
import { ClinicsPage } from './features/admin/clinics-page/clinics-page';
import { PatientsListPage } from './features/admin/patients-list-page/patients-list-page';
import { PatientDetailPage } from './features/admin/patient-detail-page/patient-detail-page';
import { UsersPage } from './features/admin/users-page/users-page';
import { RolesPage } from './features/admin/roles-page/roles-page';

export const routes: Routes = [
  { path: 'login', component: LoginPage },
  { path: 'display/waiting', component: WaitingBoardPage },
  {
    path: 'app',
    component: AppShell,
    canActivate: [authGuard],
    children: [
      { path: '', component: DashboardHome },
      { path: 'appointments', component: AppointmentsPage },
      { path: 'reports', component: ReportsPage },
      { path: 'registration', component: RegistrationPage },
      { path: 'waiting-area', component: PreAssessmentPage },
      { path: 'pre-assessment', redirectTo: 'waiting-area', pathMatch: 'full' },
      { path: 'consultation', component: ConsultationPage },
      { path: 'laboratory', component: LaboratoryPage },
      { path: 'radiology', component: RadiologyPage },
      { path: 'queue', component: QueuePage },
      { path: 'hospitals', component: HospitalsPage },
      { path: 'centers', component: CentersPage },
      { path: 'opds', component: OpdsPage },
      { path: 'clinics', component: ClinicsPage },
      { path: 'patients', component: PatientsListPage },
      { path: 'patients/:patientId', component: PatientDetailPage },
      { path: 'users', component: UsersPage },
      { path: 'roles', component: RolesPage },
    ],
  },
  { path: '', redirectTo: '/app', pathMatch: 'full' },
  { path: '**', redirectTo: '/app' },
];
