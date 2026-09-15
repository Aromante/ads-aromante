import { Component, inject, OnInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { CacheService } from '../../core/services/cache.service';
import { AdLifecycle, AdDim, DashboardAd } from '../../core/models/meta.models';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

interface AttrWindow {
  window: string;
  label: string;
  purchases: number;
  pctTotal: number;
  spend: number;
  value: number;
  cpa: number | null;
  aov: number | null;
  roas: number | null;
}

@Component({
  selector: 'app-ad-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ad-detail.component.html',
  styleUrl: './ad-detail.component.scss'
})
export class AdDetailComponent implements OnInit {
  private supa = inject(SupabaseService);
  private cache = inject(CacheService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  private chart?: Chart;
  private canvasEl?: HTMLCanvasElement;

  @ViewChild('lifecycleChart')
  set chartRef(ref: ElementRef<HTMLCanvasElement> | undefined) {
    if (ref && !this.chart && this.rows.length > 0) {
      this.canvasEl = ref.nativeElement;
      this.buildChart();
    }
  }

  loading = true;
  error = '';
  adId = '';
  adName = '';
  campaignName = '';
  thumbnailUrl: string | null = null;
  rows: AdLifecycle[] = [];

  // All metrics as individual values
  purchasesCum = 0;
  purchases7d = 0;
  cpaCum = 0;
  cpa7d = 0;
  cpaDefault: number | null = null;
  roasCum = 0;
  roas7d = 0;
  aovCum = 0;
  aov7d = 0;
  totalSpend = 0;
  spend7d = 0;
  totalValue = 0;
  maxDay = 0;
  freqRecent = 0;
  ctr7d = 0;
  crossoverDay: number | null = null;
  immatureStart: number | null = null;

  // Confidence
  confidenceIcon = '🔬';
  confidenceLabel = 'Datos insuficientes';

  // Attribution breakdown
  attrWindows: AttrWindow[] = [];

  // Dashboard row (for extra data)
  dashAd: DashboardAd | null = null;

  async ngOnInit() {
    this.adId = this.route.snapshot.paramMap.get('adId') ?? '';

    try {
      // Get dashboard mat data (cached)
      let dashRows = this.cache.get<DashboardAd[]>('dashboard_mat');
      if (!dashRows) {
        dashRows = await this.supa.select<DashboardAd>('meta_dashboard_mat');
        this.cache.set('dashboard_mat', dashRows);
      }
      this.dashAd = dashRows.find(d => d.ad_id === this.adId) ?? null;

      // Get lifecycle + dim
      const [lifecycle, dims] = await Promise.all([
        this.supa.selectWithFilter<AdLifecycle>(
          'meta_ad_lifecycle_mat', '*',
          q => q.eq('ad_id', this.adId).order('ad_day', { ascending: true })
        ),
        this.supa.selectWithFilter<AdDim>(
          'meta_ads_dim', 'ad_name,campaign_name',
          q => q.eq('ad_id', this.adId).is('valid_to', null).limit(1)
        )
      ]);

      this.rows = lifecycle;

      if (dims.length > 0) {
        this.adName = dims[0].ad_name;
        this.campaignName = dims[0].campaign_name;
      }

      // Use dashboard mat for aggregated metrics
      if (this.dashAd) {
        const d = this.dashAd;
        this.purchasesCum = d.purchases_cum ?? 0;
        this.purchases7d = d.purchases_7d ?? 0;
        this.cpaCum = d.cpa_cum ?? 0;
        this.cpa7d = d.cpa_7d ?? 0;
        this.cpaDefault = d.cpa_default;
        this.roasCum = d.roas_cum ?? 0;
        this.roas7d = d.roas_7d ?? 0;
        this.totalSpend = d.spend_cum ?? 0;
        this.spend7d = d.spend_7d ?? 0;
        this.totalValue = d.value_cum ?? 0;
        this.aovCum = d.aov_cum ?? 0;
        this.aov7d = d.aov_7d ?? 0;
        this.freqRecent = d.freq_recent ?? d.frequency_day ?? 0;
        this.ctr7d = d.ctr_7d ?? 0;
        this.thumbnailUrl = d.thumbnail_url;

        // Confidence
        const p = d.purchases_default ?? d.purchases_cum ?? 0;
        if (p >= 15) { this.confidenceIcon = '🛡️'; this.confidenceLabel = 'Confiable'; }
        else if (p >= 10) { this.confidenceIcon = '⚠️'; this.confidenceLabel = 'Confianza mínima'; }

        // Attribution breakdown
        this.buildAttrBreakdown(d);
      } else if (this.rows.length > 0) {
        const last = this.rows[this.rows.length - 1];
        this.purchasesCum = last.purchases_cum ?? 0;
        this.cpaCum = last.cpa_cum ?? 0;
        this.roasCum = last.roas_cum ?? 0;
        this.roas7d = last.roas_7d ?? 0;
        this.totalSpend = last.spend_cum ?? 0;
        this.freqRecent = last.frequency_day ?? 0;
      }

      if (this.rows.length > 0) {
        this.maxDay = this.rows[this.rows.length - 1].ad_day ?? 0;

        // Crossover
        for (let i = 7; i < this.rows.length; i++) {
          const r = this.rows[i];
          if ((r.roas_7d ?? 0) > 0 && (r.roas_7d ?? 0) < (r.roas_cum ?? 0)) {
            this.crossoverDay = r.ad_day;
            break;
          }
        }

        // Immature zone
        for (let i = this.rows.length - 1; i >= 0; i--) {
          if (this.rows[i].matured) {
            if (i < this.rows.length - 1) this.immatureStart = this.rows[i + 1].ad_day;
            break;
          }
        }
      }
    } catch (e: any) {
      this.error = e.message ?? 'Error loading ad';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private buildAttrBreakdown(d: DashboardAd) {
    const totalSpend = d.spend_cum ?? 0;
    const defaultPurchases = d.purchases_default ?? d.purchases_7d_click ?? 0;

    const windows: { key: string; label: string; purchases: number; value: number }[] = [
      { key: 'default', label: 'Default', purchases: defaultPurchases, value: d.value_cum ?? d.value_7d_click ?? 0 },
      { key: '7d_click', label: '7d clic', purchases: d.purchases_7d_click ?? 0, value: d.value_7d_click ?? 0 },
      { key: '1d_click', label: '1d clic', purchases: d.purchases_1d_click ?? 0, value: d.value_1d_click ?? 0 },
      { key: '1d_view', label: '1d vista', purchases: d.purchases_1d_view ?? 0, value: d.value_1d_view ?? 0 },
    ];

    this.attrWindows = windows.map(w => ({
      window: w.key,
      label: w.label,
      purchases: w.purchases,
      pctTotal: defaultPurchases > 0 ? (w.purchases / defaultPurchases) * 100 : 0,
      spend: totalSpend,
      value: w.value,
      cpa: w.purchases > 0 ? totalSpend / w.purchases : null,
      aov: w.purchases > 0 ? w.value / w.purchases : null,
      roas: totalSpend > 0 ? w.value / totalSpend : null,
    }));
  }

  private buildChart() {
    if (!this.canvasEl || this.rows.length === 0) return;

    const labels = this.rows.map(r => r.ad_day);
    const spendData = this.rows.map(r => r.spend_day ?? 0);
    const roasCum = this.rows.map(r => r.roas_cum ?? 0);
    const roas7d = this.rows.map(r => r.roas_7d ?? 0);

    const spendBg = this.rows.map(r => r.matured ? 'rgba(249,115,22,0.18)' : 'rgba(107,114,128,0.12)');

    const immatureStartIdx = this.immatureStart !== null ? labels.indexOf(this.immatureStart) : -1;

    const immaturePlugin = {
      id: 'immatureZone',
      beforeDraw: (chart: any) => {
        if (immatureStartIdx < 0) return;
        const { ctx, chartArea, scales } = chart;
        const xStart = scales.x.getPixelForValue(immatureStartIdx);
        ctx.save();
        ctx.fillStyle = 'rgba(107, 114, 128, 0.08)';
        ctx.fillRect(xStart, chartArea.top, chartArea.right - xStart, chartArea.bottom - chartArea.top);
        ctx.strokeStyle = 'rgba(107, 114, 128, 0.4)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(xStart, chartArea.top);
        ctx.lineTo(xStart, chartArea.bottom);
        ctx.stroke();
        ctx.restore();
      }
    };

    this.chart = new Chart(this.canvasEl, {
      type: 'line',
      plugins: [immaturePlugin],
      data: {
        labels,
        datasets: [
          { type: 'bar', label: 'Gasto diario', data: spendData, backgroundColor: spendBg, borderColor: 'transparent', yAxisID: 'spend', order: 3 },
          { type: 'line', label: 'ROAS acumulado', data: roasCum, borderColor: '#f3f4f6', borderWidth: 2, pointRadius: 0, tension: 0.3, yAxisID: 'roas', order: 1 },
          { type: 'line', label: 'ROAS 7d móvil', data: roas7d, borderColor: '#f97316', borderWidth: 2, borderDash: [8, 4], pointRadius: 0, tension: 0.3, yAxisID: 'roas', order: 0 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#9ca3af', font: { size: 11 } } },
          tooltip: {
            backgroundColor: '#1e1e3e', titleColor: '#f3f4f6', bodyColor: '#9ca3af', borderColor: '#2d2d52', borderWidth: 1,
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed.y ?? 0;
                return ctx.dataset.yAxisID === 'spend'
                  ? `${ctx.dataset.label}: $${val.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
                  : `${ctx.dataset.label}: ${val.toFixed(2)}x`;
              }
            }
          }
        },
        scales: {
          x: { title: { display: true, text: 'Edad (días)', color: '#6b7280' }, grid: { color: 'rgba(30,30,62,0.5)' }, ticks: { color: '#6b7280' } },
          roas: { type: 'linear', position: 'left', title: { display: true, text: 'ROAS', color: '#6b7280' }, grid: { color: 'rgba(30,30,62,0.5)' }, ticks: { color: '#6b7280', callback: (v: any) => v + 'x' }, min: 0 },
          spend: { type: 'linear', position: 'right', title: { display: true, text: 'Gasto ($)', color: '#6b7280' }, grid: { display: false }, ticks: { color: '#6b7280' }, min: 0 }
        }
      }
    });
  }

  goBack() { this.router.navigate(['/dashboard']); }

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
    return n.toFixed(0) + '%';
  }
}
