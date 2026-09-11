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
  roas_7d: number;
  roas_cum: number;
  frequency_day: number;
  spend_excess: number;
  spend_7d: number;
  compliant: boolean;
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

  // All data
  private allKill: DecisionAd[] = [];
  private allReduce: DecisionAd[] = [];
  private allScale: DecisionAd[] = [];

  // Search
  search = '';

  // Filtered lists (computed from search)
  get killList(): DecisionAd[] { return this.filterList(this.allKill); }
  get reduceList(): DecisionAd[] { return this.filterList(this.allReduce); }
  get scaleList(): DecisionAd[] { return this.filterList(this.allScale); }

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

  // KPIs
  totalAds = 0;
  compliantCount = 0;
  nonCompliantCount = 0;
  avgRoas7d = 0;

  async ngOnInit() {
    try {
      let rows = this.cache.get<FloorCompliance[]>('floor_compliance');

      if (!rows) {
        rows = await this.supa.select<FloorCompliance>('meta_floor_compliance');
        this.cache.set('floor_compliance', rows);
      }

      this.classify(rows);
      this.computeKpis(rows);

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

  private classify(rows: FloorCompliance[]) {
    for (const r of rows) {
      const base: DecisionAd = {
        ad_id: r.ad_id,
        ad_name: r.ad_name,
        campaign_name: r.campaign_name,
        roas_7d: r.roas_7d,
        roas_cum: r.roas_cum,
        frequency_day: r.frequency_day,
        spend_excess: r.spend_excess,
        spend_7d: r.spend_7d,
        compliant: r.compliant
      };

      if (r.spend_excess > 0 && r.roas_7d === 0) {
        this.allKill.push(base);
      } else if (!r.compliant) {
        this.allReduce.push(base);
      } else if (r.compliant) {
        this.allScale.push(base);
      }
    }

    this.allKill.sort((a, b) => b.spend_excess - a.spend_excess);
    this.allReduce.sort((a, b) => b.spend_excess - a.spend_excess);
    this.allScale.sort((a, b) => b.roas_7d - a.roas_7d);
  }

  private computeKpis(rows: FloorCompliance[]) {
    this.totalAds = rows.length;
    this.compliantCount = rows.filter(r => r.compliant).length;
    this.nonCompliantCount = rows.filter(r => !r.compliant).length;
    const withRoas = rows.filter(r => r.roas_7d > 0);
    this.avgRoas7d = withRoas.length > 0
      ? withRoas.reduce((s, r) => s + r.roas_7d, 0) / withRoas.length
      : 0;
  }

  private filterList(list: DecisionAd[]): DecisionAd[] {
    if (!this.search) return list;
    const q = this.search.toLowerCase();
    return list.filter(a =>
      a.ad_name.toLowerCase().includes(q) ||
      a.campaign_name.toLowerCase().includes(q)
    );
  }

  private paginate(list: DecisionAd[], page: number): DecisionAd[] {
    const start = (page - 1) * this.PAGE_SIZE;
    return list.slice(start, start + this.PAGE_SIZE);
  }

  onSearch() {
    this.killPage = 1;
    this.reducePage = 1;
    this.scalePage = 1;
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

  async registerPasskey() {
    this.passkeyRegistering.set(true);
    this.passkeyError.set('');
    const result = await this.passkey.registerPasskey();
    if (result.success) {
      this.showPasskeyBanner.set(false);
    } else {
      this.passkeyError.set(result.error ?? 'Error registering passkey');
    }
    this.passkeyRegistering.set(false);
  }

  dismissPasskeyBanner() {
    this.showPasskeyBanner.set(false);
  }
}
