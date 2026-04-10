import { environment } from './environment';

/**
 * Base URL for the REST API (no `/api/v1`, no trailing slash).
 * Set `apiUrl` in `environment.ts` / `environment.development.ts`.
 */
export function resolveApiBaseUrl(): string {
  return (environment.apiUrl ?? 'http://localhost:3001').replace(/\/$/, '');
}
