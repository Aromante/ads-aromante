import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { User, Session } from '@supabase/supabase-js';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supa = inject(SupabaseService);

  readonly user = signal<User | null>(null);
  readonly loading = signal(true);

  constructor() {
    // Restore session on init
    this.supa.client.auth.getSession().then(({ data }) => {
      this.user.set(data.session?.user ?? null);
      this.loading.set(false);
    });

    // Listen for auth changes
    this.supa.client.auth.onAuthStateChange((_event, session) => {
      this.user.set(session?.user ?? null);
      this.loading.set(false);
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
