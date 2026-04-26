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
  private static readonly CLINICS_ON_SCREEN_1 = 3;
  private static readonly TOKENS_PER_SUBCOL = 5;
  private static readonly SUBCOLS_PER_PAGE = 2;
  private static readonly PAGE_ROTATE_MS = 10_000;

  /** Urdu labels — waiting-area display. */
  readonly ur = {
    /** Shown after OPD name in the main title. */
    screenTitleUr: 'انتظار سکرین',
    opd: 'او پی ڈی',
    date: 'تاریخ',
    applyBookmark: 'لاگو کریں اور لنک محفوظ کریں',
    loading: 'لوڈ ہو رہا ہے…',
    liveSse: '',
    polling: '',
    noRoster: 'اس دن کے لیے کوئی کلینک شیڈول نہیں —',
    noTickets: '—',
    openControls: '',
    closeControls: '',
    failedLoad: 'لوڈ نہیں ہو سکا۔',
    invalidPayload: 'بورڈ کا ڈیٹا درست نہیں۔',
    localTime: '',
    pickOpdHint: 'او پی ڈی منتخب کریں یا URL میں ?opd_id= استعمال کریں۔',
  } as const;

  allOpds: PublicOpdOption[] = [];
  opdId = 0;
  date = todayLocalYmd();
  screen: 1 | 2 = 1;
  board: PublicOpdWaitingBoard | null = null;
  error = '';
  liveClock = new Date();
  sseOk = false;
  showControls = false;
  opdsLoading = false;
  controlsAuthOpen = false;
  controlsPassword = '';
  controlsPasswordError = '';
  private static readonly CONTROLS_PASSWORD = 'Admin@123';

  private eventSource: EventSource | null = null;
  private pollTimer: number | null = null;
  private clockTimer: number | null = null;
  private tokenPageTimer: number | null = null;
  pageFlipOn = false;
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

  get visibleColumns(): PublicOpdWaitingBoard['columns'] {
    const cols = this.board?.columns ?? [];
    if (this.screen === 1) return cols.slice(0, WaitingBoardPage.CLINICS_ON_SCREEN_1);
    return cols.slice(WaitingBoardPage.CLINICS_ON_SCREEN_1);
  }

  private clinicPageCount(col: PublicOpdWaitingBoard['columns'][number]): number {
    const perPage = WaitingBoardPage.TOKENS_PER_SUBCOL * WaitingBoardPage.SUBCOLS_PER_PAGE;
    const n = col.tickets?.length ?? 0;
    return Math.max(1, Math.ceil(n / perPage));
  }

  get anyOverflowOnScreen(): boolean {
    return this.visibleColumns.some((c) => this.clinicPageCount(c) > 1);
  }

  get screenTotalPages(): number {
    const cols = this.visibleColumns;
    if (!cols.length) return 1;
    return Math.max(1, ...cols.map((c) => this.clinicPageCount(c)));
  }

  get screenPageIndicator(): string {
    const total = this.screenTotalPages;
    if (total <= 1) return '';
    return `${this.screenPage + 1}/${total}`;
  }

  tokenSubcols(col: PublicOpdWaitingBoard['columns'][number]): Array<Array<{ ticket_display: string; token_number: number; status: string }>> {
    const perSubcol = WaitingBoardPage.TOKENS_PER_SUBCOL;
    const perPage = perSubcol * WaitingBoardPage.SUBCOLS_PER_PAGE;
    const total = this.clinicPageCount(col);
    const page = total <= 1 ? 0 : this.screenPage % total;
    const start = page * perPage;
    const slice = (col.tickets ?? []).slice(start, start + perPage);
    const out: Array<Array<{ ticket_display: string; token_number: number; status: string }>> = [];
    for (let i = 0; i < slice.length; i += perSubcol) {
      out.push(slice.slice(i, i + perSubcol));
    }
    return out.length ? out : [[]];
  }

  subcolCount(col: PublicOpdWaitingBoard['columns'][number]): number {
    const n = col.tickets?.length ?? 0;
    if (n <= WaitingBoardPage.TOKENS_PER_SUBCOL) return 1;
    return 2;
  }

  private screenPage = 0;

  private resetTokenPaging(): void {
    this.screenPage = 0;
  }

  /**
   * Keep paging stable even if SSE/poll refreshes frequently.
   * (If we reset the interval on every board refresh, it may never reach 10s.)
   */
  private ensureTokenPaging(): void {
    const total = this.screenTotalPages;
    if (total <= 1) {
      this.screenPage = 0;
      this.stopTokenPaging();
      return;
    }

    // Clamp if total pages changed while running.
    if (this.screenPage >= total) this.screenPage = this.screenPage % total;

    if (this.tokenPageTimer != null) return;
    this.tokenPageTimer = window.setInterval(() => {
      this.zone.run(() => {
        const totalNow = this.screenTotalPages;
        if (totalNow <= 1) {
          this.screenPage = 0;
          this.stopTokenPaging();
          return;
        }
        const next = (this.screenPage + 1) % totalNow;
        if (next !== this.screenPage) {
          this.screenPage = next;
          this.pageFlipOn = true;
          window.setTimeout(() => {
            this.zone.run(() => (this.pageFlipOn = false));
          }, 260);
        }
      });
    }, WaitingBoardPage.PAGE_ROTATE_MS);
  }

  private stopTokenPaging(): void {
    if (this.tokenPageTimer != null) {
      window.clearInterval(this.tokenPageTimer);
      this.tokenPageTimer = null;
    }
  }

  openControlsAuth(): void {
    // Always require password for settings popup (display devices are public).
    this.controlsPassword = '';
    this.controlsPasswordError = '';
    this.controlsAuthOpen = true;
    this.showControls = false;
  }

  closeControlsAuth(): void {
    this.controlsAuthOpen = false;
    this.controlsPassword = '';
    this.controlsPasswordError = '';
  }

  confirmControlsPassword(): void {
    if (this.controlsPassword !== WaitingBoardPage.CONTROLS_PASSWORD) {
      this.controlsPasswordError = 'Wrong password';
      return;
    }
    this.controlsAuthOpen = false;
    this.controlsPassword = '';
    this.controlsPasswordError = '';
    this.showControls = true;
  }

  closeControls(): void {
    this.showControls = false;
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

    void this.bootstrap().finally(() => {
      // Ensure pager runs even if first payload is delayed.
      this.ensureTokenPaging();
    });
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
    this.stopTokenPaging();
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
    const sRaw = params.get('screen');
    const s = sRaw === '2' ? 2 : 1;
    if (this.screen !== s) {
      this.screen = s;
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
      // Keep token paging stable; if clinic count changes, restart the timer.
      this.ensureTokenPaging();
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
        screen: this.screen,
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
    this.resetTokenPaging();
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
          this.ensureTokenPaging();
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
