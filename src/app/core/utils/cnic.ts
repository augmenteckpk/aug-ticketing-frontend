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

