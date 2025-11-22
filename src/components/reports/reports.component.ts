import { Component, ChangeDetectionStrategy, signal, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GeminiService, ReceiptData } from '../../services/gemini.service';
import { ReceiptService } from '../../services/receipt.service';

type AiMessage = {
  role: 'user' | 'model';
  content: string;
};

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReportsComponent {
  private readonly geminiService = inject(GeminiService);
  readonly receiptService = inject(ReceiptService);
  backToHome = output<void>();

  activeTab = signal<'ai' | 'overview' | 'stores'>('ai');
  
  // AI Assistant state
  aiMessages = signal<AiMessage[]>([]);
  aiIsLoading = signal(false);
  userInput = signal('');
  
  predefinedQuestions = [
    "Quais foram minhas 5 maiores compras este mês?",
    "Em qual categoria eu mais gastei nos últimos 30 dias?",
    "Me dê dicas para economizar com base nas minhas compras.",
    "Qual loja tem o melhor preço médio para os produtos que mais compro?"
  ];

  onBackToHome() {
    this.backToHome.emit();
  }

  setTab(tab: 'ai' | 'overview' | 'stores') {
    this.activeTab.set(tab);
  }

  async askAi(question?: string) {
    const userQuestion = question || this.userInput();
    if (!userQuestion || this.aiIsLoading()) return;

    this.aiIsLoading.set(true);
    this.aiMessages.update(m => [...m, { role: 'user', content: userQuestion }]);
    this.userInput.set('');

    // Add a placeholder for the model's response
    this.aiMessages.update(m => [...m, { role: 'model', content: '' }]);

    try {
      const allReceipts = this.receiptService.receipts();
      const stream = await this.geminiService.getInsightsFromDataStream(userQuestion, allReceipts);
      
      for await (const chunk of stream) {
        const chunkText = chunk.text;
        this.aiMessages.update(messages => {
          const lastMessageIndex = messages.length - 1;
          if (lastMessageIndex >= 0 && messages[lastMessageIndex].role === 'model') {
            messages[lastMessageIndex].content += chunkText;
          }
          return [...messages];
        });
      }

    } catch (e) {
      console.error(e);
      this.aiMessages.update(messages => {
          const lastMessageIndex = messages.length - 1;
          if (lastMessageIndex >= 0 && messages[lastMessageIndex].role === 'model') {
            messages[lastMessageIndex].content = 'Desculpe, ocorreu um erro ao contatar a IA. Por favor, tente novamente.';
          }
          return [...messages];
        });
    } finally {
      this.aiIsLoading.set(false);
    }
  }
}
