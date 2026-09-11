import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, AuthGroup } from '../services/auth.service';

export const authGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const group = route.data['authGroup'] as AuthGroup;

  if (auth.isUnlocked(group)) {
    return true;
  }

  return router.createUrlTree(['/lock', group]);
};
