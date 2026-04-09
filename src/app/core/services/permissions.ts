import { Injectable } from '@angular/core';
import { AuthService } from './auth';

@Injectable({ providedIn: 'root' })
export class PermissionsService {
  constructor(private readonly auth: AuthService) {}

  can(permission?: string): boolean {
    if (!permission) return true;
    return this.auth.can(permission);
  }
}
