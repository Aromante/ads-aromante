import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { CacheService } from '../../core/services/cache.service';
import { PasskeyService } from '../../core/services/passkey.service';

interface DashAd {
  ad_id: string;
  ad_name: string;
  campaign_name: string;
  adset_name: string;
  effective_status: string;
  thumbnail_url: string | null;
  decision: string;
  confiable: boolean;
  compras_default: number;
  roas_default: number;
  cpa_default: number;
  aov_default: number;
  roas_clic: number;
  roas_clic_7d: number | null;
  freq_7d: number;
  freq_30d: number;
  gasto: number;
  dias_vida: number;
}

type StatusFilter = 'all' | 'active' | 'paused';

interface AggMetrics {
  gasto: number;
  compras: number;
  roas: number;
  cpa: number | null;
  aov: number | null;
  freq_avg: number;
  adCount: number;
}

interface AdSetGroup {
  name: string;
  metrics: AggMetrics;
  ads: DashAd[];
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

  loading = signal(true);
  error = signal('');

  private allAds = signal<DashAd[]>([]);

  search = signal('');
  statusFilter = signal<StatusFilter>('active');

  activeCount = signal(0);
  pausedCount = signal(0);

  totalGasto = signal(0);
  totalCompras = signal(0);
  blendedRoas = signal(0);
  blendedCpa = signal(0);

  campaigns = signal<CampaignGroup[]>([]);

  async ngOnInit() {
    try {
      let ads = this.cache.get<DashAd[]>('dash_v3');
      if (!ads) {
        const scorecards = await this.supa.select<any>('meta_ad_scorecard');
        const dims = await this.supa.selectWithFilter<any>(
          'meta_ads_dim',
          'ad_id,adset_name,effective_status,thumbnail_url',
          q => q.is('valid_to', null)
        );

        console.log('[dashboard] scorecards:', scorecards.length, 'dims:', dims.length);
        if (dims.length > 0) console.log('[dashboard] dim sample:', dims[0]);
        if (scorecards.length > 0) console.log('[dashboard] scorecard sample:', scorecards[0]);

        const dimMap = new Map(dims.map((d: any) => [d.ad_id, d]));

        ads = scorecards.map((s: any) => {
          const d = dimMap.get(s.ad_id);
          if (!d) console.log('[dashboard] NO DIM for', s.ad_id, s.ad_name);
          return { ...s, adset_name: d?.adset_name ?? 'Sin ad set', effective_status: d?.effective_status ?? 'UNKNOWN', thumbnail_url: d?.thumbnail_url ?? null } as DashAd;
        });
        this.cache.set('dash_v3', ads);
      }

      this.allAds.set(ads);

      // Debug: log what statuses we got
      const statuses = new Map<string, number>();
      ads.forEach(a => statuses.set(a.effective_status, (statuses.get(a.effective_status) ?? 0) + 1));
      console.log('[dashboard] statuses:', Object.fromEntries(statuses), 'total:', ads.length);

      this.activeCount.set(ads.filter(a => a.effective_status === 'ACTIVE').length);
      this.pausedCount.set(ads.length - this.activeCount());
      this.buildView();

      if (window.PublicKeyCredential) {
        const has = await this.passkey.hasPasskey();
        this.showPasskeyBanner.set(!has);
      }
    } catch (e: any) {
      this.error.set(e.message ?? 'Error loading data');
    } finally {
      this.loading.set(false);
    }
  }

  setStatusFilter(f: StatusFilter) {
    this.statusFilter.set(f);
    this.buildView();
  }

  onSearchChange(value: string) {
    this.search.set(value);
    this.buildView();
  }

  private buildView() {
    const sf = this.statusFilter();
    let list = this.allAds();

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

    const gasto = list.reduce((s, a) => s + Number(a.gasto ?? 0), 0);
    const compras = list.reduce((s, a) => s + (a.compras_default ?? 0), 0);
    this.totalGasto.set(gasto);
    this.totalCompras.set(compras);
    this.blendedRoas.set(compras > 0 ? list.reduce((s, a) => s + Number(a.roas_default ?? 0) * (a.compras_default ?? 0), 0) / compras : 0);
    this.blendedCpa.set(compras > 0 ? gasto / compras : 0);

    this.campaigns.set(this.buildHierarchy(list));
  }

  private buildHierarchy(ads: DashAd[]): CampaignGroup[] {
    const campMap = new Map<string, Map<string, DashAd[]>>();
    for (const ad of ads) {
      const ck = ad.campaign_name ?? 'Sin campaña';
      const ak = ad.adset_name ?? 'Sin ad set';
      if (!campMap.has(ck)) campMap.set(ck, new Map());
      const am = campMap.get(ck)!;
      if (!am.has(ak)) am.set(ak, []);
      am.get(ak)!.push(ad);
    }

    const campaigns: CampaignGroup[] = [];
    for (const [campName, adsetMap] of campMap) {
      const adsets: AdSetGroup[] = [];
      for (const [adsetName, adsetAds] of adsetMap) {
        adsetAds.sort((a, b) => Number(b.gasto ?? 0) - Number(a.gasto ?? 0));
        adsets.push({ name: adsetName, metrics: this.aggregate(adsetAds), ads: adsetAds, expanded: false });
      }
      adsets.sort((a, b) => b.metrics.gasto - a.metrics.gasto);
      campaigns.push({ name: campName, metrics: this.aggregate(adsets.flatMap(a => a.ads)), adsets, expanded: false });
    }
    campaigns.sort((a, b) => b.metrics.gasto - a.metrics.gasto);

    if (campaigns.length <= 4 || this.search()) {
      campaigns.forEach(c => { c.expanded = true; if (c.adsets.length <= 4 || this.search()) c.adsets.forEach(a => a.expanded = true); });
    }
    return campaigns;
  }

  private aggregate(ads: DashAd[]): AggMetrics {
    const gasto = ads.reduce((s, a) => s + Number(a.gasto ?? 0), 0);
    const compras = ads.reduce((s, a) => s + (a.compras_default ?? 0), 0);
    const wFreq = ads.filter(a => (a.freq_30d ?? 0) > 0);
    return {
      gasto, compras,
      roas: compras > 0 ? ads.reduce((s, a) => s + Number(a.roas_default ?? 0) * (a.compras_default ?? 0), 0) / compras : 0,
      cpa: compras > 0 ? gasto / compras : null,
      aov: compras > 0 ? ads.reduce((s, a) => s + Number(a.aov_default ?? 0) * (a.compras_default ?? 0), 0) / compras : null,
      freq_avg: wFreq.length > 0 ? wFreq.reduce((s, a) => s + Number(a.freq_30d), 0) / wFreq.length : 0,
      adCount: ads.length
    };
  }

  toggleCampaign(c: CampaignGroup) { c.expanded = !c.expanded; }
  toggleAdset(a: AdSetGroup) { a.expanded = !a.expanded; }
  goToAd(adId: string) { this.router.navigate(['/ad', adId]); }

  decisionClass(d: string): string {
    if (d?.includes('ESCALAR') || d?.includes('SOSTENER')) return 'dec-green';
    if (d?.includes('APAGAR')) return 'dec-red';
    return 'dec-yellow';
  }

  fmt(n: number | null | undefined, d = 2): string {
    if (n == null) return '—';
    return Number(n).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  fmtMoney(n: number | null | undefined): string {
    if (n == null) return '—';
    return '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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
