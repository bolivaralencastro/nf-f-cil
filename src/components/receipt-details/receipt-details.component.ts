import { Component, ChangeDetectionStrategy, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReceiptData } from '../../services/gemini.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-receipt-details',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './receipt-details.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReceiptDetailsComponent {
  receipt = input.required<ReceiptData | null>();
  reset = output<void>();
  receiptUpdated = output<ReceiptData>();

  isEditing = signal(false);
  editableReceipt = signal<ReceiptData | null>(null);

  onReset() {
    this.reset.emit();
  }

  toggleEdit(startEditing: boolean): void {
    if (startEditing) {
      // Cria uma cópia profunda para edição para não afetar o estado original até salvar
      this.editableReceipt.set(JSON.parse(JSON.stringify(this.receipt())));
    } else {
      this.editableReceipt.set(null);
    }
    this.isEditing.set(startEditing);
  }

  saveChanges(): void {
    if (this.editableReceipt()) {
      this.receiptUpdated.emit(this.editableReceipt()!);
      this.toggleEdit(false);
    }
  }


  formatReceiptDate(dateString?: string): string {
    if (!dateString) {
      return 'N/A';
    }
    try {
      return new Date(dateString).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return 'Data inválida';
    }
  }
}
