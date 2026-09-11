import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { CacheService } from '../../core/services/cache.service';
import { AdLifecycle, AdDim } from '../../core/models/meta.models';

type Quadrant = 'sustain' | 'fatigue' | 'scale' | 'fix';

interface FrequencyAd {
  ad_id: string;
  ad_name: string;
  frequency_day: number;
  roas_7d: number;
  roas_cum: number;
  roas_trend: 'up' | 'down' | 'stable';
  quadrant: Quadrant;
  purchases_cum: number;
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
  private cache = inject(CacheService);
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
      let rows = this.cache.get<AdLifecycle[]>('lifecycle_matured');
      let dims = this.cache.get<AdDim[]>('dims_current');

      if (!rows || !dims) {
        const [r, d] = await Promise.all([
          this.supa.selectWithFilter<AdLifecycle>(
            'meta_ad_lifecycle', '*',
            q => q.eq('matured', true).order('ad_id').order('ad_day', { ascending: true })
          ),
          this.supa.selectWithFilter<AdDim>(
            'meta_ads_dim', 'ad_id,ad_name',
            q => q.is('valid_to', null)
          )
        ]);
        rows = r;
        dims = d;
        this.cache.set('lifecycle_matured', rows);
        this.cache.set('dims_current', dims);
      }

      const nameMap = new Map(dims.map(d => [d.ad_id, d.ad_name]));

      const byAd = new Map<string, AdLifecycle[]>();
      for (const r of rows) {
        if (!byAd.has(r.ad_id)) byAd.set(r.ad_id, []);
        byAd.get(r.ad_id)!.push(r);
      }

      for (const [adId, adRows] of byAd) {
        if (adRows.length < 7) continue;
        const last = adRows[adRows.length - 1];
        const freq = last.frequency_day;

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
          ad_name: nameMap.get(adId) ?? adId,
          frequency_day: freq,
          roas_7d: last.roas_7d,
          roas_cum: last.roas_cum,
          roas_trend: trend,
          quadrant,
          purchases_cum: last.purchases_cum
        };

        this[quadrant].push(entry);
      }

      for (const list of [this.sustain, this.fatigue, this.scale, this.fix]) {
        list.sort((a, b) => b.frequency_day - a.frequency_day);
      }
    } catch (e: any) {
      this.error = e.message ?? 'Error loading frequency data';
    } finally {
      this.loading = false;
    }
  }

  goToAd(adId: string) { this.router.navigate(['/ad', adId]); }

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
