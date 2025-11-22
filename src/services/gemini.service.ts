import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import { firstValueFrom } from 'rxjs';

export interface ReceiptItem {
  name: string;
  quantity: number;
  unit: string; // e.g., 'UN', 'KG', 'L'
  unitPrice: number;
  totalPrice: number;
  category: string; // e.g., 'Alimentos', 'Bebidas', 'Limpeza'
}

export interface ReceiptData {
  id: string;
  url?: string;
  status: 'processing' | 'completed' | 'error';
  storeName?: string;
  storeCnpj?: string;
  storeAddress?: string;
  date?: string;
  totalAmount?: number;
  items?: ReceiptItem[];
  error?: string;
  payer?: string;
  isSynced?: boolean; // Novo: Rastreia se foi salvo no Google Sheets
  syncing?: boolean; // Novo: Rastreia se está atualmente sincronizando
}

type ParsedReceiptData = Omit<ReceiptData, 'id' | 'url' | 'status' | 'error'>;

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private genAI: GoogleGenAI;
  private readonly http = inject(HttpClient);

  constructor() {
    if (!process.env.API_KEY) {
      console.error("API_KEY environment variable not set!");
    }
    this.genAI = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  }

  async extractReceiptDataFromUrl(url: string): Promise<ParsedReceiptData> {
    const model = 'gemini-2.5-flash';
    
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const htmlContent = await firstValueFrom(this.http.get(proxyUrl, { responseType: 'text' }));

      const prompt = `
        A seguir está o conteúdo HTML da página de consulta de uma NFC-e (Nota Fiscal de Consumidor Eletrônica) brasileira.
        Por favor, extraia o máximo de dados possíveis e retorne-os como um objeto JSON com a seguinte estrutura. Ignore scripts e estilos, foque no conteúdo textual e tabelas.

        Conteúdo HTML:
        \`\`\`html
        ${htmlContent}
        \`\`\`

        Extraia as seguintes informações e retorne-as como um objeto JSON:
        - storeName: O nome do estabelecimento.
        - storeCnpj: O CNPJ do estabelecimento.
        - storeAddress: O endereço completo do estabelecimento (rua, número, bairro, cidade, estado).
        - date: A data e hora da compra no formato ISO 8601 (YYYY-MM-DDTHH:mm:ss).
        - totalAmount: O valor total da nota como um número.
        - items: Um array de objetos, onde cada objeto representa um item comprado e contém:
          - name: A descrição do produto.
          - quantity: A quantidade do item como um número (ex: 1, 0.5, 1.253).
          - unit: A unidade de medida do item (ex: 'UN', 'KG', 'L', 'M', 'CX'). Se não estiver explícito, assuma 'UN' para unidade.
          - unitPrice: O preço por unidade de medida do item como um número (ex: preço por unidade, preço por KG, preço por Litro).
          - totalPrice: O preço total para essa linha de item como um número.
          - category: A categoria do produto. Tente classificar o item em uma das seguintes categorias: 'Alimentos', 'Bebidas', 'Laticínios', 'Frios e Embutidos', 'Hortifruti', 'Padaria', 'Açougue', 'Limpeza', 'Higiene Pessoal', 'Casa e Decoração', 'Pet', 'Outros'.

        Sua resposta deve ser APENAS o objeto JSON, sem nenhum outro texto ou formatação markdown. Se uma informação não for encontrada, use um valor padrão apropriado (ex: string vazia, 0, ou um array vazio).
      `;

      const response = await this.genAI.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              storeName: { type: Type.STRING },
              storeCnpj: { type: Type.STRING },
              storeAddress: { type: Type.STRING },
              date: { type: Type.STRING },
              totalAmount: { type: Type.NUMBER },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    unit: { type: Type.STRING },
                    unitPrice: { type: Type.NUMBER },
                    totalPrice: { type: Type.NUMBER },
                    category: { type: Type.STRING }
                  },
                  required: ["name", "quantity", "unit", "unitPrice", "totalPrice", "category"]
                }
              }
            },
            required: ["storeName", "storeCnpj", "storeAddress", "date", "totalAmount", "items"]
          }
        }
      });
      
      const jsonText = response.text.trim();
      return JSON.parse(jsonText);

    } catch (error) {
        console.error("Error fetching or processing receipt data:", error);

        if (error instanceof HttpErrorResponse) {
            let userMessage = "Falha ao buscar os dados da URL da nota fiscal. ";
            if (error.status === 0) {
                userMessage += "Pode ser um problema de rede, CORS, ou o site pode estar offline.";
            } else {
                userMessage += `O servidor respondeu com o código ${error.status}.`;
            }
            throw new Error(userMessage);
        }

        let underlyingErrorMessage = "Ocorreu um erro desconhecido.";
        if (error instanceof Error) {
            underlyingErrorMessage = error.message;
        } else if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
            underlyingErrorMessage = (error as { message: string }).message;
        } else if (typeof error === 'string') {
            underlyingErrorMessage = error;
        }

        throw new Error(`Erro no processamento com a IA: ${underlyingErrorMessage}`);
    }
  }

  async extractUrlFromImage(base64ImageData: string): Promise<string> {
    const model = 'gemini-2.5-flash';

    try {
        const imagePart = {
            inlineData: {
                mimeType: 'image/jpeg',
                data: base64ImageData,
            },
        };

        const prompt = `
            Analise a imagem de uma Nota Fiscal de Consumidor Eletrônica (NFC-e) brasileira e extraia APENAS a URL de consulta que geralmente se encontra perto do QR Code ou no final da nota.
            Sua resposta deve conter exclusivamente a URL, sem nenhum texto adicional, cabeçalhos, explicações ou formatação. A resposta deve ser apenas o texto da URL.
        `;

        const response = await this.genAI.models.generateContent({
            model: model,
            contents: { parts: [{text: prompt}, imagePart] },
        });
        
        const url = response.text.trim();

        if (!url || !url.startsWith('http')) {
            throw new Error("Nenhuma URL válida foi encontrada na imagem.");
        }

        return url;

    } catch (error) {
        console.error("Error extracting URL from receipt image:", error);
        
        let underlyingErrorMessage = "Ocorreu um erro desconhecido.";
        if (error instanceof Error) {
            underlyingErrorMessage = error.message;
        } else if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
            underlyingErrorMessage = (error as { message: string }).message;
        } else if (typeof error === 'string') {
            underlyingErrorMessage = error;
        }
        
        if (underlyingErrorMessage.includes("Nenhuma URL válida foi encontrada na imagem.")) {
            throw new Error(underlyingErrorMessage);
        }
        
        throw new Error(`Falha ao extrair URL da imagem: ${underlyingErrorMessage}`);
    }
  }
  
  async getInsightsFromDataStream(question: string, data: ReceiptData[]): Promise<AsyncGenerator<GenerateContentResponse>> {
    const model = 'gemini-2.5-flash';

    // Provide detailed data to the model for better insights, especially for item-specific questions.
    const detailedData = data
      .filter((r): r is Required<ReceiptData> => r.status === 'completed' && !!r.items)
      .map(receipt => ({
        // Selecting only the most relevant fields to keep the payload focused and within token limits.
        storeName: receipt.storeName,
        date: receipt.date,
        totalAmount: receipt.totalAmount,
        payer: receipt.payer,
        items: receipt.items.map(item => ({
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            category: item.category
        }))
      }));

    const systemPrompt = `Você é um assistente financeiro amigável e perspicaz. Analise os dados de gastos do usuário, fornecidos como um array de recibos em JSON, e responda à pergunta dele. Cada recibo contém uma lista detalhada de itens. Ao analisar preços de itens, preste atenção ao 'unitPrice' e à 'unit' (unidade). Forneça respostas claras, úteis e formatadas em markdown para fácil leitura. Use moeda BRL (R$). Hoje é ${new Date().toLocaleDateString('pt-BR')}.`;

    const userPrompt = `
      Aqui estão meus dados de gastos:
      \`\`\`json
      ${JSON.stringify(detailedData, null, 2)}
      \`\`\`
      Minha pergunta é: "${question}"
    `;

    try {
      const responseStream = await this.genAI.models.generateContentStream({
        model: model,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt
        }
      });
      return responseStream;
    } catch (error) {
      console.error("Error getting insights from Gemini:", error);
      let underlyingErrorMessage = "Ocorreu um erro desconhecido ao contatar a IA.";
      if (error instanceof Error) {
          underlyingErrorMessage = error.message;
      }
      throw new Error(`Falha ao obter insights da IA: ${underlyingErrorMessage}`);
    }
  }
}