export function cnicDigits(raw: string): string {
  return String(raw ?? '').replace(/\D/g, '').slice(0, 13);
}

export function formatCnicDashedFromDigits(digits: string): string {
  const d = cnicDigits(digits);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

/** Keep at most 13 digits and format as `12345-1234567-1` while typing. */
export function normalizeCnicInput(raw: string): string {
  return formatCnicDashedFromDigits(cnicDigits(raw));
}

export function isValidCnic13(raw: string): boolean {
  return cnicDigits(raw).length === 13;
}

/** True when the scan text looks like a 32-char visit barcode token (patient app CODE128 payload). */
export function isProbableVisitBarcodeScan(raw: string): boolean {
  const n = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  return /[0-9a-f]{32}/.test(n);
}

/**
 * Extract a 13-digit CNIC from scanner output (PDF417 / manual paste / long numeric strings).
 * Returns null for visit-barcode-like payloads so callers can show the right message.
 */
export function extractCnicDigitsFromScan(raw: string): string | null {
  if (isProbableVisitBarcodeScan(raw)) return null;
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 13) return digits;
  if (digits.length < 13) return null;
  for (let i = digits.length - 13; i >= 0; i--) {
    const chunk = digits.slice(i, i + 13);
    if (chunk.length === 13) return chunk;
  }
  return null;
}

