import { ApplicationRef, Injectable, inject } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient;
  private appRef = inject(ApplicationRef);

  constructor() {
    this.client = createClient(
      environment.supabase.url,
      environment.supabase.anonKey,
      { auth: { persistSession: true, autoRefreshToken: true } }
    );
  }

  /** Trigger change detection after async completes */
  private tick() {
    this.appRef.tick();
  }

  async select<T = any>(view: string, columns = '*'): Promise<T[]> {
    const { data, error } = await this.client.from(view).select(columns);
    this.tick();
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
    const { data, error } = await query;
    this.tick();
    if (error) throw error;
    return (data ?? []) as T[];
  }

  async rpc<T = any>(fn: string, params?: Record<string, any>): Promise<T> {
    const { data, error } = await this.client.rpc(fn, params);
    this.tick();
    if (error) throw error;
    return data as T;
  }

  /** For direct client usage — call after any await on client */
  triggerUpdate() {
    this.tick();
  }
}
