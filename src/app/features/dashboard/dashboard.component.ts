import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { CacheService } from '../../core/services/cache.service';
import { PasskeyService } from '../../core/services/passkey.service';
import { DashboardAd } from '../../core/models/meta.models';

type StatusFilter = 'all' | 'active' | 'paused';

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
  loadingMore = false;
  error = '';

  // Data stores by status
  private activeAds: DashboardAd[] = [];
  private pausedAds: DashboardAd[] = [];
  private pausedLoaded = false;

  search = signal('');
  statusFilter = signal<StatusFilter>('active');

  activeCount = 0;
  pausedCount = 0;

  // KPIs
  totalSpend = 0;
  totalValue = 0;
  totalPurchases = 0;
  blendedRoas = 0;
  blendedCpa = 0;

  // Hierarchical data
  campaigns: CampaignGroup[] = [];

  async ngOnInit() {
    try {
      // Load only ACTIVE ads first (~40 rows, fast)
      let active = this.cache.get<DashboardAd[]>('dash_active');
      if (!active) {
        active = await this.supa.selectWithFilter<DashboardAd>(
          'meta_dashboard_mat', '*',
          q => q.eq('effective_status', 'ACTIVE')
        );
        this.cache.set('dash_active', active);
      }
      this.activeAds = active;
      this.activeCount = active.length;

      // Get paused count without loading all data
      const counts = await this.supa.selectWithFilter<{ effective_status: string }>(
        'meta_dashboard_mat', 'effective_status',
        q => q.neq('effective_status', 'ACTIVE').limit(1)
      );
      // Use a count RPC or just estimate from the total
      const totalCount = this.cache.get<number>('dash_total_count');
      if (totalCount) {
        this.pausedCount = totalCount - this.activeCount;
      } else {
        // Quick count query
        const all = await this.supa.selectWithFilter<{ ad_id: string }>(
          'meta_dashboard_mat', 'ad_id', q => q
        );
        this.pausedCount = all.length - this.activeCount;
        this.cache.set('dash_total_count', all.length);
      }

      this.buildView();

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

  async setStatusFilter(f: StatusFilter) {
    this.statusFilter.set(f);

    // Lazy load paused ads when needed
    if ((f === 'paused' || f === 'all') && !this.pausedLoaded) {
      this.loadingMore = true;
      try {
        let paused = this.cache.get<DashboardAd[]>('dash_paused');
        if (!paused) {
          paused = await this.supa.selectWithFilter<DashboardAd>(
            'meta_dashboard_mat', '*',
            q => q.neq('effective_status', 'ACTIVE')
          );
          this.cache.set('dash_paused', paused);
        }
        this.pausedAds = paused;
        this.pausedCount = paused.length;
        this.pausedLoaded = true;
      } catch (e: any) {
        this.error = e.message ?? 'Error loading paused ads';
      } finally {
        this.loadingMore = false;
      }
    }

    this.buildView();
  }

  onSearchChange(value: string) {
    this.search.set(value);
    this.buildView();
  }

  private buildView() {
    const sf = this.statusFilter();
    let list: DashboardAd[];

    if (sf === 'active') list = this.activeAds;
    else if (sf === 'paused') list = this.pausedAds;
    else list = [...this.activeAds, ...this.pausedAds];

    // Search
    const q = this.search().toLowerCase();
    if (q) {
      list = list.filter(a =>
        a.ad_name?.toLowerCase().includes(q) ||
        a.campaign_name?.toLowerCase().includes(q) ||
        a.adset_name?.toLowerCase().includes(q) ||
        a.ad_id.includes(q)
      );
    }

    // KPIs
    this.totalSpend = list.reduce((s, a) => s + (a.spend_7d ?? 0), 0);
    this.totalValue = list.reduce((s, a) => s + (a.value_7d ?? 0), 0);
    this.totalPurchases = list.reduce((s, a) => s + (a.purchases_default ?? a.purchases_7d ?? 0), 0);
    this.blendedRoas = this.totalSpend > 0 ? this.totalValue / this.totalSpend : 0;
    this.blendedCpa = this.totalPurchases > 0 ? this.totalSpend / this.totalPurchases : 0;

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
        // Sort ads by spend desc within adset
        adsetAds.sort((a, b) => (b.spend_7d ?? 0) - (a.spend_7d ?? 0));
        adsets.push({
          name: adsetName,
          metrics: this.aggregate(adsetAds),
          ads: adsetAds,
          expanded: false
        });
      }
      adsets.sort((a, b) => b.metrics.spend_7d - a.metrics.spend_7d);

      const allAdsInCamp = adsets.flatMap(a => a.ads);
      campaigns.push({
        name: campName,
        metrics: this.aggregate(allAdsInCamp),
        adsets,
        expanded: false
      });
    }

    campaigns.sort((a, b) => b.metrics.spend_7d - a.metrics.spend_7d);

    // Auto-expand if few items or searching
    if (campaigns.length <= 3 || this.search()) {
      campaigns.forEach(c => {
        c.expanded = true;
        if (c.adsets.length <= 3 || this.search()) {
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
    const withCtr = ads.filter(a => (a.ctr_7d ?? 0) > 0);
    const withFreq = ads.filter(a => (a.freq_recent ?? 0) > 0);

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
