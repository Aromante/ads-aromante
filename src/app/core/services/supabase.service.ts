import { Injectable, inject, signal, ChangeDetectorRef, ApplicationRef } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient;
  private appRef = inject(ApplicationRef);

  /** Incremented after every query to force signal-based change detection */
  readonly queryCount = signal(0);

  constructor() {
    this.client = createClient(
      environment.supabase.url,
      environment.supabase.anonKey,
      { auth: { persistSession: true, autoRefreshToken: true } }
    );
  }

  private notify() {
    this.queryCount.update(n => n + 1);
    // Force a full application tick for template bindings
    setTimeout(() => this.appRef.tick(), 0);
  }

  async select<T = any>(view: string, columns = '*'): Promise<T[]> {
    const { data, error } = await this.client.from(view).select(columns);
    this.notify();
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
    this.notify();
    if (error) throw error;
    return (data ?? []) as T[];
  }

  async rpc<T = any>(fn: string, params?: Record<string, any>): Promise<T> {
    const { data, error } = await this.client.rpc(fn, params);
    this.notify();
    if (error) throw error;
    return data as T;
  }
}
