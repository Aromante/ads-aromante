import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';

interface AttrRow {
  ad_id: string;
  ad_name: string;
  roas_7d_click: number;
  roas_1d_click: number;
  roas_1d_view: number;
  revenue_7d_click: number;
  revenue_1d_view: number;
  view_dependency: number; // % of revenue from view attribution
  spend: number;
}

@Component({
  selector: 'app-attribution',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './attribution.component.html',
  styleUrl: './attribution.component.scss'
})
export class AttributionComponent implements OnInit {
  private supa = inject(SupabaseService);
  private router = inject(Router);

  loading = true;
  error = '';
  rows: AttrRow[] = [];
  sortField = 'view_dependency';
  sortDir: 'asc' | 'desc' = 'desc';

  async ngOnInit() {
    try {
      const raw = await this.supa.select<any>('meta_ads_daily_final', '*');

      // Group by ad_id, sum by attribution_window
      const byAd = new Map<string, { name: string; windows: Record<string, { spend: number; revenue: number; purchases: number }> }>();

      for (const r of raw) {
        if (!byAd.has(r.ad_id)) {
          byAd.set(r.ad_id, { name: r.ad_name ?? r.ad_id, windows: {} });
        }
        const entry = byAd.get(r.ad_id)!;
        const w = r.attribution_window ?? '7d_click';
        if (!entry.windows[w]) {
          entry.windows[w] = { spend: 0, revenue: 0, purchases: 0 };
        }
        entry.windows[w].spend += r.spend ?? 0;
        entry.windows[w].revenue += r.revenue ?? 0;
        entry.windows[w].purchases += r.purchases ?? 0;
      }

      this.rows = [];
      for (const [adId, data] of byAd) {
        const w7c = data.windows['7d_click'] ?? { spend: 0, revenue: 0, purchases: 0 };
        const w1c = data.windows['1d_click'] ?? { spend: 0, revenue: 0, purchases: 0 };
        const w1v = data.windows['1d_view'] ?? { spend: 0, revenue: 0, purchases: 0 };

        if (w7c.spend === 0) continue;

        const roas7c = w7c.spend > 0 ? w7c.revenue / w7c.spend : 0;
        const roas1c = w1c.spend > 0 ? w1c.revenue / w1c.spend : 0;
        const roas1v = w1v.spend > 0 ? w1v.revenue / w1v.spend : 0;

        // View dependency: what % of 7d_click revenue is NOT in 1d_click
        const viewDep = w7c.revenue > 0 ? ((w7c.revenue - w1c.revenue) / w7c.revenue) * 100 : 0;

        this.rows.push({
          ad_id: adId,
          ad_name: data.name,
          roas_7d_click: roas7c,
          roas_1d_click: roas1c,
          roas_1d_view: roas1v,
          revenue_7d_click: w7c.revenue,
          revenue_1d_view: w1v.revenue,
          view_dependency: viewDep,
          spend: w7c.spend
        });
      }

      this.sort('view_dependency');
    } catch (e: any) {
      this.error = e.message ?? 'Error loading attribution data';
    } finally {
      this.loading = false;
    }
  }

  sort(field: string) {
    if (this.sortField === field) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDir = 'desc';
    }
    const dir = this.sortDir === 'asc' ? 1 : -1;
    this.rows.sort((a: any, b: any) => ((a[field] ?? 0) - (b[field] ?? 0)) * dir);
  }

  goToAd(adId: string) {
    this.router.navigate(['/ad', adId]);
  }

  fmt(n: number, d = 2): string {
    return n.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  fmtMoney(n: number): string {
    return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  fmtPct(n: number): string {
    return n.toFixed(1) + '%';
  }
}
