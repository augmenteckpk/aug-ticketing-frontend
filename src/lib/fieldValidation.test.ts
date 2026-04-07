import { describe, expect, it } from 'vitest'
import {
  appointmentDateYmd,
  cnicLookupMin,
  firstNameRequired,
  loginPassword,
  loginUsername,
  optionalEmail,
  optionalGuardianCnicDigits,
  optionalPhone,
  pakistanCnic13,
  preferredLanguageCode,
  registerPassword,
  registerUsername,
  staffPatientCnic,
} from './fieldValidation'

describe('fieldValidation — positive cases', () => {
  it('login accepts normal staff username/password', () => {
    expect(loginUsername('admin').ok).toBe(true)
    expect(loginPassword('secret').ok).toBe(true)
  })
  it('register username/password', () => {
    expect(registerUsername('patient_one').ok).toBe(true)
    expect(registerPassword('abcdef').ok).toBe(true)
  })
  it('CNIC', () => {
    expect(pakistanCnic13('12345-1234567-1').ok).toBe(true)
    expect(pakistanCnic13('1234512345671').ok).toBe(true)
    expect(cnicLookupMin('12345').ok).toBe(true)
    expect(optionalGuardianCnicDigits('').ok).toBe(true)
    expect(optionalGuardianCnicDigits('42301-1234567-3').ok).toBe(true)
    expect(staffPatientCnic('42301-1234567-3').ok).toBe(true)
  })
  it('dates and language', () => {
    expect(appointmentDateYmd('2026-04-01').ok).toBe(true)
    expect(preferredLanguageCode('en').ok).toBe(true)
    expect(preferredLanguageCode('ur').ok).toBe(true)
    expect(preferredLanguageCode('sd').ok).toBe(true)
  })
  it('names email phone', () => {
    expect(firstNameRequired('Ali').ok).toBe(true)
    expect(firstNameRequired('MÃ¼ller').ok).toBe(true)
    expect(optionalEmail('a@b.co').ok).toBe(true)
    expect(optionalEmail('').ok).toBe(true)
    expect(optionalPhone('+92 300 1234567').ok).toBe(true)
    expect(optionalPhone('').ok).toBe(true)
  })
})

describe('fieldValidation — negative cases', () => {
  it('login rejects empty', () => {
    expect(loginUsername('').ok).toBe(false)
    expect(loginUsername('   ').ok).toBe(false)
    expect(loginPassword('').ok).toBe(false)
  })
  it('register username', () => {
    expect(registerUsername('ab').ok).toBe(false)
    expect(registerUsername('bad name').ok).toBe(false)
  })
  it('register password', () => {
    expect(registerPassword('12345').ok).toBe(false)
  })
  it('CNIC — digit count and dash layout', () => {
    expect(pakistanCnic13('1234').ok).toBe(false)
    expect(pakistanCnic13('12345678901234').ok).toBe(false)
    expect(pakistanCnic13('61101-49848565').ok).toBe(false)
    expect(cnicLookupMin('123').ok).toBe(false)
    expect(optionalGuardianCnicDigits('12').ok).toBe(false)
    expect(staffPatientCnic('61101-49848565').ok).toBe(false)
  })
  it('dates', () => {
    expect(appointmentDateYmd('').ok).toBe(false)
    expect(appointmentDateYmd('01-04-2026').ok).toBe(false)
  })
  it('language', () => {
    expect(preferredLanguageCode('fr').ok).toBe(false)
  })
  it('email phone name', () => {
    expect(firstNameRequired('').ok).toBe(false)
    expect(firstNameRequired('321321!!!').ok).toBe(false)
    expect(firstNameRequired('21321@@@').ok).toBe(false)
    expect(optionalEmail('not-an-email').ok).toBe(false)
    expect(optionalPhone('abc').ok).toBe(false)
    expect(optionalPhone('dasdnsadsa').ok).toBe(false)
    expect(optionalPhone('12345').ok).toBe(false)
  })
})

