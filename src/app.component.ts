import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReceiptService } from './services/receipt.service';
import { HomeComponent } from './components/home/home.component';
import { ScannerComponent } from './components/scanner/scanner.component';
import { SmartListComponent } from './components/smart-list/smart-list.component';
import { MapComponent } from './components/map/map.component';
import { HistoryComponent } from './components/history/history.component';
import { PhotoCaptureComponent } from './components/photo-capture/photo-capture.component';
import { ReportsComponent } from './components/reports/reports.component';

type View = 'home' | 'lists' | 'map' | 'history' | 'reports';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HomeComponent,
    ScannerComponent,
    SmartListComponent,
    MapComponent,
    HistoryComponent,
    PhotoCaptureComponent,
    ReportsComponent
  ]
})
export class AppComponent {
  private readonly receiptService = inject(ReceiptService);

  // View management
  currentView = signal<View>('home');
  showCaptureChoice = signal(false);
  showQrScanner = signal(false);
  showPhotoScanner = signal(false);

  setView(view: View) {
    this.currentView.set(view);
  }

  openCaptureChoice() {
    this.showCaptureChoice.set(true);
  }

  closeCaptureChoice() {
    this.showCaptureChoice.set(false);
  }
  
  startQrScanner() {
    this.showCaptureChoice.set(false);
    this.showQrScanner.set(true);
  }

  startPhotoScanner() {
    this.showCaptureChoice.set(false);
    this.showPhotoScanner.set(true);
  }

  onQrScanCancelled() {
    this.showQrScanner.set(false);
  }

  onPhotoScanCancelled() {
    this.showPhotoScanner.set(false);
  }

  onQrScanSuccess(url: string) {
    this.showQrScanner.set(false);
    this.receiptService.addReceipt(url);
    this.currentView.set('history');
  }

  onUrlSubmit(url: string) {
    if (url) {
      this.closeCaptureChoice();
      this.receiptService.addReceipt(url);
      this.currentView.set('history');
    }
  }

  async onPhotoScanSuccess(photoData: string) {
    this.showPhotoScanner.set(false);
    await this.receiptService.addReceiptFromPhoto(photoData);
    this.currentView.set('history');
  }
}