import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { User, Session } from '@supabase/supabase-js';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supa = inject(SupabaseService);

  readonly user = signal<User | null>(null);
  readonly ready = signal(false);

  /** Resolves when the initial session check completes */
  readonly initialized: Promise<void>;

  constructor() {
    this.initialized = this.init();
  }

  private async init() {
    // Try to restore existing session
    const { data } = await this.supa.client.auth.getSession();
    this.user.set(data.session?.user ?? null);
    this.ready.set(true);

    // Listen for future auth changes (token refresh, sign out, etc.)
    this.supa.client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        this.user.set(null);
      } else if (session?.user) {
        this.user.set(session.user);
      }
    });
  }

  get isAuthenticated(): boolean {
    return this.user() !== null;
  }

  async sendMagicLink(email: string): Promise<{ error: string | null }> {
    if (!email.endsWith('@aromante.mx')) {
      return { error: 'Solo emails @aromante.mx pueden acceder' };
    }
    const { error } = await this.supa.client.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin + '/dashboard'
      }
    });
    if (error) return { error: error.message };
    return { error: null };
  }

  async signOut(): Promise<void> {
    await this.supa.client.auth.signOut();
    this.user.set(null);
  }

  async getSession(): Promise<Session | null> {
    const { data } = await this.supa.client.auth.getSession();
    return data.session;
  }
}
