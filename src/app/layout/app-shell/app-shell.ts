import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth';

type NavItem = { to: string; label: string; icon: string; perm?: string };

type NavSection = { title: string; items: NavItem[] };

@Component({
  selector: 'app-app-shell',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly sections: NavSection[] = [
    {
      title: 'Overview',
      items: [
        { to: '/app', label: 'Dashboard', icon: 'dashboard', perm: 'dashboard.read' },
        { to: '/app/reports', label: 'Reporting', icon: 'monitoring', perm: 'reports.read' },
      ],
    },
    {
      title: 'OPD workflow',
      items: [
        { to: '/app/appointments', label: 'Tokens & appointments', icon: 'event_available', perm: 'appointments.read' },
        { to: '/app/registration', label: 'Registration desk', icon: 'fact_check', perm: 'appointments.register' },
        { to: '/app/waiting-area', label: 'Waiting area', icon: 'health_and_safety', perm: 'appointments.pre_assessment' },
        { to: '/app/queue', label: 'Queue & batches', icon: 'view_kanban', perm: 'queue.read' },
        { to: '/app/consultation', label: 'Consultation', icon: 'local_hospital', perm: 'appointments.consult' },
        { to: '/app/laboratory', label: 'Laboratory', icon: 'biotech', perm: 'lab.read' },
        { to: '/app/radiology', label: 'Radiology', icon: 'imagesearch_roller', perm: 'radiology.read' },
      ],
    },
    {
      title: 'Administration',
      items: [
        { to: '/app/hospitals', label: 'Hospitals', icon: 'local_hospital', perm: 'hospitals.read' },
        { to: '/app/centers', label: 'Centers', icon: 'location_on', perm: 'centers.read' },
        { to: '/app/departments', label: 'Departments', icon: 'account_tree', perm: 'departments.read' },
        { to: '/app/clinics', label: 'Clinics / OPDs', icon: 'medical_services', perm: 'departments.read' },
        { to: '/app/patients', label: 'Patients', icon: 'badge', perm: 'patients.read' },
        { to: '/app/users', label: 'Users', icon: 'groups', perm: 'users.manage' },
        { to: '/app/roles', label: 'Roles & permissions', icon: 'verified_user', perm: 'roles.read' },
      ],
    },
  ];

  readonly user = computed(() => this.auth.user());
  readonly formattedRole = computed(() => {
    const role = this.user()?.role ?? 'staff';
    return role.replace(/_/g, ' ');
  });
  readonly visibleSections = computed(() =>
    this.sections
      .map((section) => ({ ...section, items: section.items.filter((item) => !item.perm || this.auth.can(item.perm)) }))
      .filter((s) => s.items.length > 0),
  );

  async logout(): Promise<void> {
    this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
