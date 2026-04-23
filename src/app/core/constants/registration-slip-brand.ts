/** Letterhead text for the patient registration slip (edit per deployment). */
export const REGISTRATION_SLIP_BRAND = {
  instituteLine1: 'Sindh Institute of Urology & Transplantation',
  instituteLine2: 'Outpatient Department',
  /** Optional subtitle under the form title. */
  formSubtitle: 'Patient registration & clinical record',
  /**
   * Letterhead image: place file at `frontend/public/siut-logo.png` (copied to site root by Angular build).
   */
  slipLogoPath: '/siut-logo.png',
} as const;

/** SIUT lab request form (print layout — matches physical stationery). */
export const LAB_REQUEST_FORM = {
  instituteLine1: 'SINDH INSTITUTE OF UROLOGY AND TRANSPLANTATION',
  instituteLine2: 'PAKISTAN',
  title: 'LAB REQUEST FORM',
} as const;

/** SIUT radiology request form (print layout — matches physical stationery). */
export const RADIOLOGY_REQUEST_FORM = {
  instituteLine: 'SINDH INSTITUTE OF UROLOGY AND TRANSPLANTATION KARACHI.',
  title: 'Radiology Request Form',
  departments: [
    'LMP',
    'ALLERGIES',
    'OPD',
    'UROLOGY',
    'NEPHROLOGY',
    'DIALYSIS',
    'SICU / TICU / MICU',
    'EMERGENCY',
    'LITHOTRIPSY',
  ] as const,
  transportOptions: ['PORTABLE', 'WHEEL CHAIR', 'WALK', 'TROLLY'] as const,
} as const;
