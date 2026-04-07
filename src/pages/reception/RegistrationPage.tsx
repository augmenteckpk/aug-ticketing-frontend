import { useEffect, useState } from 'react'
import { ClipboardList, Search } from 'lucide-react'
import { SpeechInput } from '../../components/speech'
import { FieldError } from '../../components/FieldError'
import { api } from '../../api/client'
import { todayLocalYmd } from '../../utils/dateYmd'
import { useAuth } from '../../context/AuthContext'
import { toastError, toastSuccess } from '../../lib/toast'
import {
  appointmentDateYmd,
  cnicLookupMin,
  firstNameRequired,
  optionalAddress,
  optionalCity,
  optionalDobYmd,
  optionalGenderText,
  optionalGuardianCnicDigits,
  optionalMrn,
  optionalPersonName,
  optionalPhone,
} from '../../lib/fieldValidation'
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
    father_cnic?: string | null
    mother_cnic?: string | null
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
  const [fatherCnic, setFatherCnic] = useState('')
  const [motherCnic, setMotherCnic] = useState('')
  const [busy, setBusy] = useState(false)
  const [lookupErr, setLookupErr] = useState<{ cnic?: string; date?: string }>({})
  const [regErr, setRegErr] = useState<Partial<Record<string, string>>>({})

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
    const cn = cnicLookupMin(cnic)
    const dt = appointmentDateYmd(date)
    const le: { cnic?: string; date?: string } = {}
    if (!cn.ok) le.cnic = cn.message
    if (!dt.ok) le.date = dt.message
    setLookupErr(le)
    if (Object.keys(le).length) return
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
      setFatherCnic(res.patient.father_cnic ?? '')
      setMotherCnic(res.patient.mother_cnic ?? '')
    } catch (e) {
      toastError(e, 'Lookup failed')
    } finally {
      setBusy(false)
    }
  }

  async function doRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!lookup) return
    const checks: Partial<Record<string, string>> = {}
    const fn = firstNameRequired(firstName)
    if (!fn.ok) checks.first_name = fn.message
    const ln = optionalPersonName(lastName, 50, 'Last name')
    if (!ln.ok) checks.last_name = ln.message
    const fan = optionalPersonName(fatherName, 50, "Father's name")
    if (!fan.ok) checks.father_name = fan.message
    const fcn = optionalGuardianCnicDigits(fatherCnic)
    if (!fcn.ok) checks.father_cnic = fcn.message
    const mcn = optionalGuardianCnicDigits(motherCnic)
    if (!mcn.ok) checks.mother_cnic = mcn.message
    const ph = optionalPhone(phone)
    if (!ph.ok) checks.phone = ph.message
    const g = optionalGenderText(gender)
    if (!g.ok) checks.gender = g.message
    const db = optionalDobYmd(dob)
    if (!db.ok) checks.date_of_birth = db.message
    const ad = optionalAddress(address)
    if (!ad.ok) checks.address = ad.message
    const ct = optionalCity(city)
    if (!ct.ok) checks.city = ct.message
    const mr = optionalMrn(mrn)
    if (!mr.ok) checks.medical_record_number = mr.message
    setRegErr(checks)
    if (Object.keys(checks).length) return
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
            father_cnic: fatherCnic.replace(/\D/g, '') || null,
            mother_cnic: motherCnic.replace(/\D/g, '') || null,
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
        <div className="flex items-center gap-2 text-red-700">
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
          <SpeechInput
            shellClassName={lookupErr.cnic ? '!border-red-400 ring-1 ring-red-400' : ''}
            className={`${ui.input} mt-1.5 w-full`}
            value={cnic}
            onChange={(e) => {
              setCnic(e.target.value)
              if (lookupErr.cnic) setLookupErr((x) => ({ ...x, cnic: undefined }))
            }}
            placeholder="Required"
            inputMode="numeric"
            aria-invalid={lookupErr.cnic ? true : undefined}
          />
          <FieldError message={lookupErr.cnic} />
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
          <SpeechInput
            type="date"
            shellClassName={lookupErr.date ? '!border-red-400 ring-1 ring-red-400' : ''}
            className={`${ui.input} mt-1.5 w-full`}
            value={date}
            onChange={(e) => {
              setDate(e.target.value)
              if (lookupErr.date) setLookupErr((x) => ({ ...x, date: undefined }))
            }}
            aria-invalid={lookupErr.date ? true : undefined}
          />
          <FieldError message={lookupErr.date} />
        </label>
        <button type="submit" className={`${ui.btnPrimary} w-full`} disabled={busy}>
          <Search className="size-4" strokeWidth={2} aria-hidden />
          {busy ? 'Searching…' : 'Find booked token'}
        </button>
      </form>

      {lookup ? (
        <form onSubmit={doRegister} className={`${ui.card} space-y-4 border-red-200`}>
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">
            <strong>Token #{lookup.appointment.token_number}</strong>
            {lookup.appointment.visit_type ? ` · ${lookup.appointment.visit_type.replace('_', ' ')}` : ''}
            {lookup.appointment.department_name ? ` · Dept: ${lookup.appointment.department_name}` : ''}
          </div>
          <h2 className="text-sm font-semibold text-slate-800">Demographics & visit record</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              First name *
              <SpeechInput
                shellClassName={regErr.first_name ? '!border-red-400 ring-1 ring-red-400' : ''}
                className={`${ui.input} mt-1.5 w-full`}
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value)
                  if (regErr.first_name) setRegErr((r) => ({ ...r, first_name: undefined }))
                }}
                required
              />
              <FieldError message={regErr.first_name} />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Last name
              <SpeechInput
                shellClassName={regErr.last_name ? '!border-red-400 ring-1 ring-red-400' : ''}
                className={`${ui.input} mt-1.5 w-full`}
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value)
                  if (regErr.last_name) setRegErr((r) => ({ ...r, last_name: undefined }))
                }}
              />
              <FieldError message={regErr.last_name} />
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Father&apos;s name
              <SpeechInput
                shellClassName={regErr.father_name ? '!border-red-400 ring-1 ring-red-400' : ''}
                className={`${ui.input} mt-1.5 w-full`}
                value={fatherName}
                onChange={(e) => {
                  setFatherName(e.target.value)
                  if (regErr.father_name) setRegErr((r) => ({ ...r, father_name: undefined }))
                }}
              />
              <FieldError message={regErr.father_name} />
            </label>
            <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3">
              <p className="text-xs font-medium text-slate-700">Guardian CNIC (optional — e.g. minors)</p>
              <p className={`mt-0.5 text-xs ${ui.muted}`}>Digits only; at least one may be recorded for dependents.</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Father&apos;s CNIC
                  <SpeechInput
                    shellClassName={regErr.father_cnic ? '!border-red-400 ring-1 ring-red-400' : ''}
                    className={`${ui.input} mt-1.5 w-full font-mono text-sm`}
                    value={fatherCnic}
                    onChange={(e) => {
                      setFatherCnic(e.target.value)
                      if (regErr.father_cnic) setRegErr((r) => ({ ...r, father_cnic: undefined }))
                    }}
                    placeholder="Optional"
                    inputMode="numeric"
                  />
                  <FieldError message={regErr.father_cnic} />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Mother&apos;s CNIC
                  <SpeechInput
                    shellClassName={regErr.mother_cnic ? '!border-red-400 ring-1 ring-red-400' : ''}
                    className={`${ui.input} mt-1.5 w-full font-mono text-sm`}
                    value={motherCnic}
                    onChange={(e) => {
                      setMotherCnic(e.target.value)
                      if (regErr.mother_cnic) setRegErr((r) => ({ ...r, mother_cnic: undefined }))
                    }}
                    placeholder="Optional"
                    inputMode="numeric"
                  />
                  <FieldError message={regErr.mother_cnic} />
                </label>
              </div>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Phone
              <SpeechInput
                shellClassName={regErr.phone ? '!border-red-400 ring-1 ring-red-400' : ''}
                className={`${ui.input} mt-1.5 w-full`}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value)
                  if (regErr.phone) setRegErr((r) => ({ ...r, phone: undefined }))
                }}
                inputMode="tel"
              />
              <FieldError message={regErr.phone} />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Gender
              <SpeechInput
                shellClassName={regErr.gender ? '!border-red-400 ring-1 ring-red-400' : ''}
                className={`${ui.input} mt-1.5 w-full`}
                value={gender}
                onChange={(e) => {
                  setGender(e.target.value)
                  if (regErr.gender) setRegErr((r) => ({ ...r, gender: undefined }))
                }}
              />
              <FieldError message={regErr.gender} />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Date of birth
              <SpeechInput
                type="date"
                shellClassName={regErr.date_of_birth ? '!border-red-400 ring-1 ring-red-400' : ''}
                className={`${ui.input} mt-1.5 w-full`}
                value={dob}
                onChange={(e) => {
                  setDob(e.target.value)
                  if (regErr.date_of_birth) setRegErr((r) => ({ ...r, date_of_birth: undefined }))
                }}
              />
              <FieldError message={regErr.date_of_birth} />
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Address
              <SpeechInput
                shellClassName={regErr.address ? '!border-red-400 ring-1 ring-red-400' : ''}
                className={`${ui.input} mt-1.5 w-full`}
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value)
                  if (regErr.address) setRegErr((r) => ({ ...r, address: undefined }))
                }}
              />
              <FieldError message={regErr.address} />
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              City
              <SpeechInput
                shellClassName={regErr.city ? '!border-red-400 ring-1 ring-red-400' : ''}
                className={`${ui.input} mt-1.5 w-full`}
                value={city}
                onChange={(e) => {
                  setCity(e.target.value)
                  if (regErr.city) setRegErr((r) => ({ ...r, city: undefined }))
                }}
              />
              <FieldError message={regErr.city} />
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              MRN (optional — long-term chart)
              <SpeechInput
                shellClassName={regErr.medical_record_number ? '!border-red-400 ring-1 ring-red-400' : ''}
                className={`${ui.input} mt-1.5 w-full`}
                value={mrn}
                onChange={(e) => {
                  setMrn(e.target.value)
                  if (regErr.medical_record_number) setRegErr((r) => ({ ...r, medical_record_number: undefined }))
                }}
              />
              <FieldError message={regErr.medical_record_number} />
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


