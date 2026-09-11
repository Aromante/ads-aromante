import { Injectable } from '@angular/core';

export type AuthGroup = 'meta';

const PINS: Record<AuthGroup, string> = {
  meta: '5523'
};

export const GROUP_DEFAULT_ROUTE: Record<AuthGroup, string> = {
  meta: '/dashboard'
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private unlocked = new Set<AuthGroup>();

  isUnlocked(group: AuthGroup): boolean {
    return this.unlocked.has(group);
  }

  unlock(group: AuthGroup, pin: string): boolean {
    if (PINS[group] === pin) {
      this.unlocked.add(group);
      return true;
    }
    return false;
  }
}
