import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { ConfirmService } from '../../../core/services/confirm';
import { ToastService } from '../../../core/services/toast';
import { Pagination } from '../../../ui-kit/pagination/pagination';
import { SpeechInput } from '../../../ui-kit/speech-input/speech-input';

type RoleRow = { id: number; name: string; description?: string | null; permissions?: string[] };
type PermissionRow = { id: number; name: string; module: string };
type RoleEdit = RoleRow & { selectedPermissions: string[] };

@Component({
  selector: 'app-roles-page',
  imports: [CommonModule, FormsModule, Pagination, SpeechInput],
  templateUrl: './roles-page.html',
  styleUrl: './roles-page.scss',
})
export class RolesPage implements OnInit {
  /** Table column: show this many permission badges, then "+ N more". */
  readonly permPreviewMax = 3;

  rows: RoleRow[] = [];
  permissions: PermissionRow[] = [];
  /** True until first load completes — avoids empty table + matches sidebar/async CD pattern. */
  loading = true;
  saving = false;
  error = '';

  form = { name: '', description: '', selectedPermissions: [] as string[] };
  editing: RoleEdit | null = null;
  creating = false;
  page = 1;
  pageSize = 10;

  constructor(
    private readonly api: ApiService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  get availablePermissionNames(): string {
    return this.permissions.map((p) => p.name).join(', ');
  }

  get permissionNames(): string[] {
    return this.permissions.map((p) => p.name);
  }

  get permissionsByModule(): Array<{ module: string; names: string[] }> {
    const grouped = new Map<string, string[]>();
    for (const p of this.permissions) {
      const key = p.module || 'General';
      const list = grouped.get(key) || [];
      list.push(p.name);
      grouped.set(key, list);
    }
    return Array.from(grouped.entries())
      .map(([module, names]) => ({ module, names: names.sort((a, b) => a.localeCompare(b)) }))
      .sort((a, b) => a.module.localeCompare(b.module));
  }

  get paged(): RoleRow[] {
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

  async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const reqMs = 20000;
      const [rolesRes, permsRes] = await Promise.allSettled([
        this.api.get<RoleRow[]>('/rbac/roles', reqMs),
        this.api.get<PermissionRow[]>('/rbac/permissions', reqMs),
      ]);
      if (rolesRes.status === 'fulfilled') {
        this.rows = rolesRes.value;
      } else {
        throw rolesRes.reason;
      }
      this.permissions = permsRes.status === 'fulfilled' ? permsRes.value : [];
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load roles';
      this.rows = [];
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async create(): Promise<void> {
    if (!this.form.name.trim()) {
      this.toast.error('Role name is required.');
      return;
    }
    this.saving = true;
    try {
      await this.api.post('/rbac/roles', {
        name: this.form.name.trim(),
        description: this.form.description.trim() || null,
        permissions: this.form.selectedPermissions,
      });
      this.form = { name: '', description: '', selectedPermissions: [] };
      this.creating = false;
      await this.load();
      this.toast.success('Role created.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not create role';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  startEdit(r: RoleRow): void {
    this.editing = {
      ...r,
      selectedPermissions: [...(r.permissions ?? [])],
    };
  }

  async saveEdit(): Promise<void> {
    if (!this.editing) return;
    this.saving = true;
    try {
      await this.api.patch(`/rbac/roles/${this.editing.id}`, {
        name: this.editing.name,
        description: this.editing.description || null,
        permissions: this.editing.selectedPermissions,
      });
      this.editing = null;
      await this.load();
      this.toast.success('Role updated.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not update role';
      this.toast.error(this.error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async remove(r: RoleRow): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Delete role',
      message: `Delete role "${r.name}"?`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.request(`/rbac/roles/${r.id}`, { method: 'DELETE' });
      await this.load();
      this.toast.success('Role deleted.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not delete role';
      this.toast.error(this.error);
    } finally {
      this.cdr.detectChanges();
    }
  }

  toggleCreatePermission(name: string, checked: boolean): void {
    const set = new Set(this.form.selectedPermissions);
    if (checked) set.add(name);
    else set.delete(name);
    this.form.selectedPermissions = Array.from(set);
  }

  toggleEditPermission(name: string, checked: boolean): void {
    if (!this.editing) return;
    const set = new Set(this.editing.selectedPermissions);
    if (checked) set.add(name);
    else set.delete(name);
    this.editing.selectedPermissions = Array.from(set);
  }

  selectAllCreatePermissions(): void {
    this.form.selectedPermissions = [...this.permissionNames];
  }

  clearCreatePermissions(): void {
    this.form.selectedPermissions = [];
  }

  selectAllEditPermissions(): void {
    if (!this.editing) return;
    this.editing.selectedPermissions = [...this.permissionNames];
  }

  clearEditPermissions(): void {
    if (!this.editing) return;
    this.editing.selectedPermissions = [];
  }

  rolePermVisible(perms?: string[] | null): string[] {
    return (perms ?? []).slice(0, this.permPreviewMax);
  }

  rolePermHiddenCount(perms?: string[] | null): number {
    const n = (perms ?? []).length;
    return Math.max(0, n - this.permPreviewMax);
  }

  /** Tooltip: full permission list (comma-separated). */
  rolePermFullTitle(perms?: string[] | null): string {
    const list = perms ?? [];
    return list.length ? list.join(', ') : '';
  }
}
