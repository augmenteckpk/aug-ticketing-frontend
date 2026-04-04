import { useEffect, useState } from 'react'
import { ClipboardList, Search } from 'lucide-react'
import { api } from '../../api/client'
import { todayLocalYmd } from '../../utils/dateYmd'
import { useAuth } from '../../context/AuthContext'
import { toastError, toastSuccess } from '../../lib/toast'
import { ui } from '../../ui/classes'

type Center = { id: number; name: string; city: string; hospital_name?: string }

type LookupResponse = {
  appointment: {
    id: number
    token_number: number
    visit_type?: string
    appointment_date: string
    department_name?: string | null
  }
  patient: {
    id: number
    cnic: string
    first_name: string
    last_name: string | null
    phone: string | null
    gender: string | null
    date_of_birth: string | null
    address: string | null
    father_name?: string | null
    city?: string | null
    medical_record_number?: string | null
  }
}

function today() {
  return todayLocalYmd()
}

export function RegistrationPage() {
  const { can } = useAuth()
  const [centers, setCenters] = useState<Center[]>([])
  const [cnic, setCnic] = useState('')
  const [centerId, setCenterId] = useState(1)
  const [date, setDate] = useState(today)
  const [lookup, setLookup] = useState<LookupResponse | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [fatherName, setFatherName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [gender, setGender] = useState('')
  const [dob, setDob] = useState('')
  const [mrn, setMrn] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<Center[]>('/centers')
      .then((c) => {
        setCenters(c)
        if (c[0]) setCenterId(c[0].id)
      })
      .catch(() => {})
  }, [])

  if (!can('appointments.register')) {
    return <p className={ui.muted}>No registration desk permission.</p>
  }

  async function doLookup(e: React.FormEvent) {
    e.preventDefault()
    setLookup(null)
    setBusy(true)
    try {
      const q = new URLSearchParams({
        cnic: cnic.replace(/\D/g, ''),
        center_id: String(centerId),
        date,
      })
      const res = await api<LookupResponse>(`/appointments/lookup-booked?${q.toString()}`)
      setLookup(res)
      toastSuccess('Booked visit found')
      setFirstName(res.patient.first_name ?? '')
      setLastName(res.patient.last_name ?? '')
      setFatherName(res.patient.father_name ?? '')
      setPhone(res.patient.phone ?? '')
      setAddress(res.patient.address ?? '')
      setCity(res.patient.city ?? '')
      setGender(res.patient.gender ?? '')
      setDob(res.patient.date_of_birth ? String(res.patient.date_of_birth).slice(0, 10) : '')
      setMrn(res.patient.medical_record_number ?? '')
    } catch (e) {
      toastError(e, 'Lookup failed')
    } finally {
      setBusy(false)
    }
  }

  async function doRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!lookup) return
    setBusy(true)
    try {
      await api('/appointments/register', {
        method: 'POST',
        body: JSON.stringify({
          appointment_id: lookup.appointment.id,
          patient: {
            first_name: firstName.trim(),
            last_name: lastName.trim() || null,
            father_name: fatherName.trim() || null,
            phone: phone.trim() || null,
            address: address.trim() || null,
            city: city.trim() || null,
            gender: gender.trim() || null,
            date_of_birth: dob || null,
            medical_record_number: mrn.trim() || null,
          },
        }),
      })
      setLookup(null)
      setCnic('')
      toastSuccess('Registration saved. W number assigned — patient can proceed to pre-assessment.')
    } catch (e) {
      toastError(e, 'Registration failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`max-w-3xl space-y-8 ${ui.page}`}>
      <div>
        <div className="flex items-center gap-2 text-cyan-700">
          <ClipboardList className="size-7" strokeWidth={2} aria-hidden />
        </div>
        <h1 className={`mt-2 ${ui.h1}`}>Registration desk</h1>
        <p className={`mt-1 text-sm ${ui.muted}`}>
          HIS step after token issue: capture demographics, assign W number, and route by weekday schedule (configure
          under Centers).
        </p>
      </div>

      <form onSubmit={doLookup} className={`${ui.card} space-y-5`}>
        <h2 className="text-sm font-semibold text-slate-800">Find booked visit</h2>
        <label className="block text-sm font-medium text-slate-700">
          CNIC
          <input
            className={`${ui.input} mt-1.5 w-full`}
            value={cnic}
            onChange={(e) => setCnic(e.target.value)}
 placeholder="Required"
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
          Visit date
          <input type="date" className={`${ui.input} mt-1.5 w-full`} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button type="submit" className={`${ui.btnPrimary} w-full`} disabled={busy}>
          <Search className="size-4" strokeWidth={2} aria-hidden />
          {busy ? 'Searching…' : 'Find booked token'}
        </button>
      </form>

      {lookup ? (
        <form onSubmit={doRegister} className={`${ui.card} space-y-4 border-cyan-200`}>
          <div className="rounded-lg bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
            <strong>Token #{lookup.appointment.token_number}</strong>
            {lookup.appointment.visit_type ? ` · ${lookup.appointment.visit_type.replace('_', ' ')}` : ''}
            {lookup.appointment.department_name ? ` · Dept: ${lookup.appointment.department_name}` : ''}
          </div>
          <h2 className="text-sm font-semibold text-slate-800">Demographics & visit record</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              First name *
              <input className={`${ui.input} mt-1.5 w-full`} value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Last name
              <input className={`${ui.input} mt-1.5 w-full`} value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Father&apos;s name
              <input className={`${ui.input} mt-1.5 w-full`} value={fatherName} onChange={(e) => setFatherName(e.target.value)} />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Phone
              <input className={`${ui.input} mt-1.5 w-full`} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Gender
              <input className={`${ui.input} mt-1.5 w-full`} value={gender} onChange={(e) => setGender(e.target.value)} />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Date of birth
              <input type="date" className={`${ui.input} mt-1.5 w-full`} value={dob} onChange={(e) => setDob(e.target.value)} />
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Address
              <input className={`${ui.input} mt-1.5 w-full`} value={address} onChange={(e) => setAddress(e.target.value)} />
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              City
              <input className={`${ui.input} mt-1.5 w-full`} value={city} onChange={(e) => setCity(e.target.value)} />
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              MRN (optional — long-term chart)
              <input className={`${ui.input} mt-1.5 w-full`} value={mrn} onChange={(e) => setMrn(e.target.value)} />
            </label>
          </div>
          <button type="submit" className={`${ui.btnPrimary} w-full bg-emerald-600 hover:bg-emerald-700`} disabled={busy}>
            Save registration &amp; print slip data
          </button>
        </form>
      ) : null}
    </div>
  )
}
