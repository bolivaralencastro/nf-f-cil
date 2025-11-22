import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnalyticsService, ProductPriceStats } from '../../services/analytics.service';
import { LineChartComponent, LineChartData } from '../charts/line-chart.component';
import { ReceiptService } from '../../services/receipt.service';

interface SimulationResult {
  storeName: string;
  total: number;
  foundItems: number;
  missingItems: string[];
}

@Component({
  selector: 'app-smart-list',
  standalone: true,
  imports: [CommonModule, LineChartComponent],
  templateUrl: './smart-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SmartListComponent {
  private readonly analyticsService = inject(AnalyticsService);
  readonly receiptService = inject(ReceiptService);

  // Component State
  isCreatingList = signal(false);
  selectedItems = signal(new Set<string>());
  simulationResult = signal<SimulationResult[] | null>(null);
  isLoading = signal(false);
  selectedProductForAnalysis = signal<ProductPriceStats | null>(null);
  
  // Data from service
  categorizedProducts = this.analyticsService.productsByCategory;

  // Derived state
  selectedItemsCount = computed(() => this.selectedItems().size);

  productChartData = computed<LineChartData[]>(() => {
    const product = this.selectedProductForAnalysis();
    if (!product) return [];

    const fullProductInfo = this.analyticsService.productsAnalytics().find(p => p.name === product.name);
    if (!fullProductInfo) return [];
    
    return fullProductInfo.purchases
      .map(p => ({
        date: new Date(p.date),
        value: p.unitPrice,
        label: `R$ ${p.unitPrice.toFixed(2)} em ${p.storeName}`
      }))
      .sort((a,b) => a.date.getTime() - b.date.getTime());
  });
  
  startListCreation() {
    this.isCreatingList.set(true);
    this.simulationResult.set(null); // Clear previous results
  }

  cancelListCreation() {
    this.isCreatingList.set(false);
    this.selectedItems.set(new Set()); // Clear selection
  }

  toggleItemSelection(productName: string) {
    if (!this.isCreatingList()) return;

    this.selectedItems.update(currentSet => {
      const newSet = new Set(currentSet);
      if (newSet.has(productName)) {
        newSet.delete(productName);
      } else {
        newSet.add(productName);
      }
      return newSet;
    });
  }
  
  isSelected(productName: string): boolean {
    return this.selectedItems().has(productName);
  }

  runSimulation() {
    const list = Array.from(this.selectedItems());
    if (list.length === 0) return;
    
    this.isLoading.set(true);
    
    // Artificial delay for better UX
    setTimeout(() => {
      const results = this.analyticsService.simulateShoppingList(list);
      this.simulationResult.set(results);
      this.isLoading.set(false);
      this.isCreatingList.set(false); // Exit creation mode after running simulation
    }, 500);
  }

  viewProductHistory(product: ProductPriceStats) {
    this.selectedProductForAnalysis.set(product);
  }

  closeProductHistory() {
    this.selectedProductForAnalysis.set(null);
  }
}