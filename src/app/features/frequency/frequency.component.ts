import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { AdLifecycle } from '../../core/models/meta.models';

type Quadrant = 'sustain' | 'fatigue' | 'scale' | 'fix';

interface FrequencyAd {
  ad_id: string;
  ad_name: string;
  campaign_name: string;
  frequency_7d: number;
  roas_7d: number;
  roas_cum: number;
  roas_trend: 'up' | 'down' | 'stable';
  quadrant: Quadrant;
  purchases: number;
}

@Component({
  selector: 'app-frequency',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './frequency.component.html',
  styleUrl: './frequency.component.scss'
})
export class FrequencyComponent implements OnInit {
  private supa = inject(SupabaseService);
  private router = inject(Router);

  loading = true;
  error = '';

  sustain: FrequencyAd[] = [];
  fatigue: FrequencyAd[] = [];
  scale: FrequencyAd[] = [];
  fix: FrequencyAd[] = [];

  readonly FREQ_THRESHOLD = 3.0;

  async ngOnInit() {
    try {
      const rows = await this.supa.selectWithFilter<AdLifecycle>(
        'meta_ad_lifecycle',
        '*',
        q => q.eq('matured', true).eq('attribution_window', '7d_click').order('ad_id').order('ad_day', { ascending: true })
      );

      // Group by ad_id, take latest values + compute trend
      const byAd = new Map<string, AdLifecycle[]>();
      for (const r of rows) {
        if (!byAd.has(r.ad_id)) byAd.set(r.ad_id, []);
        byAd.get(r.ad_id)!.push(r);
      }

      for (const [adId, adRows] of byAd) {
        if (adRows.length < 7) continue;
        const last = adRows[adRows.length - 1];
        const freq = last.frequency_7d ?? last.frequency;

        // Trend: compare avg roas_7d of last 7 days vs previous 7
        const recent = adRows.slice(-7);
        const previous = adRows.slice(-14, -7);
        const avgRecent = recent.reduce((s, r) => s + r.roas_7d, 0) / recent.length;
        const avgPrev = previous.length > 0 ? previous.reduce((s, r) => s + r.roas_7d, 0) / previous.length : avgRecent;

        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (avgRecent > avgPrev * 1.05) trend = 'up';
        else if (avgRecent < avgPrev * 0.95) trend = 'down';

        const highFreq = freq >= this.FREQ_THRESHOLD;
        const roasUp = trend === 'up' || trend === 'stable';

        let quadrant: Quadrant;
        if (highFreq && roasUp) quadrant = 'sustain';
        else if (highFreq && !roasUp) quadrant = 'fatigue';
        else if (!highFreq && roasUp) quadrant = 'scale';
        else quadrant = 'fix';

        const entry: FrequencyAd = {
          ad_id: adId,
          ad_name: last.ad_name,
          campaign_name: last.campaign_name,
          frequency_7d: freq,
          roas_7d: last.roas_7d,
          roas_cum: last.roas_cum,
          roas_trend: trend,
          quadrant,
          purchases: adRows.reduce((s, r) => s + r.purchases, 0)
        };

        this[quadrant].push(entry);
      }

      // Sort each by frequency descending
      for (const list of [this.sustain, this.fatigue, this.scale, this.fix]) {
        list.sort((a, b) => b.frequency_7d - a.frequency_7d);
      }
    } catch (e: any) {
      this.error = e.message ?? 'Error loading frequency data';
    } finally {
      this.loading = false;
    }
  }

  goToAd(adId: string) {
    this.router.navigate(['/ad', adId]);
  }

  fmt(n: number, d = 2): string {
    return n.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  trendLabel(t: string): string {
    return t === 'up' ? 'Subiendo' : t === 'down' ? 'Bajando' : 'Estable';
  }

  trendColor(t: string): string {
    return t === 'up' ? '#86efac' : t === 'down' ? '#fca5a5' : '#9ca3af';
  }
}
