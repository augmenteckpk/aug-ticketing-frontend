import { CommonModule } from '@angular/common';
import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { resolveApiBaseUrl } from '../../../../environments/api-base';
import { unwrapApiEnvelope } from '../../../core/services/api';
import { todayLocalYmd } from '../../../core/utils/local-date';

type PublicOpdOption = {
  id: number;
  name: string;
  display_code: string;
  center_id: number;
  center_label?: string;
};

type PublicOpdWaitingBoard = {
  opd: {
    id: number;
    name: string;
    display_code: string;
    center: { id: number; name: string; city: string; hospital_name?: string | null };
  };
  date: string;
  weekday: number;
  server_time: string;
  columns: {
    ticket_prefix: string;
    clinic_name: string | null;
    clinic_id: number;
    sort_order: number;
    tickets: { ticket_display: string; token_number: number; status: string }[];
  }[];
  meta: { refresh_hint_seconds: number; transport: string };
};

@Component({
  selector: 'app-waiting-board-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './waiting-board-page.html',
  styleUrl: './waiting-board-page.scss',
})
export class WaitingBoardPage implements OnInit, OnDestroy {
  readonly apiBase = resolveApiBaseUrl();

  /** Urdu labels — waiting-area display. */
  readonly ur = {
    /** Shown after OPD name in the main title. */
    screenTitleUr: 'او پی ڈی · انتظار کی اسکرین',
    opd: 'او پی ڈی',
    date: 'تاریخ',
    applyBookmark: 'لاگو کریں اور لنک محفوظ کریں',
    loading: 'لوڈ ہو رہا ہے…',
    liveSse: 'براہ راست (SSE)',
    polling: 'وقفے سے تازہ',
    noRoster: 'اس دن کے لیے کوئی کلینک شیڈول نہیں — ایڈمن میں او پی ڈی کا ہفتہ وار روستر سیٹ کریں۔',
    noTickets: '—',
    openControls: 'اختیارات کھولیں',
    closeControls: 'اختیارات بند کریں',
    failedLoad: 'لوڈ نہیں ہو سکا۔',
    invalidPayload: 'بورڈ کا ڈیٹا درست نہیں۔',
    localTime: 'مقامی وقت',
    pickOpdHint: 'او پی ڈی منتخب کریں یا URL میں ?opd_id= استعمال کریں۔',
  } as const;

  allOpds: PublicOpdOption[] = [];
  opdId = 0;
  date = todayLocalYmd();
  board: PublicOpdWaitingBoard | null = null;
  error = '';
  liveClock = new Date();
  sseOk = false;
  showControls = false;
  opdsLoading = false;

  private eventSource: EventSource | null = null;
  private pollTimer: number | null = null;
  private clockTimer: number | null = null;
  /** If calendar day rolls while the screen stays open, keep queue on “today”. */
  private dayRollTimer: number | null = null;
  private readonly destroy$ = new Subject<void>();
  /** After first bootstrap, URL-driven param changes refresh the board. */
  private routeHydrated = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly zone: NgZone,
  ) {}

  /** OPD name for header (from board or dropdown list). */
  get headerOpdName(): string {
    if (this.board?.opd?.name) return this.board.opd.name;
    const o = this.allOpds.find((x) => x.id === this.opdId);
    return o?.name ?? '';
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') return;
    this.rollDateToTodayIfNeeded();
  };

  columnAccentClass(i: number): string {
    return `accent-${i % 8}`;
  }

  ngOnInit(): void {
    this.clockTimer = window.setInterval(() => {
      this.zone.run(() => {
        this.liveClock = new Date();
      });
    }, 1000);

    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.dayRollTimer = window.setInterval(() => {
      this.zone.run(() => this.rollDateToTodayIfNeeded());
    }, 60_000);

    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const changed = this.applyQueryParams(params);
      if (this.routeHydrated && changed) {
        this.zone.run(() => this.reconnectSse());
      }
    });

    void this.bootstrap();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    if (this.dayRollTimer != null) {
      window.clearInterval(this.dayRollTimer);
      this.dayRollTimer = null;
    }
    this.eventSource?.close();
    this.clearPollTimer();
    if (this.clockTimer) window.clearInterval(this.clockTimer);
  }

  /**
   * Lobby board: always use “today” in the local browser (do not pin queue to a stale `date` in the URL).
   * Only `opd_id` is read from the query string.
   */
  private applyQueryParams(params: ParamMap): boolean {
    let changed = false;
    const oid = Number(params.get('opd_id'));
    if (Number.isFinite(oid) && oid > 0 && this.opdId !== oid) {
      this.opdId = oid;
      changed = true;
    }
    return changed;
  }

  /** When the calendar day changes (tab sleep or midnight), move the board to today. */
  private rollDateToTodayIfNeeded(): void {
    const t = todayLocalYmd();
    if (this.date >= t) return;
    this.date = t;
    if (this.routeHydrated) {
      void this.syncUrlThenReconnect();
    }
  }

  private async syncUrlThenReconnect(): Promise<void> {
    await this.syncUrl();
    this.reconnectSse();
  }

  private async bootstrap(): Promise<void> {
    this.date = todayLocalYmd();
    await this.loadAllOpds();
    if (this.opdId <= 0 && this.allOpds[0]) this.opdId = this.allOpds[0]!.id;
    await this.syncUrl();
    this.routeHydrated = true;
    this.reconnectSse();
    this.startPollingWhenOffline();
  }

  private startPollingWhenOffline(): void {
    if (this.sseOk) return;
    if (this.pollTimer != null) return;
    this.pollTimer = window.setInterval(() => {
      void this.refreshBoard();
    }, 8000);
  }

  async loadAllOpds(): Promise<void> {
    this.opdsLoading = true;
    try {
      const res = await fetch(`${this.apiBase}/api/v1/public/opds`);
      const text = await res.text();
      const data = text ? (JSON.parse(text) as unknown) : null;
      if (!res.ok) {
        this.allOpds = [];
        return;
      }
      this.allOpds = unwrapApiEnvelope<PublicOpdOption[]>(data);
    } catch {
      this.allOpds = [];
    } finally {
      this.opdsLoading = false;
    }
  }

  async refreshBoard(): Promise<void> {
    if (this.opdId <= 0) return;
    try {
      const q = `opd_id=${this.opdId}&date=${encodeURIComponent(this.date)}`;
      const res = await fetch(`${this.apiBase}/api/v1/public/waiting-board?${q}`);
      const text = await res.text();
      const data = text ? (JSON.parse(text) as unknown) : null;
      if (!res.ok) {
        const err = data as { error?: string; message?: string };
        throw new Error(err?.message ?? err?.error ?? res.statusText);
      }
      this.board = unwrapApiEnvelope<PublicOpdWaitingBoard>(data);
      this.error = '';
      if (this.board && !this.allOpds.some((o) => o.id === this.opdId)) {
        await this.loadAllOpds();
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : this.ur.failedLoad;
      this.board = null;
    }
  }

  async syncUrl(): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        opd_id: this.opdId > 0 ? this.opdId : undefined,
        date: this.date,
        center_id: undefined,
      },
      replaceUrl: true,
    });
  }

  async applyBookmarkAndRefresh(): Promise<void> {
    await this.syncUrl();
    this.showControls = false;
    this.reconnectSse();
  }

  async onOpdOrDateChanged(): Promise<void> {
    await this.syncUrl();
    this.reconnectSse();
  }

  reconnectSse(): void {
    this.sseOk = false;
    this.eventSource?.close();
    this.eventSource = null;
    this.clearPollTimer();
    void this.refreshBoard();
    this.connectSse();
    this.startPollingWhenOffline();
  }

  private connectSse(): void {
    if (this.opdId <= 0) return;
    this.eventSource?.close();
    const q = `opd_id=${this.opdId}&date=${encodeURIComponent(this.date)}`;
    const es = new EventSource(`${this.apiBase}/api/v1/public/waiting-board/stream?${q}`);

    es.onopen = () => {
      this.zone.run(() => {
        this.sseOk = true;
        this.clearPollTimer();
      });
    };

    es.addEventListener('board', (ev) => {
      try {
        const payload = unwrapApiEnvelope<PublicOpdWaitingBoard>(
          JSON.parse((ev as MessageEvent).data as string),
        );
        this.zone.run(() => {
          this.board = payload;
          this.error = '';
          this.sseOk = true;
        });
      } catch {
        this.zone.run(() => {
          this.error = this.ur.invalidPayload;
        });
      }
    });

    es.addEventListener('error', (ev) => {
      try {
        const raw = (ev as MessageEvent).data;
        if (typeof raw === 'string' && raw) {
          const m = JSON.parse(raw)?.message;
          if (m) this.zone.run(() => (this.error = String(m)));
        }
      } catch {
        /* ignore */
      }
    });

    es.onerror = () => {
      this.zone.run(() => {
        this.sseOk = false;
        void this.refreshBoard();
        if (this.pollTimer == null) {
          this.pollTimer = window.setInterval(() => {
            void this.refreshBoard();
          }, 8000);
        }
      });
    };

    this.eventSource = es;
  }

  private clearPollTimer(): void {
    if (this.pollTimer != null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
