import { Component, inject, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../core/services/supabase.service';
import { MaturationObserved } from '../../core/models/meta.models';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-maturation',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './maturation.component.html',
  styleUrl: './maturation.component.scss'
})
export class MaturationComponent implements OnInit {
  private supa = inject(SupabaseService);

  @ViewChild('matChart') chartRef!: ElementRef<HTMLCanvasElement>;
  private chart?: Chart;

  loading = true;
  error = '';
  rows: MaturationObserved[] = [];
  stableAfter: number | null = null;

  async ngOnInit() {
    try {
      this.rows = await this.supa.selectWithFilter<MaturationObserved>(
        'meta_maturation_observed',
        '*',
        q => q.order('age_days', { ascending: true })
      );

      // Find stability point: first age where days_changed = 0
      for (const r of this.rows) {
        if (r.age_days > 0 && r.days_changed === 0) {
          this.stableAfter = r.age_days;
          break;
        }
      }
    } catch (e: any) {
      this.error = e.message ?? 'Error loading maturation data';
    } finally {
      this.loading = false;
      setTimeout(() => this.buildChart(), 100);
    }
  }

  private buildChart() {
    if (!this.chartRef || this.rows.length === 0) return;

    this.chart = new Chart(this.chartRef.nativeElement, {
      type: 'bar',
      data: {
        labels: this.rows.map(r => r.age_days),
        datasets: [
          {
            type: 'bar',
            label: 'Días que cambiaron',
            data: this.rows.map(r => r.days_changed),
            backgroundColor: this.rows.map(r => r.days_changed > 0 ? '#f97316' : 'rgba(134,239,172,0.3)'),
            yAxisID: 'count'
          },
          {
            type: 'line',
            label: 'Cambio promedio %',
            data: this.rows.map(r => r.avg_change_pct),
            borderColor: '#f3f4f6',
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#f3f4f6',
            tension: 0.3,
            yAxisID: 'pct'
          },
          {
            type: 'line',
            label: 'Cambio máximo %',
            data: this.rows.map(r => r.max_change_pct),
            borderColor: '#fca5a5',
            borderWidth: 1,
            borderDash: [4, 4],
            pointRadius: 0,
            tension: 0.3,
            yAxisID: 'pct'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#9ca3af', font: { size: 11 } } }
        },
        scales: {
          x: {
            title: { display: true, text: 'Edad del dato (días)', color: '#6b7280' },
            grid: { color: 'rgba(30,30,62,0.5)' },
            ticks: { color: '#6b7280' }
          },
          count: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'Días que cambiaron', color: '#6b7280' },
            grid: { color: 'rgba(30,30,62,0.5)' },
            ticks: { color: '#6b7280' },
            min: 0
          },
          pct: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'Cambio %', color: '#6b7280' },
            grid: { display: false },
            ticks: { color: '#6b7280', callback: (v: any) => v + '%' },
            min: 0
          }
        }
      }
    });
  }

  fmt(n: number, d = 2): string {
    return n.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
}
