import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SpeechInput } from '../../components/speech'
import { todayLocalYmd } from '../../utils/dateYmd'

const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')

/** اردو — انتظار گاہ LED اسکرین */
const t = {
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
} as const

type PublicCenter = { id: number; name: string; city: string; hospital_name?: string | null }

type PublicWaitingBoard = {
  center: { id: number; name: string; city: string; hospital_name?: string | null }
  date: string
  server_time: string
  ready_queue: { token_numbers: number[]; count: number }
  draft_batches: { id: number; batch_index: number; token_numbers: number[] }[]
  latest_dispatched: {
    id: number
    batch_index: number
    token_numbers: number[]
    dispatched_at: string | null
  } | null
  dispatched_earlier: { batch_index: number; token_numbers: number[] }[]
  meta: { refresh_hint_seconds: number; transport: string }
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1${path}`)
  const text = await res.text()
  const data = text ? (JSON.parse(text) as unknown) : null
  if (!res.ok) {
    const err = data as { error?: string }
    throw new Error(err?.error ?? res.statusText)
  }
  return data as T
}

function SeatGrid({
  tokens,
  minSlots = 20,
  accent = 'cyan',
}: {
  tokens: number[]
  minSlots?: number
  accent?: 'cyan' | 'amber' | 'violet'
}) {
  const n = Math.max(minSlots, tokens.length)
  const ring =
    accent === 'amber'
      ? 'border-amber-400 bg-amber-50 text-amber-950 shadow-sm'
      : accent === 'violet'
        ? 'border-violet-400 bg-violet-50 text-violet-950 shadow-sm'
        : 'border-red-500 bg-red-50 text-red-950 shadow-sm'
  const empty = 'border-slate-200 bg-slate-100 text-slate-400'

  return (
    <div
      className="grid gap-2 sm:gap-3"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(4.5rem, 1fr))' }}
    >
      {Array.from({ length: n }, (_, i) => {
        const tok = tokens[i]
        return (
          <div
            key={i}
            className={`flex aspect-square min-h-[3.25rem] items-center justify-center rounded-xl border-2 text-xl font-black tabular-nums sm:min-h-[4rem] sm:text-3xl ${
              tok != null ? ring : empty
            }`}
          >
            {tok != null ? tok : '—'}
          </div>
        )
      })}
    </div>
  )
}

export function WaitingBoardPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const centerFromUrl = Number(searchParams.get('center_id') ?? '')
  const dateFromUrl = searchParams.get('date') ?? ''

  const [centers, setCenters] = useState<PublicCenter[]>([])
  const [centerId, setCenterId] = useState<number>(Number.isFinite(centerFromUrl) && centerFromUrl > 0 ? centerFromUrl : 0)
  const [date, setDate] = useState(dateFromUrl.match(/^\d{4}-\d{2}-\d{2}$/) ? dateFromUrl : todayLocalYmd())
  const [board, setBoard] = useState<PublicWaitingBoard | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [liveClock, setLiveClock] = useState(() => new Date())
  const [sseOk, setSseOk] = useState(false)
  const [showControls, setShowControls] = useState(false)

  useEffect(() => {
    const id = window.setInterval(() => setLiveClock(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    void fetchJson<PublicCenter[]>('/public/centers')
      .then((c) => {
        setCenters(c)
        if (centerId <= 0 && c[0]) {
          setCenterId(c[0].id)
          setSearchParams({ center_id: String(c[0].id), date }, { replace: true })
        }
      })
      .catch(() => setCenters([]))
  }, [])

  const applyBoard = useCallback((payload: PublicWaitingBoard) => {
    setBoard(payload)
    setErr(null)
  }, [])

  const pollOnce = useCallback(async () => {
    if (centerId <= 0) return
    try {
      const q = `?center_id=${centerId}&date=${encodeURIComponent(date)}`
      applyBoard(await fetchJson<PublicWaitingBoard>(`/public/waiting-board${q}`))
    } catch (e) {
      setErr(e instanceof Error ? e.message : t.failedLoad)
    }
  }, [centerId, date, applyBoard])

  useEffect(() => {
    void pollOnce()
  }, [pollOnce])

  useEffect(() => {
    if (centerId <= 0) return
    const q = `center_id=${centerId}&date=${encodeURIComponent(date)}`
    const url = `${API_BASE}/api/v1/public/waiting-board/stream?${q}`
    const es = new EventSource(url)
    es.onopen = () => setSseOk(true)
    es.addEventListener('board', (ev) => {
      try {
        applyBoard(JSON.parse(ev.data) as PublicWaitingBoard)
      } catch {
        setErr(t.invalidPayload)
      }
    })
    es.addEventListener('error', (ev) => {
      const m = (() => {
        try {
          return JSON.parse((ev as MessageEvent).data as string)?.message
        } catch {
          return null
        }
      })()
      if (m) setErr(String(m))
    })
    es.onerror = () => {
      setSseOk(false)
      void pollOnce()
    }
    return () => {
      es.close()
    }
  }, [centerId, date, applyBoard, pollOnce])

  useEffect(() => {
    if (sseOk) return
    const id = window.setInterval(() => void pollOnce(), 8000)
    return () => clearInterval(id)
  }, [sseOk, pollOnce])

  const syncUrl = useCallback(() => {
    setSearchParams({ center_id: String(centerId), date }, { replace: true })
  }, [centerId, date, setSearchParams])

  const subtitle = useMemo(() => {
    if (!board) return ''
    return `${board.center.hospital_name ? `${board.center.hospital_name} · ` : ''}${board.center.name} · ${board.center.city}`
  }, [board])

  return (
    <div className="urdu-display-font min-h-screen bg-white text-slate-900" dir="rtl" lang="ur">
      <header className="border-b border-slate-200 bg-slate-50 px-4 py-5 shadow-sm sm:px-8">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-right lg:text-right">
            <p className="text-xs font-semibold tracking-wide text-red-700">{t.displayEyebrow}</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-4xl">{t.displayTitle}</h1>
            <p className="mt-1 text-sm text-slate-600">{subtitle || t.selectCenter}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-left shadow-sm">
              <p className="text-[10px] font-semibold tracking-wide text-slate-500">{t.localTime}</p>
              <p className="font-mono text-xl font-bold tabular-nums text-slate-900 sm:text-2xl" dir="ltr" lang="en">
                {liveClock.toLocaleTimeString('ur-PK', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </p>
            </div>
            <div
              className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                sseOk ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200' : 'bg-amber-100 text-amber-900 ring-1 ring-amber-200'
              }`}
            >
              {sseOk ? t.liveSse : t.polling}
            </div>
            <button
              type="button"
              onClick={() => setShowControls((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-100"
            >
              <span aria-hidden>☰</span>
              {showControls ? 'اختیارات بند کریں' : 'اختیارات کھولیں'}
            </button>
          </div>
        </div>

        {showControls ? (
          <div className="mx-auto mt-4 max-w-[1600px] rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm">
            <div className="flex flex-wrap items-end justify-end gap-3">
              <label className="flex flex-col gap-1 text-[10px] font-semibold tracking-wide text-slate-600">
                {t.center}
                <select
                  className="min-w-[220px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
                  value={centerId || ''}
                  onChange={(e) => setCenterId(Number(e.target.value))}
                >
                  <option value="">—</option>
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.hospital_name ? `${c.hospital_name} — ` : ''}
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[10px] font-semibold tracking-wide text-slate-600">
                {t.date}
                <SpeechInput
                  type="date"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
                  dir="ltr"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  syncUrl()
                  void pollOnce()
                  setShowControls(false)
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
              >
                {t.applyBookmark}
              </button>
            </div>
          </div>
        ) : null}
      </header>

      {err ? (
        <div className="mx-auto max-w-[1600px] px-4 py-3 sm:px-8">
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-right text-sm text-red-900">
            {err}
          </p>
        </div>
      ) : null}

      <main className="mx-auto max-w-[1600px] space-y-8 px-4 py-8 sm:px-8">
        {!board && !err ? <p className="text-right text-slate-600">{t.loading}</p> : null}

        {board ? (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 text-right shadow-sm sm:p-6">
              <h2 className="mb-2 text-lg font-bold text-violet-800">{t.readyLaneTitle}</h2>
              <p className="mb-3 text-sm leading-relaxed text-slate-600">{t.readyLaneBody}</p>
              {board.ready_queue.token_numbers.length ? (
                <SeatGrid
                  tokens={board.ready_queue.token_numbers}
                  minSlots={Math.min(40, Math.max(20, board.ready_queue.count))}
                  accent="violet"
                />
              ) : (
                <p className="text-slate-600">{t.noReady}</p>
              )}
            </section>

            {board.draft_batches.length > 0 ? (
              <section className="space-y-8 rounded-2xl border border-slate-200 bg-white p-5 text-right shadow-sm sm:p-6">
                <h2 className="text-lg font-bold text-red-800">{t.nextBatchesTitle}</h2>
                {board.draft_batches.map((b) => (
                  <div key={b.id}>
                    <h3 className="mb-2 text-sm font-semibold text-slate-600">
                      {t.batchSeats(b.batch_index, b.token_numbers.length)}
                    </h3>
                    <SeatGrid tokens={b.token_numbers} minSlots={20} accent="cyan" />
                  </div>
                ))}
              </section>
            ) : (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 text-right shadow-sm sm:p-6">
                <h2 className="mb-2 text-lg font-bold text-red-800">{t.nextBatchesShort}</h2>
                <p className="text-slate-600">{t.noDraftBatches}</p>
              </section>
            )}

            {board.dispatched_earlier.length > 0 ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 text-right shadow-sm sm:p-6">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">{t.earlierToday}</h2>
                <ul className="flex flex-wrap justify-end gap-2">
                  {board.dispatched_earlier.map((b) => (
                    <li
                      key={b.batch_index}
                      className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-800"
                      dir="ltr"
                    >
                      {t.batchList(b.batch_index, b.token_numbers.join(', '))}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="rounded-2xl border border-slate-200 bg-white p-5 text-right shadow-sm sm:p-6">
              <h2 className="mb-3 flex flex-row-reverse flex-wrap items-center justify-end gap-2 text-lg font-bold text-amber-800">
                <span className="inline-block size-2 animate-pulse rounded-full bg-amber-500" aria-hidden />
                {t.withDoctorTitle}
                <span className="text-sm font-normal text-slate-600">
                  {board.latest_dispatched
                    ? t.batchNumber(board.latest_dispatched.batch_index)
                    : t.noDispatchYet}
                </span>
              </h2>
              {board.latest_dispatched?.token_numbers?.length ? (
                <SeatGrid tokens={board.latest_dispatched.token_numbers} minSlots={20} accent="amber" />
              ) : (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-600">
                  {t.whenDispatch}
                </p>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  )
}

