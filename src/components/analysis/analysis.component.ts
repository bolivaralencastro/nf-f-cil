import { Component, ChangeDetectionStrategy, input, output, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReceiptData, ReceiptItem } from '../../services/gemini.service';
import { AnalyticsService, ProductPriceStats } from '../../services/analytics.service';

interface ItemAnalysis extends ReceiptItem {
  stats: ProductPriceStats | undefined;
  priceDiffPercent: number | null;
  lastPrice: number | null;
}

@Component({
  selector: 'app-analysis',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './analysis.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AnalysisComponent {
  receipt = input.required<ReceiptData>();
  analysisDone = output();

  private readonly analyticsService = inject(AnalyticsService);

  // FIX: Moved analysis logic from constructor to a computed signal.
  // This is safer, more declarative, and avoids runtime errors if input is not ready
  // or if receipt.items is undefined during component initialization.
  readonly analyzedItems = computed<ItemAnalysis[]>(() => {
    const receiptData = this.receipt();
    if (!receiptData.items) {
      return [];
    }
    const productStatsMap = this.analyticsService.productStatsMap();
    
    return receiptData.items.map(item => {
      const stats = productStatsMap.get(item.name.trim().toLowerCase());
      let priceDiffPercent: number | null = null;
      let lastPrice : number | null = null;

      if (stats && stats.purchaseCount > 1) {
        priceDiffPercent = ((item.unitPrice - stats.averagePrice) / stats.averagePrice) * 100;
        // Find the price of the last purchase that is NOT the current one
        const allPurchases = this.analyticsService.productsAnalytics().find(p=>p.name.trim().toLowerCase() === item.name.trim().toLowerCase())?.purchases;
        if(allPurchases && allPurchases.length > 1) {
            lastPrice = allPurchases[1].unitPrice;
        }

      }
      return { ...item, stats, priceDiffPercent, lastPrice };
    });
  });

  onDone() {
    this.analysisDone.emit();
  }

  getDiffColor(diff: number | null): string {
    if (diff === null) return 'text-gray-400';
    if (diff < -5) return 'text-green-400';
    if (diff > 5) return 'text-red-400';
    return 'text-yellow-400';
  }
}