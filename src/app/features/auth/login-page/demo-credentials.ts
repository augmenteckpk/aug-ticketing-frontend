/**
 * Demo logins — plaintext matches `seeders/20250410000008-seed-demo-users-patient.js` (see `up()` console.log).
 * `opd-seed-data.cjs` only stores bcrypt hashes, not these strings.
 */
export type DemoLoginAccount = { username: string; password: string; role: string };

export const DEMO_LOGIN_ACCOUNTS: readonly DemoLoginAccount[] = [
  { username: 'admin', password: 'Admin@123', role: 'admin' },
  { username: 'greeter', password: 'Greeter@123', role: 'greeter' },
  { username: 'clerk', password: 'Clerk@123', role: 'registration_clerk' },
  { username: 'coordinator', password: 'Coordinator@123', role: 'opd_coordinator' },
  { username: 'physician', password: 'Physician@123', role: 'physician' },
  { username: 'labtech', password: 'LabTech@123', role: 'lab_technician' },
  { username: 'patient1', password: 'Patient@123', role: 'patient' },
];
