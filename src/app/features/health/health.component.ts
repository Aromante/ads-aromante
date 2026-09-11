import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../core/services/supabase.service';
import { SyncRun, ApiBudget } from '../../core/models/meta.models';

@Component({
  selector: 'app-health',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './health.component.html',
  styleUrl: './health.component.scss'
})
export class HealthComponent implements OnInit {
  private supa = inject(SupabaseService);

  loading = true;
  error = '';
  runs: SyncRun[] = [];
  budget: ApiBudget[] = [];
  lastRun: SyncRun | null = null;

  async ngOnInit() {
    try {
      const [runs, budget] = await Promise.all([
        this.supa.selectWithFilter<SyncRun>(
          'meta_ads_sync_runs', '*',
          q => q.order('started_at', { ascending: false }).limit(20)
        ),
        this.supa.selectWithFilter<ApiBudget>(
          'meta_api_budget', '*',
          q => q.order('dia_mzt', { ascending: false }).limit(14)
        )
      ]);

      this.runs = runs;
      this.budget = budget;
      this.lastRun = runs[0] ?? null;
    } catch (e: any) {
      this.error = e.message ?? 'Error loading health data';
    } finally {
      this.loading = false;
    }
  }

  fmt(n: number, d = 0): string {
    return n.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  fmtPct(n: number): string { return n.toFixed(1) + '%'; }

  timeSince(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Hace menos de 1 hora';
    if (hours < 24) return `Hace ${hours}h`;
    return `Hace ${Math.floor(hours / 24)}d`;
  }
}
