import { Component, ChangeDetectionStrategy, inject, AfterViewInit, ElementRef, viewChild, signal, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnalyticsService, StoreAnalytics } from '../../services/analytics.service';
import { GeocodingService, Coordinates } from '../../services/geocoding.service';
import { forkJoin } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ReceiptService } from '../../services/receipt.service';

// Declaração para informar ao TypeScript sobre a variável global L do Leaflet
declare const L: any;

interface StoreLocation extends StoreAnalytics {
    coordinates: Coordinates | null;
    geocodingStatus: 'pending' | 'loading' | 'success' | 'error';
}

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './map.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapComponent implements AfterViewInit, OnDestroy {
    private readonly analyticsService = inject(AnalyticsService);
    private readonly geocodingService = inject(GeocodingService);
    private readonly receiptService = inject(ReceiptService);
    
    mapContainer = viewChild.required<ElementRef>('map');
    private map: any;
    private markersLayer: any;

    stores = signal<StoreLocation[]>([]);
    mapInitialized = signal(false);

    // Sinais para o modal de edição
    storeToEdit = signal<StoreLocation | null>(null);
    editedAddress = signal<string>('');
    
    constructor() {
      effect(() => {
        if (!this.mapInitialized()) return; // Só roda depois que o mapa estiver pronto
        const newStoreData = this.analyticsService.storeAnalytics();
        this.processStoreData(newStoreData);
      });
    }

    ngAfterViewInit() {
        this.initMap();
        this.mapInitialized.set(true); // Aciona o effect para a carga inicial
    }

    ngOnDestroy() {
        if (this.map) {
            // Garante que o mapa seja destruído para evitar vazamentos de memória
            this.map.remove();
        }
    }

    private initMap() {
        if (this.map || !this.mapContainer()) return;

        // Inicializa o mapa centrado no Brasil
        this.map = L.map(this.mapContainer().nativeElement, {
            center: [-15.7801, -47.9292],
            zoom: 4,
            scrollWheelZoom: false,
        });

        // Adiciona a camada de tiles do OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(this.map);

        this.markersLayer = L.featureGroup().addTo(this.map);
    }
    
    private processStoreData(storesAnalytics: StoreAnalytics[]) {
        if (storesAnalytics.length === 0) {
            this.stores.set([]);
            return;
        };

        const initialStores: StoreLocation[] = storesAnalytics.map(s => ({
            ...s,
            coordinates: null,
            geocodingStatus: 'loading'
        }));
        this.stores.set(initialStores);

        const geocodingObservables = storesAnalytics.map(store => 
            this.geocodingService.getCoordinates(store.storeAddress)
        );

        forkJoin(geocodingObservables).subscribe(results => {
            const finalStores = storesAnalytics.map((store, index) => ({
                ...store,
                coordinates: results[index],
                geocodingStatus: results[index] ? 'success' : 'error' as 'success' | 'error'
            }));
            this.stores.set(finalStores);
            this.addMarkersToMap();
        });
    }

    private addMarkersToMap() {
      this.markersLayer.clearLayers();
      const markers: any[] = [];
      this.stores().forEach(store => {
        if(store.coordinates) {
          const popupContent = `
            <div class="font-sans">
              <strong class="text-base text-teal-500">${store.storeName}</strong>
              <p class="text-sm text-gray-600 mt-1">Total Gasto: 
                <span class="font-semibold">R$ ${store.totalSpent.toFixed(2)}</span>
              </p>
            </div>`;
          const marker = L.marker([store.coordinates.lat, store.coordinates.lon])
            .bindPopup(popupContent);
          markers.push(marker);
        }
      });
      
      // Ajusta o zoom do mapa para mostrar todos os marcadores
      if(markers.length > 0) {
        markers.forEach(m => this.markersLayer.addLayer(m));
        this.map.fitBounds(this.markersLayer.getBounds().pad(0.5));
      }
    }

    // Métodos para o modal de edição de endereço
    openEditModal(store: StoreLocation): void {
        this.storeToEdit.set(store);
        this.editedAddress.set(store.storeAddress);
    }

    closeEditModal(): void {
        this.storeToEdit.set(null);
    }

    saveAddressChange(): void {
        const store = this.storeToEdit();
        if (store && store.storeCnpj) {
            this.receiptService.updateStoreAddress(store.storeCnpj, this.editedAddress());
        }
        this.closeEditModal();
    }
}
