import { Component, ChangeDetectionStrategy, inject, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnalyticsService } from '../../services/analytics.service';
import { BarChartComponent, ChartData } from '../charts/bar-chart.component';
import { ReceiptService } from '../../services/receipt.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, BarChartComponent],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomeComponent {
  readonly analyticsService = inject(AnalyticsService);
  readonly receiptService = inject(ReceiptService);
  scanNew = output();
  showReports = output<void>();

  monthlySpendingChartData = computed<ChartData[]>(() => {
    return this.analyticsService.spendingByMonth().map(item => ({
      label: this.formatMonthLabel(item.month),
      value: item.total
    }));
  });

  categorySpendingChartData = computed<ChartData[]>(() => {
    return this.analyticsService.spendingByCategory()
      .slice(0, 5) // Get top 5 categories
      .map(item => ({
        label: item.category,
        value: item.total
      }));
  });
  
  payerSpendingChartData = computed<ChartData[]>(() => {
    return this.analyticsService.spendingByPayer()
      .slice(0, 5) // Get top 5 payers
      .map(item => ({
        label: item.payer,
        value: item.total
      }));
  });

  onScanNew() {
    this.scanNew.emit();
  }
  
  onShowReports() {
    this.showReports.emit();
  }

  private formatMonthLabel(monthKey: string): string {
    // monthKey is 'YYYY-MM'
    const [year, month] = monthKey.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
  }
}