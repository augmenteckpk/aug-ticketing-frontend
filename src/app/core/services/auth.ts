import { Injectable, computed, signal } from '@angular/core';
import { ApiService, getToken, setToken } from './api';

export type MeResponse = {
  id: number;
  username: string;
  email: string | null;
  phone: string | null;
  status: string;
  role: string;
  role_id: number;
  patient_id: number | null;
  permissions: string[];
};

type LoginResponse = {
  token: string;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user = signal<MeResponse | null>(null);
  private readonly _loading = signal<boolean>(true);

  readonly user = computed(() => this._user());
  readonly loading = computed(() => this._loading());

  constructor(private readonly api: ApiService) {}

  async bootstrap(): Promise<void> {
    this._loading.set(true);
    try {
      if (!getToken()) {
        this._user.set(null);
        return;
      }
      const me = await this.api.get<MeResponse>('/auth/me');
      this._user.set(me);
    } catch {
      setToken(null);
      this._user.set(null);
    } finally {
      this._loading.set(false);
    }
  }

  async login(username: string, password: string): Promise<void> {
    const res = await this.api.post<LoginResponse>('/auth/login', {
      username,
      password,
      staff_console: true,
    });
    setToken(res.token);
    const me = await this.api.get<MeResponse>('/auth/me');
    this._user.set(me);
  }

  logout(): void {
    setToken(null);
    this._user.set(null);
  }

  can(permission: string): boolean {
    return this._user()?.permissions?.includes(permission) ?? false;
  }
}
