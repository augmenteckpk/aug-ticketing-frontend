import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { ToastService } from '../../../core/services/toast';
import { EntityStatusBadgePipe } from '../../../shared/pipes/status-badge.pipe';
import { SpeechInput } from '../../../ui-kit/speech-input/speech-input';

type Center = { id: number; name: string; hospital_name?: string; city?: string };
type Opd = {
  id: number;
  center_id: number;
  name: string;
  display_code: string;
  sort_order?: number;
  status?: string;
};
type ClinicOpt = { id: number; name: string; opd_id?: number | null; opd_display_code?: string | null };
type WeekdayClinicRow = {
  id: number;
  weekday: number;
  clinic_id: number;
  ticket_prefix: string;
  sort_order: number;
  clinic_name?: string;
};

type RosterEditorRow = {
  _key: number;
  weekday: number;
  clinic_id: number | '';
  ticket_prefix: string;
  sort_order: number;
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

@Component({
  selector: 'app-opds-page',
  imports: [CommonModule, FormsModule, SpeechInput, EntityStatusBadgePipe],
  templateUrl: './opds-page.html',
  styleUrl: './opds-page.scss',
})
export class OpdsPage implements OnInit {
  private readonly apiMs = 25000;

  centers: Center[] = [];
  centerId: number | '' = '';
  opds: Opd[] = [];
  clinicsAtCenter: ClinicOpt[] = [];

  loading = false;
  saving = false;
  error = '';

  creating = false;
  editing: Opd | null = null;

  form = {
    name: '',
    display_code: '',
    sort_order: 0,
    status: 'Active' as 'Active' | 'Inactive',
  };

  rosterOpdId: number | '' = '';
  rosterLoading = false;
  rosterRows: RosterEditorRow[] = [];
  readonly weekdayLabels = WEEKDAY_LABELS;

  constructor(
    private readonly api: ApiService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  private async fetchCentersList(ms: number): Promise<Center[]> {
    try {
      const rows = await this.api.get<Center[]>('/centers', ms);
      if (rows.length) return rows;
      return await this.api.get<Center[]>('/public/centers', ms);
    } catch (e) {
      try {
        return await this.api.get<Center[]>('/public/centers', ms);
      } catch {
        throw e;
      }
    }
  }

  async ngOnInit(): Promise<void> {
    await this.loadCenters();
    await this.refreshLists();
  }

  async loadCenters(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      this.centers = await this.fetchCentersList(this.apiMs);
      if (this.centerId === '' && this.centers[0]) this.centerId = this.centers[0].id;
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load centers';
      this.centers = [];
      this.toast.error(this.error);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async onCenterChange(): Promise<void> {
    this.rosterOpdId = '';
    this.rosterRows = [];
    await this.refreshLists();
  }

  async refreshLists(): Promise<void> {
    if (this.centerId === '') {
      this.opds = [];
      this.clinicsAtCenter = [];
      return;
    }
    const cid = Number(this.centerId);
    try {
      const [opList, clList] = await Promise.all([
        this.api.get<Opd[]>(`/opds?center_id=${cid}`, this.apiMs),
        this.api.get<ClinicOpt[]>(`/clinics/by-center?center_id=${cid}&active_only=true`, this.apiMs),
      ]);
      this.opds = Array.isArray(opList) ? opList : [];
      this.clinicsAtCenter = Array.isArray(clList) ? clList : [];
      if (this.rosterOpdId !== '' && !this.opds.some((o) => o.id === this.rosterOpdId)) {
        this.rosterOpdId = '';
        this.rosterRows = [];
      }
    } catch (e) {
      this.opds = [];
      this.clinicsAtCenter = [];
      this.toast.error(e instanceof Error ? e.message : 'Failed to load OPDs or clinics');
    }
    this.cdr.detectChanges();
  }

  resetForm(): void {
    this.form = { name: '', display_code: '', sort_order: 0, status: 'Active' };
  }

  openCreate(): void {
    this.editing = null;
    this.resetForm();
    this.creating = true;
    this.cdr.detectChanges();
  }

  openEdit(row: Opd, ev?: Event): void {
    ev?.stopPropagation();
    this.creating = false;
    const st = String(row.status ?? '').toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
    this.editing = { ...row, status: st };
    this.cdr.detectChanges();
  }

  closeCreate(): void {
    this.creating = false;
    this.cdr.detectChanges();
  }

  closeEdit(): void {
    this.editing = null;
    this.cdr.detectChanges();
  }

  async createOpd(): Promise<void> {
    if (this.centerId === '' || !this.form.name.trim() || !this.form.display_code.trim()) {
      this.toast.error('Center, name, and display code are required.');
      return;
    }
    this.saving = true;
    try {
      await this.api.post(
        '/opds',
        {
          center_id: Number(this.centerId),
          name: this.form.name.trim(),
          display_code: this.form.display_code.trim(),
          sort_order: Number(this.form.sort_order) || 0,
          status: this.form.status,
        },
        this.apiMs,
      );
      this.creating = false;
      this.resetForm();
      this.toast.success('OPD created.');
      await this.refreshLists();
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not create OPD');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async saveEdit(): Promise<void> {
    if (!this.editing) return;
    this.saving = true;
    try {
      await this.api.patch(
        `/opds/${this.editing.id}`,
        {
          name: this.editing.name.trim(),
          display_code: this.editing.display_code.trim(),
          sort_order: Number(this.editing.sort_order ?? 0),
          status: (this.editing.status === 'Inactive' ? 'Inactive' : 'Active') as 'Active' | 'Inactive',
        },
        this.apiMs,
      );
      this.closeEdit();
      this.toast.success('OPD updated.');
      await this.refreshLists();
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not update OPD');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async removeOpd(row: Opd): Promise<void> {
    if (!confirm(`Deactivate OPD “${row.display_code} — ${row.name}”?`)) return;
    this.saving = true;
    try {
      await this.api.request(`/opds/${row.id}`, { method: 'DELETE', timeoutMs: this.apiMs });
      if (this.rosterOpdId === row.id) {
        this.rosterOpdId = '';
        this.rosterRows = [];
      }
      this.toast.success('OPD removed.');
      await this.refreshLists();
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not remove OPD');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async onRosterOpdChange(): Promise<void> {
    if (this.rosterOpdId === '') {
      this.rosterRows = [];
      this.cdr.detectChanges();
      return;
    }
    await this.loadRoster(Number(this.rosterOpdId));
  }

  private mapApiRowToEditor(r: WeekdayClinicRow, i: number): RosterEditorRow {
    return {
      _key: r.id * 1000 + i,
      weekday: r.weekday,
      clinic_id: r.clinic_id,
      ticket_prefix: r.ticket_prefix,
      sort_order: r.sort_order ?? i,
    };
  }

  async loadRoster(opdId: number): Promise<void> {
    this.rosterLoading = true;
    this.rosterRows = [];
    this.cdr.detectChanges();
    try {
      const rows = await this.api.get<WeekdayClinicRow[]>(`/opds/${opdId}/weekday-clinics`, this.apiMs);
      const list = Array.isArray(rows) ? rows : [];
      this.rosterRows = list.map((r, i) => this.mapApiRowToEditor(r, i));
    } catch {
      this.rosterRows = [];
      this.toast.error('Could not load weekday roster.');
    } finally {
      this.rosterLoading = false;
      this.cdr.detectChanges();
    }
  }

  addRosterRow(): void {
    this.rosterRows.push({
      _key: Date.now(),
      weekday: 1,
      clinic_id: '',
      ticket_prefix: '',
      sort_order: this.rosterRows.length,
    });
    this.cdr.detectChanges();
  }

  removeRosterRow(key: number): void {
    this.rosterRows = this.rosterRows.filter((r) => r._key !== key);
    this.cdr.detectChanges();
  }

  clinicLabel(id: number | ''): string {
    if (id === '') return '—';
    const c = this.clinicsAtCenter.find((x) => x.id === id);
    if (!c) return `#${id}`;
    const op = c.opd_display_code ? `${c.opd_display_code} · ` : '';
    return `${op}${c.name}`;
  }

  async saveRoster(): Promise<void> {
    if (this.rosterOpdId === '') return;
    const body = this.rosterRows
      .filter((r) => r.clinic_id !== '' && r.ticket_prefix.trim())
      .map((r, i) => ({
        weekday: Number(r.weekday),
        clinic_id: Number(r.clinic_id),
        ticket_prefix: r.ticket_prefix.trim().toUpperCase(),
        sort_order: r.sort_order ?? i,
      }));
    this.saving = true;
    try {
      await this.api.request(`/opds/${Number(this.rosterOpdId)}/weekday-clinics`, {
        method: 'PUT',
        body,
        timeoutMs: this.apiMs,
      });
      this.toast.success('Weekday roster saved.');
      await this.loadRoster(Number(this.rosterOpdId));
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not save roster');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }
}
