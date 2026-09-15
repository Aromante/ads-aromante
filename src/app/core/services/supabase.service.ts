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

  async select<T = any>(view: string, columns = '*'): Promise<T[]> {
    const result = await this.zone.run(() =>
      this.client.from(view).select(columns).then(r => r)
    );
    if (result.error) throw result.error;
    return (result.data ?? []) as T[];
  }

  async selectWithFilter<T = any>(
    view: string,
    columns: string,
    filter: (query: any) => any
  ): Promise<T[]> {
    let query = this.client.from(view).select(columns);
    query = filter(query);
    const result = await this.zone.run(() => query.then((r: any) => r));
    if (result.error) throw result.error;
    return (result.data ?? []) as T[];
  }

  async rpc<T = any>(fn: string, params?: Record<string, any>): Promise<T> {
    const result = await this.zone.run(() =>
      this.client.rpc(fn, params).then(r => r)
    );
    if (result.error) throw result.error;
    return result.data as T;
  }
}
