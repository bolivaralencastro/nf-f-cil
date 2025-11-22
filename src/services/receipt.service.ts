import { Injectable, signal, effect, inject } from '@angular/core';
import { GeminiService, ReceiptData } from './gemini.service';
import { GoogleSheetsService } from './google-sheets.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class ReceiptService {
  private readonly geminiService = inject(GeminiService);
  private readonly sheetsService = inject(GoogleSheetsService);
  private readonly STORAGE_KEY = 'receipts_data';

  private readonly _receipts = signal<ReceiptData[]>([]);
  public readonly receipts = this._receipts.asReadonly();
  
  public readonly isLoading = signal<boolean>(true);
  private isProcessing = signal(false);

  constructor() { 
    this.initialLoad();
    
    effect(() => {
      if (this.receipts().some(r => r.status === 'processing' && r.url) && !this.isProcessing()) {
        this.processQueue();
      }
    });

    effect(() => {
      if (!this.sheetsService.isConfigured() && !this.isLoading()) {
        const receiptsToSave = this.receipts().filter(r => r.status !== 'processing');
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(receiptsToSave));
      }
    });
  }

  public initialLoad() {
    this.isLoading.set(true);

    if (this.sheetsService.isConfigured()) {
      this.sheetsService.getReceipts().subscribe(data => {
        const sanitizedData = data.map((r): ReceiptData => {
          const baseReceipt = r.status === 'processing' 
            ? { ...r, status: 'error' as const, error: 'O processamento falhou em uma sessão anterior.' } 
            : { ...r, status: r.status as 'completed' | 'error' };
          return { ...baseReceipt, isSynced: true };
        });
        this._receipts.set(sanitizedData);
        this.isLoading.set(false);
      });
    } else {
      try {
        const localData = localStorage.getItem(this.STORAGE_KEY);
        if (localData) {
          const parsedData: ReceiptData[] = JSON.parse(localData);
          this._receipts.set(parsedData.map(r => ({ ...r, isSynced: false })));
        }
      } catch (e) {
        console.error('Falha ao carregar ou analisar os recibos do localStorage.', e);
        this._receipts.set([]);
      }
      this.isLoading.set(false);
    }
  }

  addReceipt(url: string) {
    const existing = this.receipts().find(r => r.url === url);
    if (existing) {
        console.log("URL já existe na fila ou foi processada.");
        return;
    }

    const newReceipt: ReceiptData = {
      id: self.crypto.randomUUID(),
      url,
      status: 'processing',
      isSynced: false,
    };
    this._receipts.update(currentReceipts => [newReceipt, ...currentReceipts]);

    // Save initial processing state to the sheet
    if (this.sheetsService.isConfigured()) {
      this.sheetsService.saveReceipt(newReceipt).subscribe({
        error: (err) => console.error(`Falha ao criar a linha inicial para o recibo ${newReceipt.id}`, err)
      });
    }
  }

  async addReceiptFromPhoto(photoDataBase64: string): Promise<void> {
    const tempId = self.crypto.randomUUID();
    const newReceipt: ReceiptData = {
      id: tempId,
      status: 'processing',
      storeName: 'Lendo URL da imagem...',
      isSynced: false,
    };
    this._receipts.update(currentReceipts => [newReceipt, ...currentReceipts]);

    try {
        const url = await this.geminiService.extractUrlFromImage(photoDataBase64);

        const existing = this.receipts().find(r => r.url === url);
        if (existing) {
            this._receipts.update(current =>
                current.map(r =>
                    r.id === tempId
                        ? { ...r, status: 'error', error: 'Esta nota fiscal já foi escaneada.', storeName: 'Nota Duplicada' }
                        : r
                )
            );
            return;
        }

        // Update the temporary receipt with the extracted URL and save its initial state
        let receiptToSave: ReceiptData | undefined;
        this._receipts.update(current =>
            current.map(r => {
              if (r.id === tempId) {
                receiptToSave = { ...r, url: url, storeName: 'URL extraída, aguardando...' };
                return receiptToSave;
              }
              return r;
            })
        );
        
        if (receiptToSave && this.sheetsService.isConfigured()) {
            this.sheetsService.saveReceipt(receiptToSave).subscribe({
                error: (err) => console.error(`Falha ao criar a linha inicial para o recibo ${receiptToSave!.id}`, err)
            });
        }

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha desconhecida ao extrair URL da imagem.';
        this._receipts.update(current =>
            current.map(r =>
                r.id === tempId
                    ? { ...r, status: 'error', error: message, storeName: 'Falha na Extração da URL' }
                    : r
            )
        );
    }
  }


  private async processQueue() {
    if (this.isProcessing()) return;

    const receiptToProcess = this.receipts().find(r => r.status === 'processing' && r.url);
    if (!receiptToProcess || !receiptToProcess.url) return;

    this.isProcessing.set(true);

    try {
      const parsedData = await this.geminiService.extractReceiptDataFromUrl(receiptToProcess.url);
      const completedReceipt: ReceiptData = { 
        ...receiptToProcess, 
        ...parsedData, 
        status: 'completed',
        isSynced: false // Começa como não sincronizado
      };
      
      this._receipts.update(current =>
        current.map(r =>
          r.id === receiptToProcess.id
            ? completedReceipt
            : r
        )
      );

      if (this.sheetsService.isConfigured()) {
        this.sheetsService.saveReceipt(completedReceipt).subscribe({
          next: (response) => {
              if (response?.success) {
                  this._receipts.update(current => current.map(r => r.id === completedReceipt.id ? {...r, isSynced: true} : r));
                  console.log(`Recibo ${response.id} salvo com sucesso no Google Sheets.`);
              } else {
                  console.error(`Falha ao salvar o recibo ${completedReceipt.id} no Google Sheets.`);
              }
          },
          error: (err) => {
              console.error(`Erro de rede ao salvar o recibo ${completedReceipt.id}`, err);
          }
        });
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha desconhecida no processamento.';
      const errorReceipt = { ...receiptToProcess, status: 'error' as const, error: message };

      this._receipts.update(current =>
        current.map(r =>
          r.id === receiptToProcess.id
            ? errorReceipt
            : r
        )
      );
      
      // Update the sheet with the error status
      if (this.sheetsService.isConfigured()) {
        this.sheetsService.saveReceipt(errorReceipt).subscribe();
      }

    } finally {
      this.isProcessing.set(false);
    }
  }

  public retrySync(receiptId: string): void {
    const receiptToSync = this.receipts().find(r => r.id === receiptId);

    if (!receiptToSync || receiptToSync.status !== 'completed' || receiptToSync.isSynced || receiptToSync.syncing) {
      return;
    }
    
    if (!this.sheetsService.isConfigured()) {
        console.error("Não é possível sincronizar: a URL do Google Sheets não está configurada.");
        return;
    }

    this._receipts.update(current => current.map(r => r.id === receiptId ? { ...r, syncing: true } : r));

    this.sheetsService.saveReceipt(receiptToSync).subscribe({
      next: (response) => {
        if (response?.success) {
          this._receipts.update(current => current.map(r => r.id === receiptId ? { ...r, isSynced: true, syncing: false } : r));
        } else {
          this._receipts.update(current => current.map(r => r.id === receiptId ? { ...r, syncing: false } : r));
        }
      },
      error: () => {
        this._receipts.update(current => current.map(r => r.id === receiptId ? { ...r, syncing: false } : r));
      }
    });
  }

  public async syncLocalDataToSheets(): Promise<void> {
    if (!this.sheetsService.isConfigured()) {
      console.log("Não é possível sincronizar: o serviço do Google Sheets não está configurado.");
      return;
    }

    const localReceiptsToSync = this.receipts().filter(r => !r.isSynced);
    if (localReceiptsToSync.length === 0) {
      console.log("Nenhum dado local para sincronizar.");
      return;
    }

    const syncObservables = localReceiptsToSync.map(receipt => {
      this._receipts.update(current => current.map(r => r.id === receipt.id ? { ...r, syncing: true } : r));
      return this.sheetsService.saveReceipt(receipt).pipe(
        catchError(() => of({ success: false, id: receipt.id })) // Em caso de erro, retorna um objeto de falha
      );
    });

    forkJoin(syncObservables).subscribe(results => {
      this._receipts.update(current =>
        current.map(receipt => {
          const result = results.find(res => res?.id === receipt.id);
          if (result) {
            return { ...receipt, isSynced: result.success, syncing: false };
          }
          return { ...receipt, syncing: false }; // Garante que o syncing seja removido mesmo que não esteja no resultado
        })
      );
      this.initialLoad(); // Recarrega os dados da planilha como fonte da verdade
    });
  }

  public updateReceipt(updatedReceipt: ReceiptData): void {
    // Marca o recibo como não sincronizado para que as alterações sejam salvas
    const receiptWithSyncState = { ...updatedReceipt, isSynced: false };

    this._receipts.update(current =>
      current.map(r => (r.id === receiptWithSyncState.id ? receiptWithSyncState : r))
    );

    // Se o Google Sheets estiver configurado, aciona a sincronização
    if (this.sheetsService.isConfigured()) {
      this.retrySync(receiptWithSyncState.id);
    }
  }

  public updateStoreAddress(storeCnpj: string, newAddress: string): void {
    const receiptsToUpdateIds = this.receipts()
      .filter(r => r.storeCnpj === storeCnpj)
      .map(r => r.id);

    if (receiptsToUpdateIds.length === 0) return;

    // Atualiza o estado local para todos os recibos correspondentes
    this._receipts.update(current =>
      current.map(r =>
        r.storeCnpj === storeCnpj
          ? { ...r, storeAddress: newAddress, isSynced: false }
          : r
      )
    );

    // Aciona a sincronização para cada recibo modificado
    if (this.sheetsService.isConfigured()) {
      receiptsToUpdateIds.forEach(id => this.retrySync(id));
    }
  }

  public reprocessReceipt(receiptId: string): void {
    let receiptToReprocess: ReceiptData | null = null;
    this._receipts.update(current =>
      current.map(r => {
        if (r.id === receiptId) {
          receiptToReprocess = { ...r, status: 'processing', error: undefined, storeName: 'Reprocessando...' };
          return receiptToReprocess;
        }
        return r;
      })
    );
    // Persist the "processing" state change to the sheet before starting the queue
    if (receiptToReprocess && this.sheetsService.isConfigured()) {
      this.sheetsService.saveReceipt(receiptToReprocess).subscribe();
    }
  }
  
  public updateReceiptUrl(receiptId: string, newUrl: string): void {
    this._receipts.update(current =>
      current.map(r =>
        r.id === receiptId
          ? { ...r, url: newUrl }
          : r
      )
    );
  }

  public deleteReceipt(receiptId: string): void {
    const receiptToDelete = this.receipts().find(r => r.id === receiptId);
    if (!receiptToDelete) {
      return;
    }

    // Optimistically remove from local state
    this._receipts.update(current => current.filter(r => r.id !== receiptId));

    // If configured, send delete request to Google Sheets
    if (this.sheetsService.isConfigured()) {
      this.sheetsService.deleteReceipt(receiptId).subscribe({
        error: (err) => {
          console.error(`Falha ao deletar o recibo ${receiptId} do Google Sheets.`, err);
          // For a better UX, we could re-add the receipt to the list to show the delete failed.
          // For now, just logging the error.
        }
      });
    }
  }
}