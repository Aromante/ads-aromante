import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { FloorCompliance } from '../../core/models/meta.models';

interface DecisionAd {
  ad_id: string;
  ad_name: string;
  campaign_name: string;
  spend_cum: number;
  purchases_cum: number;
  roas_7d: number;
  roas_cum: number;
  roas_diff: number;
  consecutive_below: number;
  frequency_7d: number;
  spend_excess: number;
  action: 'kill' | 'reduce' | 'scale';
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  private supa = inject(SupabaseService);
  private router = inject(Router);

  loading = true;
  error = '';

  killList: DecisionAd[] = [];
  reduceList: DecisionAd[] = [];
  scaleList: DecisionAd[] = [];

  // KPIs
  totalSpend = 0;
  totalPurchases = 0;
  activeAds = 0;
  avgRoas7d = 0;

  // CPA target from meta_ads_config: breakeven 1.41x -> CPA ~$425
  readonly CPA_TARGET = 425;
  readonly FLOOR_ROAS = 1.41;

  sortField = 'spend_excess';
  sortDir: 'asc' | 'desc' = 'desc';

  async ngOnInit() {
    try {
      const rows = await this.supa.selectWithFilter<FloorCompliance>(
        'meta_floor_compliance',
        '*',
        q => q.eq('matured', true).eq('attribution_window', '7d_click')
      );

      this.classify(rows);
      this.computeKpis(rows);
    } catch (e: any) {
      this.error = e.message ?? 'Error loading data';
    } finally {
      this.loading = false;
    }
  }

  private classify(rows: FloorCompliance[]) {
    // Dedupe: keep latest date per ad_id
    const byAd = new Map<string, FloorCompliance>();
    for (const r of rows) {
      const existing = byAd.get(r.ad_id);
      if (!existing || r.date > existing.date) {
        byAd.set(r.ad_id, r);
      }
    }

    for (const r of byAd.values()) {
      const base: DecisionAd = {
        ad_id: r.ad_id,
        ad_name: r.ad_name,
        campaign_name: r.campaign_name,
        spend_cum: r.spend_cum,
        purchases_cum: r.purchases_cum,
        roas_7d: r.roas_7d,
        roas_cum: r.roas_cum,
        roas_diff: r.roas_diff,
        consecutive_below: r.consecutive_below,
        frequency_7d: r.frequency_7d,
        spend_excess: r.spend_excess,
        action: 'scale'
      };

      // Kill: spent > 3x CPA target with 0 purchases
      if (r.spend_cum > 3 * this.CPA_TARGET && r.purchases_cum === 0) {
        base.action = 'kill';
        this.killList.push(base);
      }
      // Reduce: rolling below cumulative 7+ days, or frequency > 3.5
      else if (r.consecutive_below >= 7 || r.frequency_7d > 3.5) {
        base.action = 'reduce';
        this.reduceList.push(base);
      }
      // Scale: ROAS >= floor sustained, >=10 purchases, frequency < 3.0
      else if (r.roas_7d >= this.FLOOR_ROAS && r.purchases_cum >= 10 && r.frequency_7d < 3.0) {
        base.action = 'scale';
        this.scaleList.push(base);
      }
    }

    this.killList.sort((a, b) => b.spend_cum - a.spend_cum);
    this.reduceList.sort((a, b) => b.consecutive_below - a.consecutive_below);
    this.scaleList.sort((a, b) => b.roas_7d - a.roas_7d);
  }

  private computeKpis(rows: FloorCompliance[]) {
    const byAd = new Map<string, FloorCompliance>();
    for (const r of rows) {
      const existing = byAd.get(r.ad_id);
      if (!existing || r.date > existing.date) {
        byAd.set(r.ad_id, r);
      }
    }

    this.activeAds = byAd.size;
    let totalRoas = 0;
    let count = 0;
    for (const r of byAd.values()) {
      this.totalSpend += r.spend_cum;
      this.totalPurchases += r.purchases_cum;
      if (r.roas_7d > 0) {
        totalRoas += r.roas_7d;
        count++;
      }
    }
    this.avgRoas7d = count > 0 ? totalRoas / count : 0;
  }

  goToAd(adId: string) {
    this.router.navigate(['/ad', adId]);
  }

  fmt(n: number, decimals = 2): string {
    return n.toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  fmtMoney(n: number): string {
    return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
}
