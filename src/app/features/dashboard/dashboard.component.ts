import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
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
  private passkey = inject(PasskeyService);

  showPasskeyBanner = signal(false);
  passkeyRegistering = signal(false);
  passkeyError = signal('');

  loading = true;
  error = '';

  killList: DecisionAd[] = [];
  reduceList: DecisionAd[] = [];
  scaleList: DecisionAd[] = [];

  totalAds = 0;
  compliantCount = 0;
  nonCompliantCount = 0;
  avgRoas7d = 0;

  async ngOnInit() {
    try {
      const rows = await this.supa.select<FloorCompliance>('meta_floor_compliance');
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
        compliant: r.compliant,
        action: 'scale'
      };

      if (r.spend_excess > 0 && r.roas_7d === 0) {
        base.action = 'kill';
        this.killList.push(base);
      } else if (!r.compliant) {
        base.action = 'reduce';
        this.reduceList.push(base);
      } else if (r.compliant && r.roas_7d >= r.roas_min_applied) {
        base.action = 'scale';
        this.scaleList.push(base);
      }
    }

    this.killList.sort((a, b) => b.spend_excess - a.spend_excess);
    this.reduceList.sort((a, b) => b.spend_excess - a.spend_excess);
    this.scaleList.sort((a, b) => b.roas_7d - a.roas_7d);
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
