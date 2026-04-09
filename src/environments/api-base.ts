import { environment } from './environment';

const API_PORT = 3001;

/**
 * Base URL for the REST API (no `/api/v1`, no trailing slash).
 *
 * In **development**, if you open the staff app from a phone using your PC's LAN IP
 * (e.g. `http://192.168.1.10:4200`), requests must go to `http://192.168.1.10:3001`, not
 * `localhost` (which on the phone is the phone itself).
 */
export function resolveApiBaseUrl(): string {
  const configured = (environment.apiUrl ?? `http://localhost:${API_PORT}`).replace(/\/$/, '');

  if (environment.production) {
    return configured;
  }

  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h && h !== 'localhost' && h !== '127.0.0.1') {
      const proto = window.location.protocol === 'https:' ? 'https' : 'http';
      return `${proto}://${h}:${API_PORT}`;
    }
  }

  return configured;
}
