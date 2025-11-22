import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnalyticsService, ProductPriceInfo } from '../../services/analytics.service';
import { LineChartComponent, LineChartData } from '../charts/line-chart.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, LineChartComponent],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  readonly analyticsService = inject(AnalyticsService);
  
  searchTerm = signal('');
  selectedProduct = signal<ProductPriceInfo | null>(null);

  filteredProducts = computed<ProductPriceInfo[]>(() => {
    const term = this.searchTerm().toLowerCase();
    if (!term) return [];
    
    // Do not show results if a product is already selected for chart view
    if (this.selectedProduct()) return [];

    return this.analyticsService.productsAnalytics()
      .filter(p => p.name.toLowerCase().includes(term))
      .slice(0, 5); // Limit to 5 results for a cleaner UI
  });

  productChartData = computed<LineChartData[]>(() => {
    const product = this.selectedProduct();
    if (!product) return [];
    return product.purchases
      .map(p => ({
        date: new Date(p.date),
        value: p.unitPrice,
        label: `R$ ${p.unitPrice.toFixed(2)} em ${p.storeName}`
      }))
      .sort((a,b) => a.date.getTime() - b.date.getTime());
  });


  onSearch(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchTerm.set(input.value);
    // Clear selection if user starts typing again
    if(this.selectedProduct()) {
      this.selectedProduct.set(null);
    }
  }

  selectProduct(product: ProductPriceInfo) {
    this.selectedProduct.set(product);
  }

  clearSelection() {
    this.selectedProduct.set(null);
    this.searchTerm.set('');
  }
}
