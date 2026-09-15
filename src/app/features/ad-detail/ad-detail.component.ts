import { Component, inject, OnInit, ViewChild, ElementRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { AdScorecard, LifecycleClosed } from '../../core/models/meta.models';
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
    if (ref && !this.chart && this.rows().length > 0) {
      this.canvasEl = ref.nativeElement;
      this.buildChart();
    }
  }

  loading = signal(true);
  error = signal('');
  adId = '';

  sc = signal<AdScorecard | null>(null);
  rows = signal<LifecycleClosed[]>([]);
  immatureStart = signal<number | null>(null);
  crossoverDay = signal<number | null>(null);

  async ngOnInit() {
    this.adId = this.route.snapshot.paramMap.get('adId') ?? '';

    try {
      // Use supa.run() to ensure everything resolves in zone
      const scorecardData = await this.supa.selectWithFilter<AdScorecard>(
        'meta_ad_scorecard', '*',
        q => q.eq('ad_id', this.adId).limit(1)
      );
      const lifecycle = await this.supa.selectWithFilter<LifecycleClosed>(
        'meta_ad_lifecycle_closed', '*',
        q => q.eq('ad_id', this.adId).order('ad_day', { ascending: true })
      );

      if (scorecardData.length > 0) this.sc.set(scorecardData[0]);
      this.rows.set(lifecycle);

      if (lifecycle.length > 0) {
        for (let i = 7; i < lifecycle.length; i++) {
          const r = lifecycle[i];
          if ((r.roas_7d ?? 0) > 0 && (r.roas_7d ?? 0) < (r.roas_cum ?? 0)) {
            this.crossoverDay.set(r.ad_day);
            break;
          }
        }
        for (let i = lifecycle.length - 1; i >= 0; i--) {
          if (lifecycle[i].matured) {
            if (i < lifecycle.length - 1) this.immatureStart.set(lifecycle[i + 1].ad_day);
            break;
          }
        }
      }
    } catch (e: any) {
      this.error.set(e.message ?? 'Error loading ad');
    } finally {
      this.loading.set(false);
    }
  }

  private buildChart() {
    const data = this.rows();
    if (!this.canvasEl || data.length === 0) return;

    const labels = data.map(r => r.ad_day);
    const spendData = data.map(r => r.spend_day ?? 0);
    const roasCum = data.map(r => r.roas_cum ?? 0);
    const roas7d = data.map(r => r.roas_7d ?? 0);
    const spendBg = data.map(r => r.matured ? 'rgba(249,115,22,0.18)' : 'rgba(107,114,128,0.12)');

    const imm = this.immatureStart();
    const immIdx = imm !== null ? labels.indexOf(imm) : -1;

    const immPlugin = {
      id: 'immatureZone',
      beforeDraw: (chart: any) => {
        if (immIdx < 0) return;
        const { ctx, chartArea, scales } = chart;
        const x = scales.x.getPixelForValue(immIdx);
        ctx.save();
        ctx.fillStyle = 'rgba(107,114,128,0.08)';
        ctx.fillRect(x, chartArea.top, chartArea.right - x, chartArea.bottom - chartArea.top);
        ctx.strokeStyle = 'rgba(107,114,128,0.4)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.restore();
      }
    };

    this.chart = new Chart(this.canvasEl, {
      type: 'line',
      plugins: [immPlugin],
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
            backgroundColor: '#1e1e3e', titleColor: '#f3f4f6', bodyColor: '#9ca3af',
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed.y ?? 0;
                return ctx.dataset.yAxisID === 'spend'
                  ? `${ctx.dataset.label}: $${v.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
                  : `${ctx.dataset.label}: ${v.toFixed(2)}x`;
              }
            }
          }
        },
        scales: {
          x: { title: { display: true, text: 'Edad (días)', color: '#6b7280' }, grid: { color: 'rgba(30,30,62,0.5)' }, ticks: { color: '#6b7280' } },
          roas: { type: 'linear', position: 'left', grid: { color: 'rgba(30,30,62,0.5)' }, ticks: { color: '#6b7280', callback: (v: any) => v + 'x' }, min: 0 },
          spend: { type: 'linear', position: 'right', grid: { display: false }, ticks: { color: '#6b7280' }, min: 0 }
        }
      }
    });
  }

  goBack() { this.router.navigate(['/dashboard']); }

  fmt(n: number | null | undefined, d = 2): string {
    if (n == null) return '—';
    return Number(n).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  fmtMoney(n: number | null | undefined): string {
    if (n == null) return '—';
    return '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
}
