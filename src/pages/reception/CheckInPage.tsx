import { useEffect, useState } from 'react'
import { UserRoundCheck } from 'lucide-react'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { ui } from '../../ui/classes'

type Center = { id: number; name: string; city: string; hospital_name?: string }

function today() {
  return new Date().toISOString().slice(0, 10)
}

export function CheckInPage() {
  const { can } = useAuth()
  const [centers, setCenters] = useState<Center[]>([])
  const [cnic, setCnic] = useState('')
  const [centerId, setCenterId] = useState<number>(1)
  const [date, setDate] = useState(today)
  const [result, setResult] = useState<unknown>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api<Center[]>('/centers')
      .then((c) => {
        setCenters(c)
        if (c[0]) setCenterId(c[0].id)
      })
      .catch(() => {})
  }, [])

  if (!can('appointments.checkin')) {
    return <p className={ui.muted}>No check-in permission.</p>
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setResult(null)
    try {
      const appt = await api<unknown>('/appointments/check-in-cnic', {
        method: 'POST',
        body: JSON.stringify({ cnic: cnic.replace(/-/g, ''), center_id: centerId, date }),
      })
      setResult(appt)
    } catch (e) {
      setErr(String(e))
    }
  }

  return (
    <div className={`max-w-2xl space-y-8 ${ui.page}`}>
      <div>
        <div className="flex items-center gap-2 text-cyan-700">
          <UserRoundCheck className="size-7" strokeWidth={2} aria-hidden />
        </div>
        <h1 className={`mt-2 ${ui.h1}`}>Help desk check-in</h1>
        <p className={`mt-1 text-sm ${ui.muted}`}>Verify CNIC and mark the patient as checked in.</p>
      </div>

      <form onSubmit={submit} className={`${ui.card} space-y-5`}>
        <label className="block text-sm font-medium text-slate-700">
          CNIC
          <input
            className={`${ui.input} mt-1.5 w-full`}
            value={cnic}
            onChange={(e) => setCnic(e.target.value)}
            placeholder="42401-7777777-7"
            required
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Center
          <select
            className={`${ui.select} mt-1.5 w-full`}
            value={centerId}
            onChange={(e) => setCenterId(Number(e.target.value))}
          >
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.hospital_name} — {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Appointment date
          <input type="date" className={`${ui.input} mt-1.5 w-full`} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button type="submit" className={`${ui.btnPrimary} w-full bg-emerald-600 hover:bg-emerald-700 focus-visible:outline-emerald-600`}>
          Check in
        </button>
      </form>

      {err ? <div className={ui.alertError}>{err}</div> : null}

      {result ? (
        <div className={`${ui.card} border-emerald-200 bg-emerald-50/50`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Result</p>
          <pre className="mt-2 max-h-64 overflow-auto text-xs leading-relaxed text-slate-800">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  )
}
