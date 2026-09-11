import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { CacheService } from '../../core/services/cache.service';
import { PasskeyService } from '../../core/services/passkey.service';
import { FloorCompliance } from '../../core/models/meta.models';

interface DecisionAd {
  ad_id: string;
  ad_name: string;
  campaign_name: string;
  effective_status: string;
  roas_7d: number;
  roas_cum: number;
  roas_min_applied: number;
  frequency_day: number;
  spend_excess: number;
  spend_7d: number;
  value_7d: number;
  compliant: boolean;
}

type StatusFilter = 'all' | 'active' | 'paused';

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

  private allAds: DecisionAd[] = [];

  // Filters
  search = signal('');
  statusFilter = signal<StatusFilter>('active');

  // Counts by status
  activeCount = 0;
  pausedCount = 0;

  // KPIs (computed from filtered)
  totalAds = 0;
  compliantCount = 0;
  nonCompliantCount = 0;
  avgRoas7d = 0;
  totalSpend7d = 0;
  totalValue7d = 0;
  totalExcess = 0;

  // Filtered + classified
  killList: DecisionAd[] = [];
  reduceList: DecisionAd[] = [];
  scaleList: DecisionAd[] = [];

  // Pagination
  killPage = 1;
  reducePage = 1;
  scalePage = 1;
  readonly PAGE_SIZE = 20;

  get killPaged(): DecisionAd[] { return this.paginate(this.killList, this.killPage); }
  get reducePaged(): DecisionAd[] { return this.paginate(this.reduceList, this.reducePage); }
  get scalePaged(): DecisionAd[] { return this.paginate(this.scaleList, this.scalePage); }
  get killPages(): number { return Math.ceil(this.killList.length / this.PAGE_SIZE); }
  get reducePages(): number { return Math.ceil(this.reduceList.length / this.PAGE_SIZE); }
  get scalePages(): number { return Math.ceil(this.scaleList.length / this.PAGE_SIZE); }

  async ngOnInit() {
    try {
      let rows = this.cache.get<FloorCompliance[]>('floor_compliance');
      if (!rows) {
        rows = await this.supa.select<FloorCompliance>('meta_floor_compliance');
        this.cache.set('floor_compliance', rows);
      }

      // Build allAds
      this.allAds = rows.map(r => ({
        ad_id: r.ad_id,
        ad_name: r.ad_name,
        campaign_name: r.campaign_name,
        effective_status: r.effective_status ?? 'UNKNOWN',
        roas_7d: r.roas_7d,
        roas_cum: r.roas_cum,
        roas_min_applied: r.roas_min_applied,
        frequency_day: r.frequency_day,
        spend_excess: r.spend_excess,
        spend_7d: r.spend_7d,
        value_7d: r.value_7d,
        compliant: r.compliant
      }));

      this.activeCount = this.allAds.filter(a => a.effective_status === 'ACTIVE').length;
      this.pausedCount = this.allAds.length - this.activeCount;

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
    let filtered = this.allAds;

    // Status filter
    const sf = this.statusFilter();
    if (sf === 'active') {
      filtered = filtered.filter(a => a.effective_status === 'ACTIVE');
    } else if (sf === 'paused') {
      filtered = filtered.filter(a => a.effective_status !== 'ACTIVE');
    }

    // Search
    const q = this.search().toLowerCase();
    if (q) {
      filtered = filtered.filter(a =>
        a.ad_name.toLowerCase().includes(q) ||
        a.campaign_name.toLowerCase().includes(q) ||
        a.ad_id.includes(q)
      );
    }

    // Classify
    this.killList = [];
    this.reduceList = [];
    this.scaleList = [];

    for (const ad of filtered) {
      if (ad.spend_excess > 0 && ad.roas_7d === 0) {
        this.killList.push(ad);
      } else if (!ad.compliant) {
        this.reduceList.push(ad);
      } else {
        this.scaleList.push(ad);
      }
    }

    this.killList.sort((a, b) => b.spend_excess - a.spend_excess);
    this.reduceList.sort((a, b) => b.spend_excess - a.spend_excess);
    this.scaleList.sort((a, b) => b.roas_7d - a.roas_7d);

    // KPIs
    this.totalAds = filtered.length;
    this.compliantCount = filtered.filter(a => a.compliant).length;
    this.nonCompliantCount = filtered.filter(a => !a.compliant).length;
    const withRoas = filtered.filter(a => a.roas_7d > 0);
    this.avgRoas7d = withRoas.length > 0 ? withRoas.reduce((s, a) => s + a.roas_7d, 0) / withRoas.length : 0;
    this.totalSpend7d = filtered.reduce((s, a) => s + a.spend_7d, 0);
    this.totalValue7d = filtered.reduce((s, a) => s + a.value_7d, 0);
    this.totalExcess = filtered.reduce((s, a) => s + (a.spend_excess > 0 ? a.spend_excess : 0), 0);

    // Reset pagination
    this.killPage = 1;
    this.reducePage = 1;
    this.scalePage = 1;
  }

  onSearchChange(value: string) {
    this.search.set(value);
    this.applyFilters();
  }

  setStatusFilter(f: StatusFilter) {
    this.statusFilter.set(f);
    this.applyFilters();
  }

  private paginate(list: DecisionAd[], page: number): DecisionAd[] {
    const start = (page - 1) * this.PAGE_SIZE;
    return list.slice(start, start + this.PAGE_SIZE);
  }

  statusLabel(s: string): string {
    const map: Record<string, string> = {
      'ACTIVE': 'Activo',
      'PAUSED': 'Pausado',
      'CAMPAIGN_PAUSED': 'Camp. pausada',
      'ADSET_PAUSED': 'Adset pausado',
      'DISAPPROVED': 'Rechazado',
      'WITH_ISSUES': 'Con problemas'
    };
    return map[s] ?? s;
  }

  statusClass(s: string): string {
    if (s === 'ACTIVE') return 'badge-green';
    if (s === 'DISAPPROVED' || s === 'WITH_ISSUES') return 'badge-red';
    return 'badge-gray';
  }

  goToAd(adId: string) { this.router.navigate(['/ad', adId]); }

  fmt(n: number, d = 2): string {
    return n.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  fmtMoney(n: number): string {
    return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  async registerPasskey() {
    this.passkeyRegistering.set(true);
    this.passkeyError.set('');
    const result = await this.passkey.registerPasskey();
    if (result.success) { this.showPasskeyBanner.set(false); }
    else { this.passkeyError.set(result.error ?? 'Error'); }
    this.passkeyRegistering.set(false);
  }

  dismissPasskeyBanner() { this.showPasskeyBanner.set(false); }
}
