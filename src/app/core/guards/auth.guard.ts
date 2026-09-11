import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Wait for initial session restoration to complete
  await auth.initialized;

  if (auth.isAuthenticated) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
