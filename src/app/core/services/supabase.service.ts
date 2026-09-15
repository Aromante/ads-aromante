import { Injectable, NgZone, inject } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient;
  private zone = inject(NgZone);

  constructor() {
    this.client = createClient(
      environment.supabase.url,
      environment.supabase.anonKey,
      { auth: { persistSession: true, autoRefreshToken: true } }
    );
  }

  /** Wraps a promise so it resolves inside Angular's zone */
  private inZone<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      promise.then(
        val => this.zone.run(() => resolve(val)),
        err => this.zone.run(() => reject(err))
      );
    });
  }

  async select<T = any>(view: string, columns = '*'): Promise<T[]> {
    const { data, error } = await this.inZone(this.client.from(view).select(columns));
    if (error) throw error;
    return (data ?? []) as T[];
  }

  async selectWithFilter<T = any>(
    view: string,
    columns: string,
    filter: (query: any) => any
  ): Promise<T[]> {
    let query = this.client.from(view).select(columns);
    query = filter(query);
    const { data, error } = await this.inZone(query);
    if (error) throw error;
    return (data ?? []) as T[];
  }

  async rpc<T = any>(fn: string, params?: Record<string, any>): Promise<T> {
    const { data, error } = await this.inZone(this.client.rpc(fn, params));
    if (error) throw error;
    return data as T;
  }
}
