import { Component, OnInit, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { Chart, registerables } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

Chart.register(...registerables, ChartDataLabels);

@Component({
  selector: 'app-stats',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.css'
})
export class StatsComponent implements OnInit, AfterViewInit {
  @ViewChild('trendChart') trendChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('itemCountChart') itemCountChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('instanceChart') instanceChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('watchChart') watchChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('freedChart') freedChartRef!: ElementRef<HTMLCanvasElement>;

  stats: any = null;
  isLoading = true;

  chartInstances: Chart[] = [];

  constructor(private api: ApiService) { }

  ngOnInit() {
    this.api.getStats(30).subscribe({
      next: (data) => {
        this.stats = data;
        this.isLoading = false;
        setTimeout(() => this.renderCharts(), 0);
      },
      error: (err) => {
        console.error('Failed to load stats', err);
        this.isLoading = false;
      }
    });
  }

  ngAfterViewInit() {
    if (this.stats && this.chartInstances.length === 0) {
      setTimeout(() => this.renderCharts(), 0);
    }
  }

  formatSize(bytes: number): string {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(1)} ${units[i]}`;
  }

  getScaleParameters(byteValues: number[]): { divisor: number; label: string } {
    const maxVal = Math.max(...byteValues, 0);
    const units = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let i = 0;
    let size = maxVal;
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    const divisor = Math.pow(1024, i);
    return { divisor, label: units[i] };
  }

  renderCharts() {
    this.chartInstances.forEach(c => c.destroy());
    this.chartInstances = [];

    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#e8eaf0';
    const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--border-default').trim() || 'rgba(255, 255, 255, 0.1)';

    Chart.defaults.color = textColor;
    Chart.defaults.font.family = 'Inter, sans-serif';

    this.renderTrendChart(gridColor);
    this.renderItemCountChart(gridColor);
    this.renderInstanceChart();
    this.renderWatchChart();
    this.renderFreedChart(gridColor);
  }

  renderTrendChart(gridColor: string) {
    if (!this.trendChartRef) return;
    const history = this.stats.historical.filter((h: any) => h.metric_name === 'total_size_bytes');
    const labels = history.map((h: any) => h.date);
    const rawValues = history.map((h: any) => h.value);
    const scale = this.getScaleParameters(rawValues);
    const data = rawValues.map((v: number) => v / scale.divisor);

    const chart = new Chart(this.trendChartRef.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: `Total Size (${scale.label})`,
          data,
          borderColor: '#3ecbf0',
          backgroundColor: 'rgba(62, 203, 240, 0.2)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { color: gridColor, drawOnChartArea: false } },
          y: { grid: { color: gridColor }, beginAtZero: true }
        },
        plugins: {
          legend: { display: false },
          datalabels: { display: false }
        }
      }
    });
    this.chartInstances.push(chart);
  }

  renderItemCountChart(gridColor: string) {
    if (!this.itemCountChartRef) return;
    const moviesHistory = this.stats.historical.filter((h: any) => h.metric_name === 'total_movies');
    const seriesHistory = this.stats.historical.filter((h: any) => h.metric_name === 'total_series');
    const labels = moviesHistory.map((h: any) => h.date);
    const moviesData = moviesHistory.map((h: any) => h.value);
    const seriesData = seriesHistory.map((h: any) => h.value);

    const chart = new Chart(this.itemCountChartRef.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Movies', data: moviesData, borderColor: '#a78bfa', backgroundColor: 'rgba(167, 139, 250, 0.1)', borderWidth: 2, fill: true, tension: 0.3, pointRadius: 2 },
          { label: 'Series', data: seriesData, borderColor: '#f87171', backgroundColor: 'rgba(248, 113, 113, 0.1)', borderWidth: 2, fill: true, tension: 0.3, pointRadius: 2 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { color: gridColor, drawOnChartArea: false } },
          y: { grid: { color: gridColor }, beginAtZero: true }
        },
        plugins: {
          legend: { position: 'top' },
          datalabels: { display: false }
        }
      }
    });
    this.chartInstances.push(chart);
  }

  renderInstanceChart() {
    if (!this.instanceChartRef) return;
    const instances = this.stats.current.instances;
    const labels = instances.map((i: any) => i.instance_name);
    const rawValues = instances.map((i: any) => i.total_bytes);
    const scale = this.getScaleParameters(rawValues);
    const data = rawValues.map((v: number) => v / scale.divisor);
    const colors = ['#3ecbf0', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#fbcfe8', '#86efac'];

    const chart = new Chart(this.instanceChartRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors.slice(0, instances.length),
          borderWidth: 0,
          hoverOffset: 10
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { position: 'right' },
          datalabels: {
            display: true,
            color: '#fff',
            font: { weight: 'bold', size: 11 },
            formatter: (value) => `${value.toFixed(1)}${scale.label}`,
            anchor: 'end',
            align: 'start',
            offset: 10,
            borderRadius: 4,
            backgroundColor: 'rgba(0,0,0,0.4)',
            padding: 4
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${(ctx.raw as number).toFixed(1)} ${scale.label}`
            }
          }
        }
      }
    });
    this.chartInstances.push(chart);
  }

  renderWatchChart() {
    if (!this.watchChartRef) return;
    const ws = this.stats.current.watchStats;
    const labels = ['Watched', 'Unwatched'];
    const data = [ws.watched || 0, ws.unwatched || 0];
    const total = data[0] + data[1] || 1;

    const chart = new Chart(this.watchChartRef.nativeElement, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: ['#34d399', '#475569'],
          borderWidth: 0,
          hoverOffset: 10
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right' },
          datalabels: {
            display: true,
            color: '#fff',
            font: { weight: 'bold', size: 11 },
            formatter: (value) => {
              const perc = ((value / total) * 100).toFixed(0);
              return value > 0 ? `${perc}%` : '';
            },
            anchor: 'center'
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = ctx.raw as number;
                const perc = ((val / total) * 100).toFixed(1);
                return `${ctx.label}: ${val} (${perc}%)`;
              }
            }
          }
        }
      }
    });
    this.chartInstances.push(chart);
  }

  renderFreedChart(gridColor: string) {
    if (!this.freedChartRef) return;
    const monthlyFreed = this.stats.actions.monthlyFreed || [];
    const sorted = [...monthlyFreed].reverse();
    const labels = sorted.map((m: any) => m.month);
    const rawValues = sorted.map((m: any) => m.total_bytes);
    const scale = this.getScaleParameters(rawValues);
    const data = rawValues.map((v: number) => v / scale.divisor);

    const chart = new Chart(this.freedChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: `Space Freed (${scale.label})`,
          data,
          backgroundColor: '#34d399',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: gridColor }, beginAtZero: true }
        },
        plugins: {
          legend: { display: false },
          datalabels: { display: false }
        }
      }
    });
    this.chartInstances.push(chart);
  }
}
