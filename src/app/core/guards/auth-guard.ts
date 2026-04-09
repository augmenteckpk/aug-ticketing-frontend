import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.loading()) {
    await auth.bootstrap();
  }

  const user = auth.user();
  if (!user) {
    await router.navigate(['/login']);
    return false;
  }

  if (user.role === 'patient') {
    auth.logout();
    await router.navigate(['/login']);
    return false;
  }

  return true;
};
