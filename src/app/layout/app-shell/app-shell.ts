import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth';
import { StaffNotificationsService } from '../../core/services/staff-notifications';

type NavItem = { to: string; label: string; icon: string; perm?: string };

type NavSection = { title: string; items: NavItem[] };

/** Viewports at or below this width use overlay nav + hamburger (tablet & phone). */
const COMPACT_MAX = '(max-width: 1023.98px)';

@Component({
  selector: 'app-app-shell',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  readonly auth = inject(AuthService);
  readonly notifications = inject(StaffNotificationsService);
  private readonly router = inject(Router);
  private readonly breakpoint = inject(BreakpointObserver);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);

  /** When true, sidebar is off-canvas until opened via menu. */
  readonly isCompact = toSignal(
    this.breakpoint.observe(COMPACT_MAX).pipe(map((r) => r.matches)),
    {
      initialValue:
        typeof globalThis !== 'undefined' &&
        'matchMedia' in globalThis &&
        globalThis.matchMedia(COMPACT_MAX).matches,
    },
  );

  readonly navOpen = signal(false);

  constructor() {
    effect(() => {
      if (!this.isCompact()) this.navOpen.set(false);
    });

    effect(() => {
      const body = this.document.body;
      if (this.isCompact() && this.navOpen()) body.style.setProperty('overflow', 'hidden');
      else body.style.removeProperty('overflow');
    });

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        if (this.isCompact()) this.navOpen.set(false);
      });
  }

  toggleNav(): void {
    this.navOpen.update((v) => !v);
  }

  closeNav(): void {
    this.navOpen.set(false);
  }

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
        { to: '/app/opds', label: 'OPDs', icon: 'meeting_room', perm: 'opds.read' },
        { to: '/app/clinics', label: 'Clinics', icon: 'medical_services', perm: 'opds.read' },
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

  toggleNotifications(event: Event): void {
    event.stopPropagation();
    this.notifications.togglePanel();
  }

  closeNotificationPanel(): void {
    this.notifications.closePanel();
  }
}
