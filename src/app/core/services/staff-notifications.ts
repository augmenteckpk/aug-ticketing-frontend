import { Injectable, NgZone, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, getToken } from './api';
import { AuthService } from './auth';
import { ToastService } from './toast';
import { resolveApiBaseUrl } from '../../../environments/api-base';

export type StaffNotification = {
  id: number;
  kind: string;
  title: string;
  body: string;
  appointment_id: number | null;
  link_path: string | null;
  read: boolean;
  created_at: string;
};

type SsePayload =
  | { type: 'connected'; user_id: number }
  | { type: 'notification'; notification: StaffNotification };

@Injectable({ providedIn: 'root' })
export class StaffNotificationsService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);

  /** Recent notifications (newest first). */
  readonly items = signal<StaffNotification[]>([]);
  readonly unreadCount = signal(0);
  readonly panelOpen = signal(false);

  private es: EventSource | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private activeUserId: number | null = null;

  constructor() {
    effect(() => {
      const u = this.auth.user();
      if (!u || !this.auth.can('dashboard.read')) {
        this.teardown();
        return;
      }
      if (this.activeUserId === u.id) return;
      this.teardown();
      this.activeUserId = u.id;
      void this.start();
    });
  }

  togglePanel(): void {
    this.panelOpen.update((o) => !o);
    if (this.panelOpen()) {
      void this.loadList();
      void this.refreshUnread();
    }
  }

  closePanel(): void {
    this.panelOpen.set(false);
  }

  async markAllRead(): Promise<void> {
    try {
      await this.api.patch<{ updated: number }>('/notifications/mark-all-read', {});
      this.items.update((list) => list.map((n) => ({ ...n, read: true })));
      this.unreadCount.set(0);
    } catch {
      /* non-fatal */
    }
  }

  async openNotification(n: StaffNotification): Promise<void> {
    if (!n.read) {
      try {
        await this.api.patch<{ ok: boolean }>(`/notifications/${n.id}/read`, {});
        this.items.update((list) =>
          list.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
        );
        this.unreadCount.update((c) => Math.max(0, c - 1));
      } catch {
        /* still navigate */
      }
    }
    const path =
      n.link_path && n.link_path.startsWith('/') ? n.link_path : '/app';
    await this.router.navigateByUrl(path);
    this.closePanel();
  }

  private teardown(): void {
    this.activeUserId = null;
    this.es?.close();
    this.es = null;
    if (this.pollTimer != null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.items.set([]);
    this.unreadCount.set(0);
    this.panelOpen.set(false);
  }

  private async start(): Promise<void> {
    await this.loadList();
    await this.refreshUnread();
    this.connectSse();
    this.pollTimer = setInterval(() => {
      void this.refreshUnread();
    }, 45000);
  }

  private async loadList(): Promise<void> {
    try {
      const res = await this.api.get<{ items: StaffNotification[] }>('/notifications?limit=50', 15000);
      this.items.set(res.items ?? []);
    } catch {
      this.items.set([]);
    }
  }

  private async refreshUnread(): Promise<void> {
    try {
      const res = await this.api.get<{ count: number }>('/notifications/unread-count', 8000);
      this.unreadCount.set(typeof res.count === 'number' ? res.count : 0);
    } catch {
      /* keep previous */
    }
  }

  private connectSse(): void {
    const token = getToken();
    if (!token) return;
    const base = resolveApiBaseUrl();
    const url = `${base}/api/v1/notifications/stream?access_token=${encodeURIComponent(token)}`;
    this.es?.close();
    this.es = new EventSource(url);

    this.es.onmessage = (ev: MessageEvent<string>) => {
      this.zone.run(() => this.handleSseData(ev.data));
    };

    this.es.onerror = () => {
      /* EventSource auto-reconnects; still refresh unread occasionally */
      void this.refreshUnread();
    };
  }

  private handleSseData(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return;
    }
    const p = parsed as SsePayload;
    if (p.type === 'notification' && p.notification) {
      this.ingestPush(p.notification);
    }
  }

  private ingestPush(n: StaffNotification): void {
    const snippet =
      n.body.length > 100 ? `${n.body.slice(0, 97)}…` : n.body;
    this.toast.info(`${n.title} — ${snippet}`);

    this.items.update((list) => {
      if (list.some((x) => x.id === n.id)) return list;
      return [n, ...list].slice(0, 100);
    });

    if (!n.read) {
      void this.refreshUnread();
    }
  }
}
