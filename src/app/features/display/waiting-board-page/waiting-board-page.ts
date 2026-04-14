import { CommonModule } from '@angular/common';
import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { resolveApiBaseUrl } from '../../../../environments/api-base';
import { unwrapApiEnvelope } from '../../../core/services/api';
import { todayLocalYmd } from '../../../core/utils/local-date';

type PublicCenter = { id: number; name: string; city: string; hospital_name?: string | null };

type PublicWaitingBoard = {
  center: { id: number; name: string; city: string; hospital_name?: string | null };
  date: string;
  server_time: string;
  ready_queue: { token_numbers: number[]; count: number };
  draft_batches: { id: number; batch_index: number; token_numbers: number[] }[];
  latest_dispatched: {
    id: number;
    batch_index: number;
    token_numbers: number[];
    dispatched_at: string | null;
  } | null;
  dispatched_earlier: { batch_index: number; token_numbers: number[] }[];
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

  /** Urdu waiting-area LED screen labels (parity with React WaitingBoardPage). */
  readonly ur = {
    displayEyebrow: 'او پی ڈی · انتظار کی اسکرین',
    displayTitle: 'موجودہ قطار اور گروپ',
    selectCenter: 'سینٹر منتخب کریں',
    localTime: 'مقامی وقت',
    liveSse: 'براہ راست (SSE)',
    polling: 'وقفے سے تازہ',
    center: 'کلینک سینٹر',
    date: 'تاریخ',
    applyBookmark: 'لاگو کریں اور لنک محفوظ کریں',
    loading: 'لوڈ ہو رہا ہے…',
    readyLaneTitle: 'تیار قطار — اگلے گروپ میں',
    readyLaneBody:
      'پیشگی معائنہ مکمل۔ یہ ٹوکن ابھی کسی گروپ میں نہیں۔ عملہ اگلا گروپ بناتے وقت اس فہرست کے اوپر سے لیتا ہے۔',
    noReady: 'تیار قطار میں اس وقت کوئی نہیں۔',
    nextBatchesTitle: 'اگلے گروپس (تیار، بھیجنے کے منتظر)',
    batchSeats: (batchIndex: number, count: number) => `گروپ نمبر ${batchIndex} · ${count} نشستیں`,
    noDraftBatches:
      'ابھی کوئی ڈرافٹ گروپ نہیں — سسٹم میں «قطار اور گروپ» سے تیار قطار سے گروپ بنائیں۔',
    nextBatchesShort: 'اگلے گروپس',
    earlierToday: 'آج پہلے',
    batchList: (batchIndex: number, tokens: string) => `گروپ ${batchIndex}: ${tokens}`,
    withDoctorTitle: 'اب ڈاکٹر کے پاس',
    batchNumber: (n: number) => `(گروپ نمبر ${n})`,
    noDispatchYet: '— ابھی کوئی گروپ نہیں بھیجا گیا',
    whenDispatch: 'جب کوآرڈینیٹر گروپ بھیجیں گے تو ٹوکن نمبر یہاں دکھائی دیں گے۔',
    invalidPayload: 'بورڈ کا ڈیٹا درست نہیں۔',
    failedLoad: 'لوڈ نہیں ہو سکا۔',
    openControls: 'اختیارات کھولیں',
    closeControls: 'اختیارات بند کریں',
  } as const;

  centers: PublicCenter[] = [];
  centerId = 0;
  date = todayLocalYmd();
  board: PublicWaitingBoard | null = null;
  error = '';
  liveClock = new Date();
  sseOk = false;
  showControls = false;

  private eventSource: EventSource | null = null;
  private pollTimer: number | null = null;
  private clockTimer: number | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly zone: NgZone,
  ) {}

  get subtitle(): string {
    if (!this.board) return '';
    const c = this.board.center;
    const hosp = c.hospital_name ? `${c.hospital_name} · ` : '';
    return `${hosp}${c.name} · ${c.city}`;
  }

  seatSlots(tokens: number[], minSlots: number): (number | null)[] {
    const n = Math.max(minSlots, tokens.length);
    return Array.from({ length: n }, (_, i) => (tokens[i] !== undefined ? tokens[i]! : null));
  }

  readyMinSlots(board: PublicWaitingBoard): number {
    return Math.min(40, Math.max(20, board.ready_queue.count));
  }

  async ngOnInit(): Promise<void> {
    const q = this.route.snapshot.queryParamMap;
    const cid = Number(q.get('center_id'));
    if (Number.isFinite(cid) && cid > 0) this.centerId = cid;
    const d = q.get('date');
    const dateFromQuery = Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d));
    if (dateFromQuery && d) {
      this.date = d;
    } else {
      this.date = todayLocalYmd();
    }

    this.clockTimer = window.setInterval(() => {
      this.zone.run(() => {
        this.liveClock = new Date();
      });
    }, 1000);

    await this.loadCenters();
    let centerWasDefaulted = false;
    if (this.centerId <= 0 && this.centers[0]) {
      this.centerId = this.centers[0].id;
      centerWasDefaulted = true;
    }
    if ((!dateFromQuery || centerWasDefaulted) && this.centerId > 0) {
      await this.syncUrl();
    }

    await this.refreshBoard();
    this.connectSse();
    this.startPollingWhenOffline();
  }

  ngOnDestroy(): void {
    this.eventSource?.close();
    this.clearPollTimer();
    if (this.clockTimer) window.clearInterval(this.clockTimer);
  }

  /** Match React: poll every 8s only while SSE is not connected. */
  private startPollingWhenOffline(): void {
    if (this.sseOk) return;
    if (this.pollTimer != null) return;
    this.pollTimer = window.setInterval(() => {
      void this.refreshBoard();
    }, 8000);
  }

  async loadCenters(): Promise<void> {
    try {
      const res = await fetch(`${this.apiBase}/api/v1/public/centers`);
      const text = await res.text();
      const data = text ? (JSON.parse(text) as unknown) : null;
      if (!res.ok) {
        const err = data as { error?: string; message?: string };
        throw new Error(err?.message ?? err?.error ?? res.statusText);
      }
      this.centers = unwrapApiEnvelope<PublicCenter[]>(data);
    } catch {
      this.centers = [];
    }
  }

  async refreshBoard(): Promise<void> {
    if (this.centerId <= 0) return;
    try {
      const q = `center_id=${this.centerId}&date=${encodeURIComponent(this.date)}`;
      const res = await fetch(`${this.apiBase}/api/v1/public/waiting-board?${q}`);
      const text = await res.text();
      const data = text ? (JSON.parse(text) as unknown) : null;
      if (!res.ok) {
        const err = data as { error?: string; message?: string };
        throw new Error(err?.message ?? err?.error ?? res.statusText);
      }
      this.board = unwrapApiEnvelope<PublicWaitingBoard>(data);
      this.error = '';
    } catch (e) {
      this.error = e instanceof Error ? e.message : this.ur.failedLoad;
    }
  }

  async syncUrl(): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { center_id: this.centerId > 0 ? this.centerId : undefined, date: this.date },
      replaceUrl: true,
    });
  }

  async applyBookmarkAndRefresh(): Promise<void> {
    await this.syncUrl();
    this.showControls = false;
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

  onCenterOrDateChanged(): void {
    this.reconnectSse();
  }

  private connectSse(): void {
    if (this.centerId <= 0) return;
    this.eventSource?.close();
    const q = `center_id=${this.centerId}&date=${encodeURIComponent(this.date)}`;
    const es = new EventSource(`${this.apiBase}/api/v1/public/waiting-board/stream?${q}`);

    es.onopen = () => {
      this.zone.run(() => {
        this.sseOk = true;
        this.clearPollTimer();
      });
    };

    es.addEventListener('board', (ev) => {
      try {
        const payload = unwrapApiEnvelope<PublicWaitingBoard>(
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
