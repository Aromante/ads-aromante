import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { CacheService } from '../../core/services/cache.service';
import { PasskeyService } from '../../core/services/passkey.service';
import { DashboardAd } from '../../core/models/meta.models';

type StatusFilter = 'all' | 'active' | 'paused';
type SortDir = 'asc' | 'desc';

interface AggMetrics {
  spend_7d: number;
  value_7d: number;
  purchases: number;
  roas: number;
  cpa: number | null;
  aov: number | null;
  ctr_avg: number;
  freq_avg: number;
  adCount: number;
}

interface AdSetGroup {
  name: string;
  metrics: AggMetrics;
  ads: DashboardAd[];
  expanded: boolean;
}

interface CampaignGroup {
  name: string;
  metrics: AggMetrics;
  adsets: AdSetGroup[];
  expanded: boolean;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  private supa = inject(SupabaseService);
  private cache = inject(CacheService);
  private router = inject(Router);
  private passkey = inject(PasskeyService);

  showPasskeyBanner = signal(false);
  passkeyRegistering = signal(false);
  passkeyError = signal('');

  loading = true;
  error = '';

  private allAds: DashboardAd[] = [];

  search = signal('');
  statusFilter = signal<StatusFilter>('active');
  sortField = 'spend_7d';
  sortDir: SortDir = 'desc';

  activeCount = 0;
  pausedCount = 0;

  // KPIs
  totalSpend = 0;
  totalValue = 0;
  totalPurchases = 0;
  blendedRoas = 0;
  blendedCpa = 0;
  totalExcess = 0;

  // Hierarchical data
  campaigns: CampaignGroup[] = [];

  async ngOnInit() {
    try {
      let rows = this.cache.get<DashboardAd[]>('dashboard_mat');
      if (!rows) {
        rows = await this.supa.select<DashboardAd>('meta_dashboard_mat');
        this.cache.set('dashboard_mat', rows);
      }

      this.allAds = rows;
      this.activeCount = rows.filter(a => a.effective_status === 'ACTIVE').length;
      this.pausedCount = rows.length - this.activeCount;
      this.applyFilters();

      if (window.PublicKeyCredential) {
        const has = await this.passkey.hasPasskey();
        this.showPasskeyBanner.set(!has);
      }
    } catch (e: any) {
      this.error = e.message ?? 'Error loading data';
    } finally {
      this.loading = false;
    }
  }

  applyFilters() {
    let list = this.allAds;

    const sf = this.statusFilter();
    if (sf === 'active') list = list.filter(a => a.effective_status === 'ACTIVE');
    else if (sf === 'paused') list = list.filter(a => a.effective_status !== 'ACTIVE');

    const q = this.search().toLowerCase();
    if (q) {
      list = list.filter(a =>
        a.ad_name?.toLowerCase().includes(q) ||
        a.campaign_name?.toLowerCase().includes(q) ||
        a.adset_name?.toLowerCase().includes(q) ||
        a.ad_id.includes(q)
      );
    }

    // Sort ads
    const dir = this.sortDir === 'asc' ? 1 : -1;
    const field = this.sortField;
    list = [...list].sort((a: any, b: any) => ((a[field] ?? 0) - (b[field] ?? 0)) * dir);

    // KPIs
    this.totalSpend = list.reduce((s, a) => s + (a.spend_7d ?? 0), 0);
    this.totalValue = list.reduce((s, a) => s + (a.value_7d ?? 0), 0);
    this.totalPurchases = list.reduce((s, a) => s + (a.purchases_default ?? a.purchases_7d ?? 0), 0);
    this.blendedRoas = this.totalSpend > 0 ? this.totalValue / this.totalSpend : 0;
    this.blendedCpa = this.totalPurchases > 0 ? this.totalSpend / this.totalPurchases : 0;
    this.totalExcess = list.reduce((s, a) => s + (a.spend_excess > 0 ? a.spend_excess : 0), 0);

    // Build hierarchy
    this.campaigns = this.buildHierarchy(list);
  }

  private buildHierarchy(ads: DashboardAd[]): CampaignGroup[] {
    const campMap = new Map<string, Map<string, DashboardAd[]>>();

    for (const ad of ads) {
      const campKey = ad.campaign_name ?? 'Sin campaña';
      const adsetKey = ad.adset_name ?? 'Sin ad set';

      if (!campMap.has(campKey)) campMap.set(campKey, new Map());
      const adsetMap = campMap.get(campKey)!;
      if (!adsetMap.has(adsetKey)) adsetMap.set(adsetKey, []);
      adsetMap.get(adsetKey)!.push(ad);
    }

    const campaigns: CampaignGroup[] = [];

    for (const [campName, adsetMap] of campMap) {
      const adsets: AdSetGroup[] = [];

      for (const [adsetName, adsetAds] of adsetMap) {
        adsets.push({
          name: adsetName,
          metrics: this.aggregate(adsetAds),
          ads: adsetAds,
          expanded: false
        });
      }

      // Sort adsets by spend desc
      adsets.sort((a, b) => b.metrics.spend_7d - a.metrics.spend_7d);

      const allAdsInCamp = adsets.flatMap(a => a.ads);
      campaigns.push({
        name: campName,
        metrics: this.aggregate(allAdsInCamp),
        adsets,
        expanded: false
      });
    }

    // Sort campaigns by spend desc
    campaigns.sort((a, b) => b.metrics.spend_7d - a.metrics.spend_7d);

    // Auto-expand if only 1 campaign or if searching
    if (campaigns.length === 1 || this.search()) {
      campaigns.forEach(c => {
        c.expanded = true;
        if (c.adsets.length === 1 || this.search()) {
          c.adsets.forEach(a => a.expanded = true);
        }
      });
    }

    return campaigns;
  }

  private aggregate(ads: DashboardAd[]): AggMetrics {
    const spend = ads.reduce((s, a) => s + (a.spend_7d ?? 0), 0);
    const value = ads.reduce((s, a) => s + (a.value_7d ?? 0), 0);
    const purchases = ads.reduce((s, a) => s + (a.purchases_default ?? a.purchases_7d ?? 0), 0);
    const withCtr = ads.filter(a => a.ctr_7d > 0);
    const withFreq = ads.filter(a => a.freq_recent > 0);

    return {
      spend_7d: spend,
      value_7d: value,
      purchases,
      roas: spend > 0 ? value / spend : 0,
      cpa: purchases > 0 ? spend / purchases : null,
      aov: purchases > 0 ? value / purchases : null,
      ctr_avg: withCtr.length > 0 ? withCtr.reduce((s, a) => s + a.ctr_7d, 0) / withCtr.length : 0,
      freq_avg: withFreq.length > 0 ? withFreq.reduce((s, a) => s + a.freq_recent, 0) / withFreq.length : 0,
      adCount: ads.length
    };
  }

  toggleCampaign(c: CampaignGroup) { c.expanded = !c.expanded; }
  toggleAdset(a: AdSetGroup) { a.expanded = !a.expanded; }

  sort(field: string) {
    if (this.sortField === field) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDir = 'desc';
    }
    this.applyFilters();
  }

  onSearchChange(value: string) { this.search.set(value); this.applyFilters(); }
  setStatusFilter(f: StatusFilter) { this.statusFilter.set(f); this.applyFilters(); }
  goToAd(adId: string) { this.router.navigate(['/ad', adId]); }

  statusLabel(s: string): string {
    const m: Record<string, string> = {
      'ACTIVE': 'Activo', 'PAUSED': 'Pausado', 'CAMPAIGN_PAUSED': 'Camp. pausada',
      'ADSET_PAUSED': 'Adset pausado', 'DISAPPROVED': 'Rechazado', 'WITH_ISSUES': 'Con problemas'
    };
    return m[s] ?? s;
  }

  statusClass(s: string): string {
    if (s === 'ACTIVE') return 'badge-green';
    if (s === 'DISAPPROVED' || s === 'WITH_ISSUES') return 'badge-red';
    return 'badge-gray';
  }

  confidenceIcon(purchases: number | null): string {
    const p = purchases ?? 0;
    if (p >= 15) return '🛡️';
    if (p >= 10) return '⚠️';
    return '🔬';
  }

  fmt(n: number | null | undefined, d = 2): string {
    if (n == null) return '—';
    return n.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  fmtMoney(n: number | null | undefined): string {
    if (n == null) return '—';
    return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  fmtPct(n: number | null | undefined): string {
    if (n == null) return '—';
    return n.toFixed(2) + '%';
  }

  sortIcon(field: string): string {
    if (this.sortField !== field) return '';
    return this.sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  async registerPasskey() {
    this.passkeyRegistering.set(true);
    this.passkeyError.set('');
    const r = await this.passkey.registerPasskey();
    if (r.success) this.showPasskeyBanner.set(false);
    else this.passkeyError.set(r.error ?? 'Error');
    this.passkeyRegistering.set(false);
  }

  dismissPasskeyBanner() { this.showPasskeyBanner.set(false); }
}
