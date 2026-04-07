/**
 * Client-side validation aligned with backend `validators/schemas.ts`.
 * Keep in sync with `mobile/src/utils/fieldValidation.ts`.
 */

export type VResult = { ok: true } | { ok: false; message: string };

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

/** Legal person names: Unicode letters, spaces, apostrophe, period, hyphen */
const PERSON_NAME_CHARS = /^[\p{L}\s'.-]+$/u;
const HAS_LETTER = /\p{L}/u;

/** NADRA-style display: #####-#######-# */
const CNIC_DISPLAY = /^\d{5}-\d{7}-\d{1}$/;

export function cnicDashedFormatOk(raw: string): boolean {
  const t = raw.trim();
  if (!/[-\s]/.test(t)) return true;
  const compact = t.replace(/\s/g, '');
  return CNIC_DISPLAY.test(compact);
}

export function loginUsername(v: string): VResult {
  const s = v.trim();
  if (!s) return { ok: false, message: 'Username is required.' };
  if (s.length > 50) return { ok: false, message: 'Username must be at most 50 characters.' };
  return { ok: true };
}

export function loginPassword(v: string): VResult {
  if (!v) return { ok: false, message: 'Password is required.' };
  return { ok: true };
}

export function registerUsername(v: string): VResult {
  const s = v.trim();
  if (s.length < 3) return { ok: false, message: 'Username must be at least 3 characters.' };
  if (s.length > 50) return { ok: false, message: 'Username must be at most 50 characters.' };
  if (!USERNAME_PATTERN.test(s)) {
    return { ok: false, message: 'Username may only contain letters, numbers, dots, underscores, and hyphens.' };
  }
  return { ok: true };
}

export function registerPassword(v: string): VResult {
  if (v.length < 6) return { ok: false, message: 'Password must be at least 6 characters.' };
  if (v.length > 100) return { ok: false, message: 'Password must be at most 100 characters.' };
  return { ok: true };
}

/** Pakistan CNIC: 13 digits; if hyphens/spaces are used, must be #####-#######-#. */
export function pakistanCnic13(v: string): VResult {
  const t = v.trim();
  const d = t.replace(/\D/g, '');
  if (d.length < 5) return { ok: false, message: 'Enter a CNIC number (at least 5 digits).' };
  if (d.length !== 13) return { ok: false, message: 'CNIC must be exactly 13 digits.' };
  if (!cnicDashedFormatOk(t)) {
    return {
      ok: false,
      message: 'Use CNIC format #####-#######-# (5 digits, hyphen, 7 digits, hyphen, 1 digit).',
    };
  }
  if (!/^[\d\s-]+$/.test(t)) return { ok: false, message: 'CNIC may only contain digits and hyphens.' };
  return { ok: true };
}

/** Lookup: 5-13 digits; if exactly 13 and separators present, enforce #####-#######-#. */
export function cnicLookupMin(v: string): VResult {
  const t = v.trim();
  const d = t.replace(/\D/g, '');
  if (d.length < 5) return { ok: false, message: 'Enter at least 5 CNIC digits.' };
  if (d.length > 13) return { ok: false, message: 'CNIC has too many digits.' };
  if (!/^[\d\s-]*$/.test(t)) return { ok: false, message: 'CNIC may only contain digits and hyphens.' };
  if (d.length === 13 && !cnicDashedFormatOk(t)) {
    return { ok: false, message: 'Use CNIC format #####-#######-#.' };
  }
  return { ok: true };
}

export function optionalGuardianCnicDigits(v: string): VResult {
  const t = v.trim();
  const d = t.replace(/\D/g, '');
  if (!d) return { ok: true };
  if (d.length !== 13) return { ok: false, message: 'Guardian CNIC must be 13 digits or left empty.' };
  if (!cnicDashedFormatOk(t)) {
    return { ok: false, message: 'Use CNIC format #####-#######-#.' };
  }
  if (!/^[\d\s-]*$/.test(t)) return { ok: false, message: 'CNIC may only contain digits and hyphens.' };
  return { ok: true };
}

/** Staff create / walk-in: 5-20 digits per API; enforce #####-#######-# when 13 with separators. */
export function staffPatientCnic(v: string): VResult {
  const t = v.trim();
  if (!t) return { ok: false, message: 'CNIC is required.' };
  const d = t.replace(/\D/g, '');
  if (d.length < 5) return { ok: false, message: 'CNIC must have at least 5 digits.' };
  if (d.length > 20) return { ok: false, message: 'CNIC is too long (max 20 digits).' };
  if (!/^[\d\s-]+$/.test(t)) return { ok: false, message: 'CNIC may only contain digits and hyphens.' };
  if (d.length === 13 && !cnicDashedFormatOk(t)) {
    return { ok: false, message: 'Use CNIC format #####-#######-#.' };
  }
  return { ok: true };
}

export function personNameRequired(v: string, label: string): VResult {
  const s = v.trim();
  if (!s) return { ok: false, message: `${label} is required.` };
  if (s.length > 50) return { ok: false, message: `${label} must be at most 50 characters.` };
  if (!HAS_LETTER.test(s)) return { ok: false, message: `${label} must include at least one letter.` };
  if (!PERSON_NAME_CHARS.test(s)) {
    return {
      ok: false,
      message: `${label} may only contain letters, spaces, apostrophes ('), hyphens, and periods.`,
    };
  }
  const noSep = s.replace(/[\s'.-]/g, '');
  if (noSep.length > 0 && /^\p{Nd}+$/u.test(noSep)) {
    return { ok: false, message: `${label} cannot be only numbers.` };
  }
  return { ok: true };
}

export function optionalPersonName(v: string, max: number, label: string): VResult {
  const s = v.trim();
  if (!s) return { ok: true };
  if (s.length > max) return { ok: false, message: `${label} must be at most ${max} characters.` };
  if (!HAS_LETTER.test(s)) return { ok: false, message: `${label} must include at least one letter when provided.` };
  if (!PERSON_NAME_CHARS.test(s)) {
    return {
      ok: false,
      message: `${label} may only contain letters, spaces, apostrophes ('), hyphens, and periods.`,
    };
  }
  const noSep = s.replace(/[\s'.-]/g, '');
  if (/^\p{Nd}+$/u.test(noSep)) return { ok: false, message: `${label} cannot be only numbers.` };
  return { ok: true };
}

/** @deprecated Use personNameRequired(v, 'First name') — kept for imports */
export function firstNameRequired(v: string): VResult {
  return personNameRequired(v, 'First name');
}

export function optionalNameMax(v: string, max: number, label: string): VResult {
  if (v.trim().length > max) return { ok: false, message: `${label} must be at most ${max} characters.` };
  return { ok: true };
}

export function optionalEmail(v: string): VResult {
  const s = v.trim();
  if (!s) return { ok: true };
  if (s.length > 100) return { ok: false, message: 'Email must be at most 100 characters.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { ok: false, message: 'Enter a valid email address.' };
  return { ok: true };
}

export function optionalPhone(v: string): VResult {
  const s = v.trim();
  if (!s) return { ok: true };
  if (s.length > 20) return { ok: false, message: 'Phone must be at most 20 characters.' };
  if (!/^[\d\s+().-]+$/.test(s)) return { ok: false, message: 'Phone may only contain digits and + ( ) . - spaces.' };
  const digits = s.replace(/\D/g, '');
  if (digits.length < 7) return { ok: false, message: 'Phone must include at least 7 digits.' };
  return { ok: true };
}

export function optionalGenderText(v: string): VResult {
  const s = v.trim();
  if (!s) return { ok: true };
  if (s.length > 20) return { ok: false, message: 'Gender must be at most 20 characters.' };
  return { ok: true };
}

export function appointmentDateYmd(v: string): VResult {
  if (!v?.trim()) return { ok: false, message: 'Date is required (YYYY-MM-DD).' };
  if (!YMD.test(v.trim())) return { ok: false, message: 'Use date format YYYY-MM-DD.' };
  return { ok: true };
}

export function optionalDobYmd(v: string): VResult {
  const s = v.trim();
  if (!s) return { ok: true };
  if (!YMD.test(s)) return { ok: false, message: 'Date of birth must be YYYY-MM-DD or empty.' };
  return { ok: true };
}

export function optionalAddress(v: string): VResult {
  if (v.trim().length > 255) return { ok: false, message: 'Address must be at most 255 characters.' };
  return { ok: true };
}

export function optionalCity(v: string): VResult {
  if (v.trim().length > 50) return { ok: false, message: 'City must be at most 50 characters.' };
  return { ok: true };
}

export function optionalMrn(v: string): VResult {
  if (v.trim().length > 30) return { ok: false, message: 'MRN must be at most 30 characters.' };
  return { ok: true };
}

export function locationMax100(v: string): VResult {
  if (v.trim().length > 100) return { ok: false, message: 'Location must be at most 100 characters.' };
  return { ok: true };
}

export function notesMax255(v: string): VResult {
  if (v.trim().length > 255) return { ok: false, message: 'Notes must be at most 255 characters.' };
  return { ok: true };
}

/** Mobile app supports `sd` (Sindhi); staff web may use en/ur only — allow all three. */
export function preferredLanguageCode(v: string): VResult {
  const s = (v.trim().toLowerCase() || 'en') as string;
  if (!['en', 'ur', 'sd'].includes(s)) return { ok: false, message: 'Language must be en, ur, or sd.' };
  return { ok: true };
}

export function firstError(...results: VResult[]): string | undefined {
  for (const r of results) {
    if (!r.ok) return r.message;
  }
  return undefined;
}

