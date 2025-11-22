import { Injectable, computed, inject } from '@angular/core';
import { ReceiptService } from './receipt.service';
import { ReceiptData, ReceiptItem } from './gemini.service';

export interface MonthlySpending {
  month: string;
  total: number;
}

export interface CategorySpending {
  category: string;
  total: number;
}

export interface PayerSpending {
  payer: string;
  total: number;
}

export interface ProductPurchase {
    storeName: string;
    unitPrice: number;
    date: string;
    quantity: number;
    unit: string;
}

export interface ProductPriceInfo {
  name: string;
  category: string;
  purchases: ProductPurchase[];
}

export interface ProductPriceStats {
    name: string;
    category: string;
    averagePrice: number;
    minPrice: number;
    maxPrice: number;
    lastPrice: number;
    purchaseCount: number;
    lastPurchase?: ProductPurchase;
}

export interface StoreAnalytics {
  storeName: string;
  storeCnpj: string;
  storeAddress: string;
  totalSpent: number;
  receiptCount: number;
  averageReceiptTotal: number;
  firstPurchaseDate: string;
  lastPurchaseDate: string;
}


@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private readonly receiptService = inject(ReceiptService);
  private normalize = (name: string) => name.trim().toLowerCase();

  private completedReceipts = computed(() => {
    return this.receiptService.receipts().filter((r): r is Required<ReceiptData> => r.status === 'completed');
  });

  // Basic stats
  totalSpent = computed(() => {
    return this.completedReceipts().reduce((sum, receipt) => sum + receipt.totalAmount, 0);
  });
  
  totalReceipts = computed(() => this.completedReceipts().length);

  averagePerReceipt = computed(() => {
    const total = this.totalSpent();
    const count = this.totalReceipts();
    return count > 0 ? total / count : 0;
  });

  // Spending over time (last 6 months)
  spendingByMonth = computed<MonthlySpending[]>(() => {
    const monthlyMap = new Map<string, number>();
    const receipts = this.completedReceipts();

    receipts.forEach(receipt => {
      try {
        const date = new Date(receipt.date);
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const key = `${year}-${month}`;
        
        const currentTotal = monthlyMap.get(key) || 0;
        monthlyMap.set(key, currentTotal + receipt.totalAmount);
      } catch(e) {
        // Ignore receipts with invalid dates
      }
    });

    return Array.from(monthlyMap.entries())
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6); // Get last 6 months of data
  });

  // Spending by category
  spendingByCategory = computed<CategorySpending[]>(() => {
    const categoryMap = new Map<string, number>();
    const receipts = this.completedReceipts();

    receipts.forEach(receipt => {
      receipt.items.forEach(item => {
        const category = item.category || 'Outros';
        const currentTotal = categoryMap.get(category) || 0;
        categoryMap.set(category, currentTotal + item.totalPrice);
      });
    });

    return Array.from(categoryMap.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  });
  
  // Spending by payer
  spendingByPayer = computed<PayerSpending[]>(() => {
    const payerMap = new Map<string, number>();
    const receipts = this.completedReceipts();

    receipts.forEach(receipt => {
        const payer = receipt.payer || 'Não especificado';
        const currentTotal = payerMap.get(payer) || 0;
        payerMap.set(payer, currentTotal + receipt.totalAmount);
    });

    return Array.from(payerMap.entries())
      .map(([payer, total]) => ({ payer, total }))
      .sort((a, b) => b.total - a.total);
  });

  // Product price comparison data
  productsAnalytics = computed<ProductPriceInfo[]>(() => {
    const productMap = new Map<string, ProductPriceInfo>();

    this.completedReceipts().forEach(receipt => {
        receipt.items.forEach(item => {
            const normalizedName = this.normalize(item.name);
            if (!productMap.has(normalizedName)) {
                productMap.set(normalizedName, {
                    name: item.name,
                    category: item.category || 'Outros',
                    purchases: []
                });
            }
            const productInfo = productMap.get(normalizedName)!;
            // Update category with the latest one, assuming it might be more accurate
            productInfo.category = item.category || 'Outros';
            productInfo.purchases.push({
                storeName: receipt.storeName,
                unitPrice: item.unitPrice,
                date: receipt.date,
                quantity: item.quantity,
                unit: item.unit
            });
        });
    });
    
    const analytics = Array.from(productMap.values());
    analytics.forEach(p => p.purchases.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    return analytics.sort((a,b) => a.name.localeCompare(b.name));
  });

  // Map for quick lookup of product stats
  productStatsMap = computed<Map<string, ProductPriceStats>>(() => {
    const statsMap = new Map<string, ProductPriceStats>();
    this.productsAnalytics().forEach(product => {
        // FIX: Adicionado um "guard clause" para pular produtos sem histórico de compras.
        // Isso previne erros de tempo de execução e pode corrigir falhas de inferência de tipo do TypeScript.
        if (!product.purchases || product.purchases.length === 0) {
            return;
        }
        const prices = product.purchases.map(p => p.unitPrice);
        const total = prices.reduce((acc, price) => acc + price, 0);
        const lastPurchase = product.purchases[0];

        statsMap.set(this.normalize(product.name), {
            name: product.name,
            category: product.category,
            averagePrice: total / prices.length,
            minPrice: Math.min(...prices),
            maxPrice: Math.max(...prices),
            lastPrice: lastPurchase.unitPrice,
            lastPurchase: lastPurchase,
            purchaseCount: prices.length
        });
    });
    return statsMap;
  });
  
  productsByCategory = computed<{ category: string; products: ProductPriceStats[] }[]>(() => {
    const categoryMap = new Map<string, ProductPriceStats[]>();
    // FIX: Explicitly type `stats` to resolve a TypeScript type inference issue where
    // `product` inside `forEach` was being inferred as `unknown`.
    const stats: ProductPriceStats[] = Array.from(this.productStatsMap().values());

    stats.forEach(product => {
        const category = product.category || 'Outros';
        if (!categoryMap.has(category)) {
            categoryMap.set(category, []);
        }
        categoryMap.get(category)!.push(product);
    });

    return Array.from(categoryMap.entries())
        .map(([category, products]) => ({ category, products: products.sort((a,b) => a.name.localeCompare(b.name)) }))
        .sort((a, b) => a.category.localeCompare(b.category));
  });

  // New: Analytics by store
  storeAnalytics = computed<StoreAnalytics[]>(() => {
    const storeMap = new Map<string, { receipts: Required<ReceiptData>[] }>();

    this.completedReceipts().forEach(receipt => {
      const key = receipt.storeCnpj || receipt.storeName; // Use CNPJ as a unique key if available
      if (!storeMap.has(key)) {
        storeMap.set(key, { receipts: [] });
      }
      storeMap.get(key)!.receipts.push(receipt);
    });

    const analytics: StoreAnalytics[] = [];
    storeMap.forEach((data) => {
      // FIX: Adicionado um "guard clause" para pular lojas sem recibos, prevenindo erros.
      if (data.receipts.length === 0) {
        return;
      }
      const sortedReceipts = data.receipts.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const totalSpent = sortedReceipts.reduce((sum, r) => sum + r.totalAmount, 0);
      const receiptCount = sortedReceipts.length;
      
      analytics.push({
        storeName: sortedReceipts[0].storeName,
        storeCnpj: sortedReceipts[0].storeCnpj,
        storeAddress: sortedReceipts[0].storeAddress,
        totalSpent: totalSpent,
        receiptCount: receiptCount,
        averageReceiptTotal: totalSpent / receiptCount,
        firstPurchaseDate: sortedReceipts[0].date,
        lastPurchaseDate: sortedReceipts[receiptCount - 1].date,
      });
    });

    return analytics.sort((a, b) => b.totalSpent - a.totalSpent);
  });

  getRecurringItems(limit: number = 10): string[] {
    const frequencyMap = new Map<string, { name: string; count: number }>();
    const completed = this.completedReceipts();

    completed.forEach(receipt => {
      receipt.items.forEach(item => {
        const normalizedName = this.normalize(item.name);
        if (frequencyMap.has(normalizedName)) {
          const existing = frequencyMap.get(normalizedName)!;
          existing.count++;
        } else {
          frequencyMap.set(normalizedName, { name: item.name, count: 1 });
        }
      });
    });

    return Array.from(frequencyMap.values())
      .filter(item => item.count > 1) // Only include items purchased more than once
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(item => item.name);
  }

  // Method for Smart List simulation
  simulateShoppingList(items: string[]): { storeName: string; total: number; foundItems: number; missingItems: string[] }[] {
    const storeSimulation: Map<string, { total: number; foundItems: Set<string>; allItems: Set<string> }> = new Map();
    const normalizedItems = items.map(item => this.normalize(item));

    // Get the most recent price for each item at each store
    const latestPrices = new Map<string, { storeName: string; unitPrice: number }>();
    this.productsAnalytics().forEach(product => {
      const normalizedName = this.normalize(product.name);
      if (normalizedItems.includes(normalizedName)) {
        product.purchases.forEach(purchase => {
          const key = `${normalizedName}|${purchase.storeName}`;
          if (!latestPrices.has(key)) {
            latestPrices.set(key, { storeName: purchase.storeName, unitPrice: purchase.unitPrice });
          }
        });
      }
    });

    latestPrices.forEach((priceInfo, key) => {
      const [itemName, storeName] = key.split('|');
      if (!storeSimulation.has(storeName)) {
        storeSimulation.set(storeName, { total: 0, foundItems: new Set(), allItems: new Set(normalizedItems) });
      }
      const storeData = storeSimulation.get(storeName)!;
      if (!storeData.foundItems.has(itemName)) {
        storeData.total += priceInfo.unitPrice;
        storeData.foundItems.add(itemName);
      }
    });

    const result = Array.from(storeSimulation.entries()).map(([storeName, data]) => {
      const missing = new Set(data.allItems);
      data.foundItems.forEach(item => missing.delete(item));
       const missingOriginalNames = Array.from(missing).map(normName => {
         const originalItem = items.find(i => this.normalize(i) === normName);
         return originalItem || normName;
       });
      return {
        storeName,
        total: data.total,
        foundItems: data.foundItems.size,
        missingItems: missingOriginalNames,
      };
    });

    // Sort by most items found, then by lowest price
    return result.sort((a, b) => {
      if (b.foundItems !== a.foundItems) {
        return b.foundItems - a.foundItems;
      }
      return a.total - b.total;
    });
  }
}