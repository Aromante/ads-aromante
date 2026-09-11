import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Wait for initial session load
  if (auth.loading()) {
    await new Promise<void>(resolve => {
      const check = setInterval(() => {
        if (!auth.loading()) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });
  }

  if (auth.isAuthenticated) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
