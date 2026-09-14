import { Component, inject, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { AdLifecycle, AdDim } from '../../core/models/meta.models';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-ad-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ad-detail.component.html',
  styleUrl: './ad-detail.component.scss'
})
export class AdDetailComponent implements OnInit {
  private supa = inject(SupabaseService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

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
  rows: AdLifecycle[] = [];

  // KPIs
  totalSpend = 0;
  totalPurchases = 0;
  roasCum = 0;
  roas7d = 0;
  cpaCum = 0;
  cpa7d = 0;
  aovCum = 0;
  aov7d = 0;
  maxDay = 0;
  currentFreq = 0;
  crossoverDay: number | null = null;
  immatureStart: number | null = null;

  async ngOnInit() {
    this.adId = this.route.snapshot.paramMap.get('adId') ?? '';

    try {
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

      if (this.rows.length > 0) {
        const last = this.rows[this.rows.length - 1];
        this.totalSpend = last.spend_cum ?? 0;
        this.totalPurchases = last.purchases_cum ?? 0;
        this.roasCum = last.roas_cum ?? 0;
        this.roas7d = last.roas_7d ?? 0;
        this.cpaCum = last.cpa_cum ?? 0;
        this.cpa7d = last.cpa_7d ?? 0;
        this.maxDay = last.ad_day ?? 0;
        this.currentFreq = last.frequency_day ?? 0;

        // AOV = value / purchases
        const valueCum = last.value_cum ?? 0;
        this.aovCum = this.totalPurchases > 0 ? valueCum / this.totalPurchases : 0;
        const value7d = last.value_7d ?? 0;
        const purchases7d = last.purchases_7d ?? 0;
        this.aov7d = purchases7d > 0 ? value7d / purchases7d : 0;

        // Find crossover
        for (let i = 7; i < this.rows.length; i++) {
          const r = this.rows[i];
          if ((r.roas_7d ?? 0) > 0 && (r.roas_7d ?? 0) < (r.roas_cum ?? 0)) {
            this.crossoverDay = r.ad_day;
            break;
          }
        }

        // Find where immature data starts
        for (let i = this.rows.length - 1; i >= 0; i--) {
          if (this.rows[i].matured) {
            if (i < this.rows.length - 1) {
              this.immatureStart = this.rows[i + 1].ad_day;
            }
            break;
          }
        }
      }
    } catch (e: any) {
      this.error = e.message ?? 'Error loading ad';
    } finally {
      this.loading = false;
    }
  }

  private buildChart() {
    if (!this.canvasEl || this.rows.length === 0) return;

    const labels = this.rows.map(r => r.ad_day);
    const spendData = this.rows.map(r => r.spend_day ?? 0);
    const roasCum = this.rows.map(r => r.roas_cum ?? 0);
    const roas7d = this.rows.map(r => r.roas_7d ?? 0);

    // Background colors for spend bars: gray for immature, orange for matured
    const spendBg = this.rows.map(r =>
      r.matured ? 'rgba(249,115,22,0.18)' : 'rgba(107,114,128,0.12)'
    );

    // Create immature zone annotation via a plugin
    const immatureStartIdx = this.immatureStart !== null
      ? labels.indexOf(this.immatureStart)
      : -1;

    const immaturePlugin = {
      id: 'immatureZone',
      beforeDraw: (chart: any) => {
        if (immatureStartIdx < 0) return;
        const { ctx, chartArea, scales } = chart;
        const xStart = scales.x.getPixelForValue(immatureStartIdx);
        const xEnd = chartArea.right;
        ctx.save();
        ctx.fillStyle = 'rgba(107, 114, 128, 0.08)';
        ctx.fillRect(xStart, chartArea.top, xEnd - xStart, chartArea.bottom - chartArea.top);
        // Dashed vertical line at start of immature zone
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
          {
            type: 'bar',
            label: 'Gasto diario',
            data: spendData,
            backgroundColor: spendBg,
            borderColor: 'transparent',
            yAxisID: 'spend',
            order: 3
          },
          {
            type: 'line',
            label: 'ROAS acumulado',
            data: roasCum,
            borderColor: '#f3f4f6',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.3,
            yAxisID: 'roas',
            order: 1
          },
          {
            type: 'line',
            label: 'ROAS 7d móvil',
            data: roas7d,
            borderColor: '#f97316',
            borderWidth: 2,
            borderDash: [8, 4],
            pointRadius: 0,
            tension: 0.3,
            yAxisID: 'roas',
            order: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#9ca3af', font: { size: 11 } } },
          tooltip: {
            backgroundColor: '#1e1e3e',
            titleColor: '#f3f4f6',
            bodyColor: '#9ca3af',
            borderColor: '#2d2d52',
            borderWidth: 1,
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed.y ?? 0;
                if (ctx.dataset.yAxisID === 'spend') {
                  return `${ctx.dataset.label}: $${val.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
                }
                return `${ctx.dataset.label}: ${val.toFixed(2)}x`;
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Edad del anuncio (días)', color: '#6b7280' },
            grid: { color: 'rgba(30,30,62,0.5)' },
            ticks: { color: '#6b7280' }
          },
          roas: {
            type: 'linear', position: 'left',
            title: { display: true, text: 'ROAS', color: '#6b7280' },
            grid: { color: 'rgba(30,30,62,0.5)' },
            ticks: { color: '#6b7280', callback: (v: any) => v + 'x' },
            min: 0
          },
          spend: {
            type: 'linear', position: 'right',
            title: { display: true, text: 'Gasto ($)', color: '#6b7280' },
            grid: { display: false },
            ticks: { color: '#6b7280' },
            min: 0
          }
        }
      }
    });
  }

  goBack() { this.router.navigate(['/dashboard']); }

  fmt(n: number | null | undefined, decimals = 2): string {
    if (n == null) return '—';
    return n.toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  fmtMoney(n: number | null | undefined): string {
    if (n == null) return '—';
    return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
}
