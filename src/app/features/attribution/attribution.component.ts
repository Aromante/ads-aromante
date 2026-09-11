import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { CacheService } from '../../core/services/cache.service';
import { InsightDaily } from '../../core/models/meta.models';

interface AttrRow {
  ad_id: string;
  ad_name: string;
  roas_7d_click: number;
  roas_1d_click: number;
  roas_1d_view: number;
  view_dependency: number;
  spend: number;
}

@Component({
  selector: 'app-attribution',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './attribution.component.html',
  styleUrl: './attribution.component.scss'
})
export class AttributionComponent implements OnInit {
  private supa = inject(SupabaseService);
  private cache = inject(CacheService);
  private router = inject(Router);

  loading = true;
  error = '';
  allRows: AttrRow[] = [];
  search = '';
  page = 1;
  readonly PAGE_SIZE = 20;
  sortField = 'view_dependency';
  sortDir: 'asc' | 'desc' = 'desc';

  get rows(): AttrRow[] {
    if (!this.search) return this.allRows;
    const q = this.search.toLowerCase();
    return this.allRows.filter(r => r.ad_name.toLowerCase().includes(q));
  }
  get paged(): AttrRow[] {
    return this.rows.slice((this.page - 1) * this.PAGE_SIZE, this.page * this.PAGE_SIZE);
  }
  get pages(): number { return Math.ceil(this.rows.length / this.PAGE_SIZE); }
  onSearch() { this.page = 1; }

  async ngOnInit() {
    try {
      let raw = this.cache.get<InsightDaily[]>('daily_final');
      if (!raw) {
        raw = await this.supa.select<InsightDaily>('meta_ads_daily_final');
        this.cache.set('daily_final', raw);
      }

      const byAd = new Map<string, { windows: Record<string, { spend: number; revenue: number }> }>();

      for (const r of raw) {
        if (!byAd.has(r.ad_id)) {
          byAd.set(r.ad_id, { windows: {} });
        }
        const entry = byAd.get(r.ad_id)!;
        const w = r.attribution_window ?? '7d_click';
        if (!entry.windows[w]) entry.windows[w] = { spend: 0, revenue: 0 };
        entry.windows[w].spend += r.spend ?? 0;
        entry.windows[w].revenue += r.purchase_value ?? 0;
      }

      // Get ad names from dim
      const dims = await this.supa.selectWithFilter<any>(
        'meta_ads_dim', 'ad_id,ad_name',
        q => q.is('valid_to', null)
      );
      const nameMap = new Map(dims.map((d: any) => [d.ad_id, d.ad_name]));

      this.allRows = [];
      for (const [adId, data] of byAd) {
        const w7c = data.windows['7d_click'] ?? { spend: 0, revenue: 0 };
        const w1c = data.windows['1d_click'] ?? { spend: 0, revenue: 0 };
        const w1v = data.windows['1d_view'] ?? { spend: 0, revenue: 0 };

        if (w7c.spend === 0) continue;

        const roas7c = w7c.revenue / w7c.spend;
        const roas1c = w1c.spend > 0 ? w1c.revenue / w1c.spend : 0;
        const roas1v = w1v.spend > 0 ? w1v.revenue / w1v.spend : 0;
        const viewDep = w7c.revenue > 0 ? ((w7c.revenue - w1c.revenue) / w7c.revenue) * 100 : 0;

        this.allRows.push({
          ad_id: adId,
          ad_name: nameMap.get(adId) ?? adId,
          roas_7d_click: roas7c,
          roas_1d_click: roas1c,
          roas_1d_view: roas1v,
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
    this.allRows.sort((a: any, b: any) => ((a[field] ?? 0) - (b[field] ?? 0)) * dir);
  }

  goToAd(adId: string) { this.router.navigate(['/ad', adId]); }

  fmt(n: number, d = 2): string {
    return n.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  fmtMoney(n: number): string {
    return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  fmtPct(n: number): string { return n.toFixed(1) + '%'; }
}
