import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { ReceiptData } from './gemini.service';

@Injectable({
  providedIn: 'root'
})
export class GoogleSheetsService {
  private readonly http = inject(HttpClient);
  private readonly SCRIPT_URL_KEY = 'google_script_url';
  
  private readonly _scriptUrl = signal<string | null>(null);
  public readonly scriptUrl = this._scriptUrl.asReadonly();

  private readonly _connectionError = signal<string | null>(null);
  public readonly connectionError = this._connectionError.asReadonly();

  constructor() {
    const savedUrl = localStorage.getItem(this.SCRIPT_URL_KEY);
    if (savedUrl) {
      this._scriptUrl.set(savedUrl);
    }
  }
  
  isConfigured(): boolean {
    return !!this._scriptUrl();
  }

  setScriptUrl(url: string): { success: boolean, message: string } {
    if (url && url.startsWith('https://script.google.com/macros/s/')) {
      localStorage.setItem(this.SCRIPT_URL_KEY, url);
      this._scriptUrl.set(url);
      this._connectionError.set(null); // Clear previous errors on new URL
      return { success: true, message: 'URL salva com sucesso!' };
    }
    return { success: false, message: 'URL inválida. Verifique o formato.' };
  }

  clearScriptUrl(): void {
    localStorage.removeItem(this.SCRIPT_URL_KEY);
    this._scriptUrl.set(null);
  }

  /**
   * Realiza uma requisição JSONP usando o HttpClient do Angular para contornar restrições de CORS.
   * Este método é mais robusto e confiável que a criação manual de tags <script>.
   */
  private jsonpRequest<T>(payload: object): Observable<T> {
    if (!this.isConfigured()) {
      return throwError(() => new Error('O serviço do Google Sheets não está configurado.'));
    }

    const currentScriptUrl = this._scriptUrl()!;
    const urlSafePayload = encodeURIComponent(JSON.stringify(payload));
    
    // O cliente JSONP do Angular anexa o parâmetro de callback automaticamente.
    // O nome padrão do parâmetro é 'callback', que corresponde ao nosso Apps Script.
    const url = `${currentScriptUrl}?payload=${urlSafePayload}`;

    return this.http.jsonp(url, 'callback').pipe(
      map(response => {
        this._connectionError.set(null); // Clear error on success
        return response as T;
      }),
      catchError(error => {
        console.error('Falha na requisição JSONP via HttpClient.', error);
        // Gera um erro mais descritivo para ajudar na depuração.
        const userFriendlyError = 'Falha na comunicação com o Google Sheets. Verifique se a URL do script está correta, sua conexão com a internet, e se o script foi implantado com acesso para "Qualquer pessoa".';
        this._connectionError.set(userFriendlyError);
        return throwError(() => new Error(userFriendlyError));
      })
    );
  }

  getReceipts(): Observable<ReceiptData[]> {
    if (!this.isConfigured()) {
        console.warn("URL do Google Apps Script não configurada. Usando o armazenamento local do navegador como fallback.");
        return of([]);
    }
    const payload = { action: 'get' };
    return this.jsonpRequest<ReceiptData[]>(payload).pipe(
      catchError(error => {
        console.error('Erro ao buscar dados do Google Sheets.', error.message);
        return of([]);
      })
    );
  }

  saveReceipt(receipt: ReceiptData): Observable<{ success: boolean; id: string } | null> {
    if (!this.isConfigured()) {
        console.warn("Tentativa de salvar no Google Sheets sem URL configurada.");
        return of(null);
    }
    const payload = { action: 'save', data: receipt };
    return this.jsonpRequest<{ success: boolean; id: string } | null>(payload).pipe(
      catchError(error => {
        console.error('Erro ao salvar dados no Google Sheets.', error.message);
        return of(null);
      })
    );
  }

  deleteReceipt(receiptId: string): Observable<{ success: boolean; id: string } | null> {
    if (!this.isConfigured()) {
        console.warn("Tentativa de deletar no Google Sheets sem URL configurada.");
        return of(null);
    }
    const payload = { action: 'delete', id: receiptId };
    return this.jsonpRequest<{ success: boolean; id: string } | null>(payload).pipe(
       catchError(error => {
        console.error(`Erro ao deletar o recibo ${receiptId} no Google Sheets.`, error.message);
        return of(null);
      })
    );
  }

  migrateOldData(): Observable<{ success: boolean; migratedCount: number; message: string } | null> {
    if (!this.isConfigured()) {
        console.warn("Tentativa de migrar dados no Google Sheets sem URL configurada.");
        return of(null);
    }
    const payload = { action: 'migrate' };
    return this.jsonpRequest<{ success: boolean; migratedCount: number; message: string } | null>(payload).pipe(
      catchError(error => {
        console.error('Erro ao iniciar a migração de dados.', error.message);
        return of(null);
      })
    );
  }
}