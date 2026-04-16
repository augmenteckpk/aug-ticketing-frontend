import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { ConfirmService } from '../../../core/services/confirm';
import { ToastService } from '../../../core/services/toast';
import { Pagination } from '../../../ui-kit/pagination/pagination';
import { EntityStatusBadgePipe } from '../../../shared/pipes/status-badge.pipe';
import { SpeechInput } from '../../../ui-kit/speech-input/speech-input';

type UserRow = { id: number; username: string; email?: string | null; phone?: string | null; role: string; status: string };
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
  loading = false;
  saving = false;
  error = '';

  form = { username: '', password: '', email: '', phone: '', role_name: '' };
  editing: UserRow | null = null;
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
  ) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const [usersRes, rolesRes] = await Promise.allSettled([
        this.api.get<UserRow[]>('/users'),
        this.api.get<RoleRow[]>('/rbac/roles'),
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
    }
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
      await this.api.post('/users', {
        username: this.form.username.trim(),
        password: this.form.password,
        email: this.form.email.trim() || null,
        phone: this.form.phone.trim() || null,
        role_name: this.form.role_name,
      });
      this.form.username = '';
      this.form.password = '';
      this.form.email = '';
      this.form.phone = '';
      this.creating = false;
      await this.load();
      this.toast.success('User created successfully.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not create user';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
    }
  }

  async saveEdit(): Promise<void> {
    if (!this.editing) return;
    this.saving = true;
    try {
      await this.api.patch(`/users/${this.editing.id}`, {
        email: this.editing.email || null,
        phone: this.editing.phone || null,
        role_name: this.editing.role,
        status: this.editing.status,
      });
      this.editing = null;
      await this.load();
      this.toast.success('User updated successfully.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not update user';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
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
    }
  }
}
