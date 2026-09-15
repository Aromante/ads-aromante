import { Component, inject, OnInit, signal } from '@angular/core';
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

  loading = true;
  loadingMore = false;
  error = '';

  private activeAds: DashAd[] = [];
  private pausedAds: DashAd[] = [];
  private pausedLoaded = false;

  search = signal('');
  statusFilter = signal<StatusFilter>('active');

  activeCount = 0;
  pausedCount = 0;

  totalGasto = 0;
  totalCompras = 0;
  blendedRoas = 0;
  blendedCpa = 0;

  campaigns: CampaignGroup[] = [];

  async ngOnInit() {
    try {
      let active = this.cache.get<DashAd[]>('dash_active');
      if (!active) {
        // Join scorecard + dim for active ads
        const { data, error } = await this.supa.client
          .from('meta_ad_scorecard')
          .select(`
            ad_id, ad_name, campaign_name, decision, confiable,
            compras_default, roas_default, cpa_default, aov_default,
            roas_clic, roas_clic_7d, freq_7d, freq_30d, gasto, dias_vida
          `);
        if (error) throw error;

        // Get dim data for adset_name, effective_status, thumbnail_url
        const { data: dims, error: dimErr } = await this.supa.client
          .from('meta_ads_dim')
          .select('ad_id, adset_name, effective_status, thumbnail_url')
          .is('valid_to', null);
        if (dimErr) throw dimErr;

        const dimMap = new Map((dims ?? []).map(d => [d.ad_id, d]));

        const all = (data ?? []).map(s => {
          const d = dimMap.get(s.ad_id);
          return {
            ...s,
            adset_name: d?.adset_name ?? 'Sin ad set',
            effective_status: d?.effective_status ?? 'UNKNOWN',
            thumbnail_url: d?.thumbnail_url ?? null
          } as DashAd;
        });

        active = all.filter(a => a.effective_status === 'ACTIVE');
        this.pausedAds = all.filter(a => a.effective_status !== 'ACTIVE');
        this.pausedLoaded = true;

        this.cache.set('dash_active', active);
        this.cache.set('dash_paused', this.pausedAds);
      }

      this.activeAds = active;
      this.activeCount = active.length;

      if (!this.pausedLoaded) {
        const paused = this.cache.get<DashAd[]>('dash_paused');
        if (paused) {
          this.pausedAds = paused;
          this.pausedLoaded = true;
        }
      }
      this.pausedCount = this.pausedAds.length;

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
    this.buildView();
  }

  onSearchChange(value: string) {
    this.search.set(value);
    this.buildView();
  }

  private buildView() {
    const sf = this.statusFilter();
    let list: DashAd[];

    if (sf === 'active') list = this.activeAds;
    else if (sf === 'paused') list = this.pausedAds;
    else list = [...this.activeAds, ...this.pausedAds];

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
    this.totalGasto = list.reduce((s, a) => s + Number(a.gasto ?? 0), 0);
    this.totalCompras = list.reduce((s, a) => s + (a.compras_default ?? 0), 0);
    this.blendedRoas = this.totalCompras > 0 ? list.reduce((s, a) => s + Number(a.roas_default ?? 0) * (a.compras_default ?? 0), 0) / this.totalCompras : 0;
    this.blendedCpa = this.totalCompras > 0 ? this.totalGasto / this.totalCompras : 0;

    this.campaigns = this.buildHierarchy(list);
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
      campaigns.push({
        name: campName,
        metrics: this.aggregate(adsets.flatMap(a => a.ads)),
        adsets,
        expanded: false
      });
    }
    campaigns.sort((a, b) => b.metrics.gasto - a.metrics.gasto);

    if (campaigns.length <= 4 || this.search()) {
      campaigns.forEach(c => {
        c.expanded = true;
        if (c.adsets.length <= 4 || this.search()) c.adsets.forEach(a => a.expanded = true);
      });
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
