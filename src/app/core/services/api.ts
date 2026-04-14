import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { resolveApiBaseUrl } from '../../../environments/api-base';

const TOKEN_KEY = 'opd_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Backend JSON envelope: `{ data, message, status }`. */
function isApiEnvelope(body: unknown): body is { data: unknown; message: string; status: number } {
  return (
    body !== null &&
    typeof body === 'object' &&
    'data' in body &&
    'message' in body &&
    'status' in body &&
    typeof (body as { message: unknown }).message === 'string' &&
    typeof (body as { status: unknown }).status === 'number'
  );
}

/** Use for raw `fetch` responses (e.g. public display routes). */
export function unwrapApiEnvelope<T>(body: unknown): T {
  if (isApiEnvelope(body)) return body.data as T;
  return body as T;
}

/** Prefer backend `{ message }` (or legacy `{ error }`) — never prepend HTTP method/path (user-facing). */
export function messageFromApiErrorBody(errorBody: unknown, httpStatusText: string): string {
  if (errorBody !== null && typeof errorBody === 'object') {
    const o = errorBody as { message?: unknown; error?: unknown };
    if (typeof o.message === 'string' && o.message.trim()) return o.message.trim();
    if (typeof o.error === 'string' && o.error.trim()) return o.error.trim();
  }
  if (typeof errorBody === 'string' && errorBody.trim()) {
    try {
      const j = JSON.parse(errorBody) as { message?: string; error?: string };
      if (typeof j.message === 'string' && j.message.trim()) return j.message.trim();
      if (typeof j.error === 'string' && j.error.trim()) return j.error.trim();
    } catch {
      return errorBody.trim();
    }
  }
  if (httpStatusText && httpStatusText !== 'Unknown Error') return httpStatusText;
  return 'Request failed';
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private readonly http: HttpClient) {}
  private static readonly REQUEST_TIMEOUT_MS = 5000;

  async request<T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
    const method = init.method ?? 'GET';
    const baseUrl = `${resolveApiBaseUrl()}/api/v1${path}`;
    const url =
      method === 'GET'
        ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}_ts=${Date.now()}`
        : baseUrl;
    try {
      const timeoutMs = init.timeoutMs ?? ApiService.REQUEST_TIMEOUT_MS;
      const stream = this.http.request<T>(method, url, { body: init.body as object | undefined }).pipe(timeout(timeoutMs));
      const response = await firstValueFrom(stream);
      return unwrapApiEnvelope<T>(response as unknown);
    } catch (e) {
      throw this.toApiError(e, method, path);
    }
  }

  get<T>(path: string, timeoutMs?: number): Promise<T> {
    return this.request<T>(path, { method: 'GET', timeoutMs });
  }

  post<T>(path: string, body: unknown, timeoutMs?: number): Promise<T> {
    return this.request<T>(path, { method: 'POST', body, timeoutMs });
  }

  patch<T>(path: string, body: unknown, timeoutMs?: number): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body, timeoutMs });
  }

  /** Multipart upload (lab/radiology result files). Do not set Content-Type manually. */
  async postFormData<T>(path: string, formData: FormData, timeoutMs = 120000): Promise<T> {
    const baseUrl = `${resolveApiBaseUrl()}/api/v1${path}`;
    try {
      const stream = this.http.post<T>(baseUrl, formData).pipe(timeout(timeoutMs));
      const response = await firstValueFrom(stream);
      return unwrapApiEnvelope<T>(response as unknown);
    } catch (e) {
      throw this.toApiError(e, 'POST', path);
    }
  }

  /** Binary download (investigation files) — auth via interceptor. */
  async getBlob(path: string, timeoutMs = 60000): Promise<Blob> {
    const baseUrl = `${resolveApiBaseUrl()}/api/v1${path}`;
    const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}_ts=${Date.now()}`;
    try {
      const stream = this.http.get(url, { responseType: 'blob' }).pipe(timeout(timeoutMs));
      return await firstValueFrom(stream);
    } catch (e) {
      throw this.toApiError(e, 'GET', path);
    }
  }

  private toApiError(e: unknown, _method?: string, _path?: string): ApiError {
    if (e instanceof ApiError) return e;
    if (e instanceof HttpErrorResponse) {
      const err = e.error as { error?: string; message?: string; details?: unknown } | null;
      const message = messageFromApiErrorBody(e.error, e.statusText);
      const details = err && typeof err === 'object' && 'details' in err ? err.details : undefined;
      return new ApiError(message, e.status, details);
    }
    return new ApiError(e instanceof Error ? e.message : 'Request failed', 0);
  }
}
