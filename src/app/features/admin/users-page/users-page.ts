import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { ConfirmService } from '../../../core/services/confirm';
import { ToastService } from '../../../core/services/toast';
import { Pagination } from '../../../ui-kit/pagination/pagination';
import { EntityStatusBadgePipe } from '../../../shared/pipes/status-badge.pipe';
import { SpeechInput } from '../../../ui-kit/speech-input/speech-input';

type OpdOption = {
  id: number;
  name: string;
  display_code: string;
  center_id: number;
  center_label: string;
  sort_order: number;
};

type UserRow = {
  id: number;
  username: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  status: string;
  opd_id: number | null;
  opd_name?: string | null;
  opd_display_code?: string | null;
};
type RoleRow = { id: number; name: string };

@Component({
  selector: 'app-users-page',
  imports: [CommonModule, FormsModule, Pagination, SpeechInput, EntityStatusBadgePipe],
  templateUrl: './users-page.html',
  styleUrl: './users-page.scss',
})
export class UsersPage implements OnInit {
  rows: UserRow[] = [];
  roles: RoleRow[] = [];
  opdOptions: OpdOption[] = [];
  loading = false;
  saving = false;
  error = '';

  form = { username: '', password: '', email: '', phone: '', role_name: '', opd_id: '' as number | '' };
  editing: UserRow | null = null;
  /** Edit modal: OPD pick uses same shape as create; `''` = unassigned. */
  editOpdId: number | '' = '';
  creating = false;
  page = 1;
  pageSize = 10;

  get paged(): UserRow[] {
    const start = (this.page - 1) * this.pageSize;
    return this.rows.slice(start, start + this.pageSize);
  }

  setPage(page: number): void {
    this.page = page;
  }

  setPageSize(size: number): void {
    this.pageSize = size;
    this.page = 1;
  }

  constructor(
    private readonly api: ApiService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  opdLabel(u: UserRow): string {
    if (u.opd_display_code || u.opd_name) {
      const code = u.opd_display_code ? `${u.opd_display_code} · ` : '';
      return `${code}${u.opd_name ?? '—'}`;
    }
    return '—';
  }

  showOpdForRole(roleName: string): boolean {
    return roleName !== '' && roleName !== 'admin';
  }

  async ngOnInit(): Promise<void> {
    await this.loadOpdOptions();
    await this.load();
  }

  private async loadOpdOptions(): Promise<void> {
    try {
      this.opdOptions = await this.api.get<OpdOption[]>('/public/opds');
    } catch {
      this.opdOptions = [];
    }
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const reqMs = 20000;
      const [usersRes, rolesRes] = await Promise.allSettled([
        this.api.get<UserRow[]>('/users', reqMs),
        this.api.get<RoleRow[]>('/rbac/roles', reqMs),
      ]);
      if (usersRes.status === 'fulfilled') {
        this.rows = usersRes.value.filter((u) => u.role?.toLowerCase() !== 'patient');
      } else {
        throw usersRes.reason;
      }
      if (rolesRes.status === 'fulfilled') {
        this.roles = rolesRes.value;
        if (!this.form.role_name && this.roles[0]) this.form.role_name = this.roles[0].name;
      } else {
        this.roles = [];
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load users';
      this.rows = [];
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  openEdit(u: UserRow): void {
    this.editing = { ...u };
    this.editOpdId = u.opd_id != null ? u.opd_id : '';
  }

  async create(): Promise<void> {
    if (!this.form.username.trim() || !this.form.password.trim() || !this.form.role_name) {
      this.toast.error('Username, password and role are required.');
      return;
    }
    if (this.form.password.trim().length < 8) {
      this.toast.error('Password must be at least 8 characters.');
      return;
    }
    this.saving = true;
    try {
      const body: Record<string, unknown> = {
        username: this.form.username.trim(),
        password: this.form.password,
        email: this.form.email.trim() || null,
        phone: this.form.phone.trim() || null,
        role_name: this.form.role_name,
      };
      if (this.showOpdForRole(this.form.role_name) && this.form.opd_id !== '') {
        body['opd_id'] = Number(this.form.opd_id);
      } else {
        body['opd_id'] = null;
      }
      await this.api.post('/users', body);
      this.form.username = '';
      this.form.password = '';
      this.form.email = '';
      this.form.phone = '';
      this.form.opd_id = '';
      this.creating = false;
      await this.load();
      this.toast.success('User created successfully.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not create user';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async saveEdit(): Promise<void> {
    if (!this.editing) return;
    this.saving = true;
    try {
      const patch: Record<string, unknown> = {
        email: this.editing.email || null,
        phone: this.editing.phone || null,
        role_name: this.editing.role,
        status: this.editing.status,
      };
      if (this.showOpdForRole(this.editing.role)) {
        patch['opd_id'] = this.editOpdId === '' ? null : Number(this.editOpdId);
      } else {
        patch['opd_id'] = null;
      }
      await this.api.patch(`/users/${this.editing.id}`, patch);
      this.editing = null;
      this.editOpdId = '';
      await this.load();
      this.toast.success('User updated successfully.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not update user';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async remove(row: UserRow): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Delete user',
      message: `Delete user "${row.username}"?`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.request(`/users/${row.id}`, { method: 'DELETE' });
      await this.load();
      this.toast.success('User deleted.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not delete user';
      this.toast.error(this.error);
    } finally {
      this.cdr.detectChanges();
    }
  }
}
