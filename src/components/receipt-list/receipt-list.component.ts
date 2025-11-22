import { Component, ChangeDetectionStrategy, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReceiptData } from '../../services/gemini.service';

@Component({
  selector: 'app-receipt-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './receipt-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReceiptListComponent {
  receipts = input.required<ReceiptData[]>();
  syncEnabled = input<boolean>(false);
  receiptSelected = output<ReceiptData>();
  retrySync = output<string>();
  reprocess = output<string>();
  urlUpdated = output<{id: string, newUrl: string}>();
  delete = output<string>();

  editingUrlId = signal<string | null>(null);

  selectReceipt(receipt: ReceiptData) {
    if (receipt.status === 'completed') {
      this.receiptSelected.emit(receipt);
    }
  }

  onRetrySync(event: Event, receiptId: string) {
    event.stopPropagation();
    this.retrySync.emit(receiptId);
  }

  onReprocess(event: Event, receiptId: string) {
    event.stopPropagation();
    this.reprocess.emit(receiptId);
  }
  
  onDelete(event: Event, receiptId: string) {
    event.stopPropagation();
    this.delete.emit(receiptId);
  }

  toggleEditUrl(event: Event, receiptId: string | null) {
    event.stopPropagation();
    this.editingUrlId.set(receiptId);
  }

  onUrlSave(receiptId: string, newUrl: string) {
    this.urlUpdated.emit({ id: receiptId, newUrl });
    this.editingUrlId.set(null);
  }

  formatDate(dateString?: string): string {
    if (!dateString) return 'Data indisponível';
    try {
      return new Date(dateString).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch (e) {
      return dateString.split('T')[0] || dateString;
    }
  }
}
