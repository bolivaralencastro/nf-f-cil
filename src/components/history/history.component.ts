import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReceiptService } from '../../services/receipt.service';
import { GoogleSheetsService } from '../../services/google-sheets.service';
import { ReceiptData } from '../../services/gemini.service';
import { ReceiptListComponent } from '../receipt-list/receipt-list.component';
import { ReceiptDetailsComponent } from '../receipt-details/receipt-details.component';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, ReceiptListComponent, ReceiptDetailsComponent, FormsModule],
  templateUrl: './history.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HistoryComponent implements OnInit {
  readonly receiptService = inject(ReceiptService);
  readonly sheetsService = inject(GoogleSheetsService);
  
  selectedReceipt = signal<ReceiptData | null>(null);
  receiptToDelete = signal<ReceiptData | null>(null);

  // Signals for settings
  showSettings = signal(false);
  scriptUrlInput = signal('');
  saveUrlMessage = signal<{text: string, isError: boolean} | null>(null);
  isSyncingAfterSave = signal(false);

  // Signals for migration
  isMigrating = signal(false);
  migrationMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.scriptUrlInput.set(this.sheetsService.scriptUrl() || '');
  }

  onReceiptSelected(receipt: ReceiptData) {
    if (receipt.status === 'completed') {
      this.selectedReceipt.set(receipt);
    }
  }

  resetSelection() {
    this.selectedReceipt.set(null);
  }

  onRetrySync(receiptId: string) {
    this.receiptService.retrySync(receiptId);
  }

  onReceiptUpdated(receipt: ReceiptData) {
    this.receiptService.updateReceipt(receipt);
    this.selectedReceipt.set(receipt);
  }

  onReprocessReceipt(receiptId: string) {
    this.receiptService.reprocessReceipt(receiptId);
  }

  onReceiptUrlUpdated({ id, newUrl }: { id: string, newUrl: string }) {
    this.receiptService.updateReceiptUrl(id, newUrl);
  }

  onDeleteRequested(receiptId: string) {
    const receipt = this.receiptService.receipts().find(r => r.id === receiptId);
    if (receipt) {
        this.receiptToDelete.set(receipt);
    }
  }

  confirmDelete() {
    const receipt = this.receiptToDelete();
    if (receipt) {
        this.receiptService.deleteReceipt(receipt.id);
        
        if (this.selectedReceipt()?.id === receipt.id) {
            this.selectedReceipt.set(null);
        }

        this.receiptToDelete.set(null);
    }
  }

  cancelDelete() {
    this.receiptToDelete.set(null);
  }

  async onSaveScriptUrl() {
    this.saveUrlMessage.set(null);
    this.isSyncingAfterSave.set(false);
    const result = this.sheetsService.setScriptUrl(this.scriptUrlInput());
    this.saveUrlMessage.set({ text: result.message, isError: !result.success });
    
    if (result.success) {
      this.isSyncingAfterSave.set(true);
      await this.receiptService.syncLocalDataToSheets();
      this.isSyncingAfterSave.set(false);
      this.saveUrlMessage.set({ text: 'Sincronização concluída! Os dados foram atualizados.', isError: false });
      this.receiptService.initialLoad(); // Recarrega do Google Sheets
    }

    setTimeout(() => this.saveUrlMessage.set(null), 5000);
  }

  onMigrate() {
    if (!this.sheetsService.isConfigured() || this.isMigrating()) {
        return;
    }
    this.isMigrating.set(true);
    this.migrationMessage.set(null);

    this.sheetsService.migrateOldData().subscribe({
        next: (response) => {
            if (response?.success) {
                this.migrationMessage.set(response.message || 'Migração concluída com sucesso!');
            } else {
                this.migrationMessage.set('A migração falhou ou não havia nada para migrar.');
            }
            setTimeout(() => this.migrationMessage.set(null), 5000);
        },
        error: (err) => {
            console.error('Migration failed', err);
            this.migrationMessage.set('Ocorreu um erro durante a migração.');
            setTimeout(() => this.migrationMessage.set(null), 5000);
        },
        complete: () => {
            this.isMigrating.set(false);
        }
    });
  }
}
