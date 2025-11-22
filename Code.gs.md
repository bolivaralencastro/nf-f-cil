// Google Apps Script - Code.gs
// Versão FINAL com JSONP para máxima compatibilidade com CORS

// !!! IMPORTANTE !!!
// O ID da sua planilha. Verifique se este valor está correto.
// Você o encontra na URL: https://docs.google.com/spreadsheets/d/ID_DA_PLANILHA/edit
const SPREADSHEET_ID = '1zRIGJVAUNVZZNeUJ1Ee1gueF-pF2GjdU0qCCpuLOshA';
const RECEIPTS_SHEET_NAME = 'Recibos';
const ITEMS_SHEET_NAME = 'Itens';

// =================================================================
// FUNÇÃO CENTRALIZADA DE RESPOSTA (JSONP)
// =================================================================

/**
 * Cria uma resposta no formato JSONP (JSON with Padding).
 * Isso envolve o objeto de dados em uma chamada de função JavaScript,
 * que é o método mais robusto para contornar problemas de CORS.
 */
function createJsonResponse(callbackFunction, dataObject) {
  if (!callbackFunction) {
    // Fallback para JSON normal se o callback não for fornecido (para depuração)
    return ContentService.createTextOutput(JSON.stringify(dataObject))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  const jsonString = JSON.stringify(dataObject);
  const jsonpResponse = `${callbackFunction}(${jsonString});`;
  
  return ContentService.createTextOutput(jsonpResponse)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

// =================================================================
// FUNÇÕES AUXILIARES DE ACESSO À PLANILHA
// =================================================================

/**
 * Abre a planilha pelo ID. Lança um erro claro se falhar.
 */
function getSpreadsheet() {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    const errorMessage = 'Não foi possível acessar a planilha. Verifique se o SPREADSHEET_ID no script está correto e se o e-mail associado a este script tem permissão para editar a planilha.';
    Logger.log(errorMessage + ' Detalhes: ' + e.toString());
    throw new Error(errorMessage);
  }
}

/**
 * Obtém uma aba (Sheet) pelo nome. Garante que a aba exista e que os cabeçalhos
 * estejam corretos na primeira linha, criando ou corrigindo-os conforme necessário.
 * Também congela a linha de cabeçalho para melhor usabilidade.
 */
function getSheet(spreadsheet, sheetName, headers) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  
  if (!sheet) {
    // Se a aba não existe, cria, adiciona cabeçalhos e congela a primeira linha.
    sheet = spreadsheet.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    Logger.log(`Aba "${sheetName}" foi criada com os cabeçalhos corretos.`);
  } else {
    // Se a aba já existe, verifica se os cabeçalhos estão presentes e corretos.
    if (sheet.getLastRow() < 1) {
      // A aba está vazia, então apenas adiciona os cabeçalhos.
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
      Logger.log(`Cabeçalhos adicionados à aba vazia "${sheetName}".`);
    } else {
      const range = sheet.getRange(1, 1, 1, headers.length);
      const currentHeaders = range.getValues()[0];
      const headersMatch = headers.every((header, i) => header === currentHeaders[i]);
      
      if (!headersMatch) {
        // Cabeçalhos não correspondem. Sobrescreve a primeira linha para corrigir.
        // Esta é uma ação de "auto-reparo" que assume um erro de configuração inicial.
        range.setValues([headers]);
        sheet.setFrozenRows(1);
        Logger.log(`Cabeçalhos corrigidos para a aba "${sheetName}".`);
      }
    }
  }
  return sheet;
}

// =================================================================
// PONTO DE ENTRADA PRINCIPAL (doGet)
// =================================================================

/**
 * Ponto de entrada para todas as requisições. O JSONP funciona via GET.
 * Esta função age como um roteador, decodificando o payload e direcionando para a função correta.
 */
function doGet(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000); // Espera até 30 segundos pelo acesso exclusivo

  const callback = e.parameter.callback;

  try {
    if (!e.parameter.payload) {
      return createJsonResponse(callback, { error: 'Requisição inválida. O parâmetro "payload" está ausente.' });
    }
    
    // O payload não está mais em Base64. Apps Script já decodifica o parâmetro da URL.
    const payload = JSON.parse(e.parameter.payload);
    
    if (!payload.action) {
      return createJsonResponse(callback, { error: 'O payload da requisição não contém o parâmetro "action".' });
    }

    const action = payload.action;

    // Roteador de Ações
    if (action === 'get') {
      return handleGet(callback);
    }
    
    // As ações a seguir precisam do objeto da planilha
    const spreadsheet = getSpreadsheet();
    const receiptHeaders = [
      'id', 'url', 'status', 'storeName', 'storeCnpj', 'storeAddress', 
      'date', 'totalAmount', 'items', 'error', 'payer', 'timestamp'
    ];
    const itemHeaders = [
      'item_id', 'receipt_id', 'name', 'quantity', 'unit', 
      'unitPrice', 'totalPrice', 'category', 'timestamp'
    ];
    const receiptsSheet = getSheet(spreadsheet, RECEIPTS_SHEET_NAME, receiptHeaders);
    const itemsSheet = getSheet(spreadsheet, ITEMS_SHEET_NAME, itemHeaders);
    
    if (action === 'delete') {
      if (!payload.id) return createJsonResponse(callback, { error: 'Parâmetro "id" ausente para a ação de deletar.' });
      return handleDelete(callback, receiptsSheet, itemsSheet, payload.id);
    } 
    
    if (action === 'migrate') {
      return handleMigration(callback, receiptsSheet, itemsSheet);
    } 
    
    if (action === 'save') {
      if (!payload.data) return createJsonResponse(callback, { error: 'Parâmetro "data" ausente para a ação de salvar.' });
      const receiptData = payload.data;
      if (!receiptData.id) return createJsonResponse(callback, { error: 'Objeto "data" não contém um "id".' });
      return handleSaveOrUpdate(callback, receiptsSheet, itemsSheet, receiptData);
    }

    // Se nenhuma ação corresponder
    return createJsonResponse(callback, { error: `Ação "${action}" é inválida.` });

  } catch (error) {
    Logger.log('Erro em doGet: ' + error.toString() + ' Stack: ' + error.stack);
    if (e && e.parameter && e.parameter.payload) {
      Logger.log('Payload recebido que causou o erro: ' + e.parameter.payload);
    }
    return createJsonResponse(callback, { error: 'Falha ao processar a requisição.', details: error.message });
  } finally {
    lock.releaseLock(); // Libera o acesso para a próxima requisição
  }
}


// =================================================================
// FUNÇÕES DE LÓGICA (HANDLERS)
// =================================================================

/**
 * Busca e retorna todos os recibos.
 */
function handleGet(callback) {
  try {
    const spreadsheet = getSpreadsheet();
    const headers = [
      'id', 'url', 'status', 'storeName', 'storeCnpj', 'storeAddress', 
      'date', 'totalAmount', 'items', 'error', 'payer', 'timestamp'
    ];
    const receiptsSheet = getSheet(spreadsheet, RECEIPTS_SHEET_NAME, headers);
    
    if (receiptsSheet.getLastRow() < 2) {
      return createJsonResponse(callback, []);
    }
    
    const sheetHeaders = receiptsSheet.getRange(1, 1, 1, receiptsSheet.getLastColumn()).getValues()[0];
    const data = receiptsSheet.getRange(2, 1, receiptsSheet.getLastRow() - 1, receiptsSheet.getLastColumn()).getValues();

    const receipts = data.map(row => {
      const receipt = {};
      sheetHeaders.forEach((header, index) => {
        let value = row[index];
        if (header === 'totalAmount' && value !== '') {
          value = parseFloat(value) || 0;
        } else if (header === 'items' && typeof value === 'string' && value.startsWith('[')) {
          try { 
            value = JSON.parse(value); 
          } catch (err) { 
            value = [];
          }
        }
        receipt[header] = value;
      });
      return receipt;
    });

    return createJsonResponse(callback, receipts);

  } catch (error) {
    Logger.log('Erro em handleGet: ' + error.toString());
    return createJsonResponse(callback, { error: 'Falha ao buscar dados.', details: error.message });
  }
}


/**
 * Salva uma nova nota ou atualiza uma existente.
 * Esta versão é mais robusta: lê a ordem dos cabeçalhos da planilha e monta os dados
 * de acordo, garantindo que cada campo seja salvo na coluna correta.
 */
function handleSaveOrUpdate(callback, receiptsSheet, itemsSheet, data) {
    Logger.log("Iniciando handleSaveOrUpdate para o ID: " + data.id);
    Logger.log("Dados recebidos: " + JSON.stringify(data, null, 2));

    const sheetHeaders = receiptsSheet.getRange(1, 1, 1, receiptsSheet.getLastColumn()).getValues()[0];
    const idColumnIndex = sheetHeaders.indexOf('id') + 1; // 1-based index
    if (idColumnIndex === 0) {
        throw new Error("A coluna 'id' não foi encontrada na planilha 'Recibos'.");
    }

    const existingRowNumber = findRowById(receiptsSheet, data.id, idColumnIndex);

    // Constrói a linha de dados na mesma ordem dos cabeçalhos da planilha
    const rowData = sheetHeaders.map(header => {
        if (header === 'timestamp') {
            return new Date().toISOString(); // Sempre gera um novo timestamp
        }
        const value = data[header];
        if (typeof value === 'object' && value !== null) {
            return JSON.stringify(value);
        }
        // Retorna o valor se existir, senão uma string vazia
        return value !== undefined ? value : '';
    });

    if (existingRowNumber > 0) {
        // Atualiza a linha existente
        receiptsSheet.getRange(existingRowNumber, 1, 1, rowData.length).setValues([rowData]);
        Logger.log(`Linha ${existingRowNumber} atualizada para o ID: ${data.id}`);
    } else {
        // Adiciona uma nova linha
        receiptsSheet.appendRow(rowData);
        Logger.log(`Nova linha adicionada para o ID: ${data.id}`);
    }

    // Processa e salva os itens, se houver
    if (data.items && Array.isArray(data.items)) {
        processAndSaveItems(itemsSheet, data.id, data.items);
    }
    
    return createJsonResponse(callback, { success: true, id: data.id, message: "Dados salvos com sucesso." });
}

/**
 * Deleta um recibo e todos os seus itens associados.
 */
function handleDelete(callback, receiptsSheet, itemsSheet, id) {
    // A coluna ID é sempre a primeira.
    const ID_COLUMN = 1;
    const rowToDelete = findRowById(receiptsSheet, id, ID_COLUMN);

    if (rowToDelete > 0) {
      receiptsSheet.deleteRow(rowToDelete);
    }
    
    deleteItemsByReceiptId(itemsSheet, id);

    return createJsonResponse(callback, { success: true, id: id, message: "Recibo e itens associados deletados." });
}

/**
 * Migrates item data from old receipts stored as JSON into the normalized 'Itens' sheet.
 * This version will re-process all receipts to ensure data is up-to-date.
 */
function handleMigration(callback, receiptsSheet, itemsSheet) {
  Logger.log("Iniciando a migração/atualização de itens de recibos.");
  
  if (receiptsSheet.getLastRow() < 2) {
    return createJsonResponse(callback, { success: true, migratedCount: 0, message: "Nenhum recibo para migrar." });
  }
  const receiptHeaders = receiptsSheet.getRange(1, 1, 1, receiptsSheet.getLastColumn()).getValues()[0];
  const receiptData = receiptsSheet.getRange(2, 1, receiptsSheet.getLastRow() - 1, receiptsSheet.getLastColumn()).getValues();
  const idColumnIndex = receiptHeaders.indexOf('id');
  const itemsColumnIndex = receiptHeaders.indexOf('items');

  if (idColumnIndex === -1 || itemsColumnIndex === -1) {
    throw new Error("As colunas 'id' e 'items' são necessárias na aba 'Recibos' para a migração.");
  }

  // Filtra os recibos que contêm um JSON de itens válido para processamento.
  // Não verifica mais se já existem, permitindo a atualização.
  const receiptsToMigrate = receiptData.filter(row => {
    const itemsJson = row[itemsColumnIndex];
    return typeof itemsJson === 'string' && itemsJson.trim().startsWith('[') && itemsJson.trim() !== '[]';
  });

  if (receiptsToMigrate.length === 0) {
    Logger.log("Nenhum recibo com dados de itens para migrar foi encontrado.");
    return createJsonResponse(callback, { success: true, migratedCount: 0, message: "Nenhum recibo continha dados de itens para processar." });
  }

  Logger.log(receiptsToMigrate.length + " recibos serão processados para migração/atualização de itens.");
  
  let migratedCount = 0;
  receiptsToMigrate.forEach(row => {
    try {
      const receiptId = row[idColumnIndex];
      const items = JSON.parse(row[itemsColumnIndex]);
      if (receiptId && Array.isArray(items) && items.length > 0) {
        processAndSaveItems(itemsSheet, receiptId, items);
        migratedCount++;
      }
    } catch (e) {
      Logger.log("Erro ao processar o JSON de itens para o recibo ID (pulando): " + row[idColumnIndex] + ". Erro: " + e.toString());
    }
  });

  Logger.log("Migração concluída. " + migratedCount + " recibos tiveram seus itens processados.");

  return createJsonResponse(callback, { success: true, migratedCount: migratedCount, message: `${migratedCount} recibo(s) tiveram seus itens migrados/atualizados com sucesso.` });
}


// =================================================================
// FUNÇÕES DE MANIPULAÇÃO DE ITENS
// =================================================================

/**
 * Deleta itens antigos e insere os novos para um determinado recibo.
 */
function processAndSaveItems(itemsSheet, receiptId, items) {
  deleteItemsByReceiptId(itemsSheet, receiptId);
  
  if (items.length === 0) return;

  const itemHeaders = itemsSheet.getRange(1, 1, 1, itemsSheet.getLastColumn()).getValues()[0];
  const timestamp = new Date().toISOString();

  const rowsToAdd = items.map(item => {
    return itemHeaders.map(header => {
      switch(header) {
        case 'item_id': return Utilities.getUuid(); // Gera um ID único para cada item
        case 'receipt_id': return receiptId;
        case 'timestamp': return timestamp;
        default: return item[header] !== undefined ? item[header] : '';
      }
    });
  });

  itemsSheet.getRange(itemsSheet.getLastRow() + 1, 1, rowsToAdd.length, rowsToAdd[0].length).setValues(rowsToAdd);
}

/**
 * Deleta todas as linhas na aba 'Itens' que correspondem a um receiptId.
 */
function deleteItemsByReceiptId(sheet, receiptId) {
    if (sheet.getLastRow() < 2) return;
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const receiptIdColumnIndex = headers.indexOf("receipt_id");
    
    if (receiptIdColumnIndex === -1) {
        Logger.log("A coluna 'receipt_id' não foi encontrada na aba '" + sheet.getName() + "'. Impossível deletar itens.");
        return;
    }

    const receiptIdColumnValues = sheet.getRange(2, receiptIdColumnIndex + 1, sheet.getLastRow() - 1, 1).getValues();
    
    for (let i = receiptIdColumnValues.length - 1; i >= 0; i--) {
        if (receiptIdColumnValues[i][0] == receiptId) {
            sheet.deleteRow(i + 2); // +2 para ajustar para o índice 1-based da planilha e o cabeçalho
        }
    }
}


// =================================================================
// FUNÇÃO DE BUSCA
// =================================================================

/**
 * Encontra o número da linha correspondente a um ID.
 * Retorna -1 se não encontrar.
 */
function findRowById(sheet, id, idColumnIndex) {
  if (sheet.getLastRow() < 2) return -1;
  
  const idColumnValues = sheet.getRange(2, idColumnIndex, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < idColumnValues.length; i++) {
    if (idColumnValues[i][0] == id) {
      return i + 2; // Retorna o número real da linha na planilha (1-based + cabeçalho)
    }
  }
  return -1; // Não encontrado
}

// =================================================================
// FUNÇÃO DE TESTE (Para executar manualmente no editor)
// =================================================================

/**
 * Use esta função para testar a busca de dados.
 * 1. No editor do Apps Script, selecione "test_getReceipts" no menu suspenso.
 * 2. Clique em "Executar".
 * 3. Verifique os resultados no "Registro de execução" (Ctrl+Enter).
 */
function test_getReceipts() {
  Logger.log("Iniciando o teste de busca de recibos...");
  
  try {
    const spreadsheet = getSpreadsheet();
    const headers = [
      'id', 'url', 'status', 'storeName', 'storeCnpj', 'storeAddress', 
      'date', 'totalAmount', 'items', 'error', 'payer', 'timestamp'
    ];
    const receiptsSheet = getSheet(spreadsheet, RECEIPTS_SHEET_NAME, headers);
    
    if (receiptsSheet.getLastRow() < 2) {
      Logger.log("A planilha está vazia ou contém apenas o cabeçalho.");
      Logger.log("Resultado: []");
      return;
    }
    
    const sheetHeaders = receiptsSheet.getRange(1, 1, 1, receiptsSheet.getLastColumn()).getValues()[0];
    const data = receiptsSheet.getRange(2, 1, receiptsSheet.getLastRow() - 1, receiptsSheet.getLastColumn()).getValues();

    const receipts = data.map(row => {
      const receipt = {};
      sheetHeaders.forEach((header, index) => {
        let value = row[index];
        if (header === 'totalAmount' && value !== '') {
          value = parseFloat(value) || 0;
        } else if (header === 'items' && typeof value === 'string' && value.startsWith('[')) {
          try { 
            value = JSON.parse(value); 
          } catch (err) { 
            value = [];
          }
        }
        receipt[header] = value;
      });
      return receipt;
    });

    Logger.log("Recibos encontrados:");
    Logger.log(JSON.stringify(receipts, null, 2));
    Logger.log("Teste concluído com sucesso.");

  } catch (error) {
    Logger.log("O teste falhou com um erro:");
    Logger.log(error.toString());
  }
}

// =================================================================
// SUÍTE DE TESTE COMPLETA (Para executar manualmente no editor)
// =================================================================

/**
 * Executa uma suíte de testes completa para validar todas as operações do script.
 * 1. No editor do Apps Script, selecione "runComprehensiveTestSuite".
 * 2. Clique em "Executar".
 * 3. Verifique os resultados no "Registro de execução" (Ctrl+Enter).
 */
function runComprehensiveTestSuite() {
  Logger.log('====================================================');
  Logger.log('INICIANDO A SUÍTE DE TESTES COMPLETA');
  Logger.log('====================================================\n');

  // Dados de teste
  const testId = 'test-' + new Date().getTime();
  const mockReceiptInitial = {
    id: testId,
    url: 'http://example.com/test',
    status: 'completed',
    storeName: 'Loja de Teste',
    storeCnpj: '12.345.678/0001-99',
    storeAddress: 'Rua do Teste, 123',
    date: new Date().toISOString(),
    totalAmount: 150.75,
    payer: 'Pagador Teste',
    items: [
      { name: 'Produto Teste 1', quantity: 1, unit: 'UN', unitPrice: 100.50, totalPrice: 100.50, category: 'Testes' },
      { name: 'Produto Teste 2', quantity: 2, unit: 'UN', unitPrice: 25.125, totalPrice: 50.25, category: 'Testes' }
    ]
  };

  const mockReceiptUpdated = {
    ...mockReceiptInitial,
    totalAmount: 200.00,
    storeName: 'Loja de Teste Atualizada',
    payer: 'Pagador Atualizado'
  };
  
  // Variáveis para as abas
  let receiptsSheet, itemsSheet;

  try {
    // --- SETUP ---
    Logger.log('--- PASSO 0: Configurando o ambiente de teste ---');
    const spreadsheet = getSpreadsheet();
    const receiptHeaders = ['id', 'url', 'status', 'storeName', 'storeCnpj', 'storeAddress', 'date', 'totalAmount', 'items', 'error', 'payer', 'timestamp'];
    const itemHeaders = ['item_id', 'receipt_id', 'name', 'quantity', 'unit', 'unitPrice', 'totalPrice', 'category', 'timestamp'];
    receiptsSheet = getSheet(spreadsheet, RECEIPTS_SHEET_NAME, receiptHeaders);
    itemsSheet = getSheet(spreadsheet, ITEMS_SHEET_NAME, itemHeaders);
    Logger.log('Planilhas e cabeçalhos verificados com sucesso.\n');


    // --- TESTE 1: SALVAR RECIBO ---
    Logger.log('--- TESTE 1: Salvando um novo recibo de teste ---');
    handleSaveOrUpdate(null, receiptsSheet, itemsSheet, mockReceiptInitial);
    Logger.log('Recibo de teste salvo. ID: ' + testId);
    
    // Verificação
    const rowNum = findRowById(receiptsSheet, testId, 1);
    if (rowNum > 0) {
      Logger.log('✅ SUCESSO: Recibo encontrado na linha ' + rowNum + ' da planilha "Recibos".');
    } else {
      throw new Error('❌ FALHA: Não foi possível encontrar o recibo salvo na planilha.');
    }
    const itemsData = itemsSheet.getDataRange().getValues();
    const itemsFound = itemsData.filter(row => row[1] === testId).length;
    if (itemsFound === 2) {
       Logger.log('✅ SUCESSO: ' + itemsFound + ' itens encontrados na planilha "Itens".');
    } else {
       throw new Error('❌ FALHA: O número de itens salvos (' + itemsFound + ') não corresponde ao esperado (2).');
    }
    Logger.log('\n');


    // --- TESTE 2: ATUALIZAR RECIBO ---
    Logger.log('--- TESTE 2: Atualizando o recibo de teste ---');
    handleSaveOrUpdate(null, receiptsSheet, itemsSheet, mockReceiptUpdated);
    const updatedRowData = receiptsSheet.getRange(rowNum, 1, 1, receiptHeaders.length).getValues()[0];
    const sheetHeaders = receiptsSheet.getRange(1, 1, 1, receiptsSheet.getLastColumn()).getValues()[0];
    const updatedStoreName = updatedRowData[sheetHeaders.indexOf('storeName')];
    const updatedTotalAmount = updatedRowData[sheetHeaders.indexOf('totalAmount')];
    const updatedPayer = updatedRowData[sheetHeaders.indexOf('payer')];

    if (updatedStoreName === 'Loja de Teste Atualizada' && updatedTotalAmount == 200.00 && updatedPayer === 'Pagador Atualizado') {
      Logger.log('✅ SUCESSO: Os dados do recibo foram atualizados corretamente na planilha.');
    } else {
      throw new Error('❌ FALHA: A atualização do recibo falhou. Nome da loja: ' + updatedStoreName + ', Total: ' + updatedTotalAmount + ', Pagador: ' + updatedPayer);
    }
    Logger.log('\n');


    // --- TESTE 3: BUSCAR TODOS OS RECIBOS (GET) ---
    Logger.log('--- TESTE 3: Buscando todos os recibos ---');
    Logger.log('O resultado da busca aparecerá no log da função test_getReceipts.');
    test_getReceipts(); // A função de teste original já loga o resultado
    Logger.log('Verifique o log acima para confirmar que os dados foram buscados corretamente.\n');


    // --- TESTE 4: MIGRAÇÃO ---
    Logger.log('--- TESTE 4: Testando a migração ---');
    // Para testar, primeiro removemos os itens normalizados para simular um recibo antigo
    deleteItemsByReceiptId(itemsSheet, testId);
    Logger.log('Itens normalizados do recibo de teste foram removidos para simular um estado "antigo".');
    const migrationResult = handleMigration(null, receiptsSheet, itemsSheet);
    const migrationData = JSON.parse(migrationResult.getContent()); 

    if (migrationData.success && migrationData.migratedCount > 0) {
        Logger.log('Resultado da migração: ' + JSON.stringify(migrationData));
    } else {
        // Se a contagem for 0, significa que não havia nada para migrar, o que é um sucesso se os itens já estiverem lá.
        if (migrationData.migratedCount === 0) {
           Logger.log('Nenhum item novo precisou ser migrado.');
        } else {
           throw new Error('❌ FALHA: A API de migração retornou um erro ou não migrou os itens.');
        }
    }

    const itemsFoundAfterMigration = itemsSheet.getDataRange().getValues().filter(row => row[1] === testId).length;
     if (itemsFoundAfterMigration === 2) {
       Logger.log('✅ SUCESSO: A migração recriou os itens normalizados corretamente.');
    } else {
       throw new Error('❌ FALHA: A migração falhou em recriar os itens. Itens encontrados: ' + itemsFoundAfterMigration);
    }
    Logger.log('\n');


    // --- TESTE 5: DELETAR RECIBO ---
    Logger.log('--- TESTE 5: Deletando o recibo de teste ---');
    handleDelete(null, receiptsSheet, itemsSheet, testId);
    
    // Verificação
    const rowNumAfterDelete = findRowById(receiptsSheet, testId, 1);
     if (rowNumAfterDelete === -1) {
      Logger.log('✅ SUCESSO: Recibo removido da planilha "Recibos".');
    } else {
      throw new Error('❌ FALHA: O recibo ainda existe na planilha após a exclusão.');
    }
    const itemsFoundAfterDelete = itemsSheet.getDataRange().getValues().filter(row => row[1] === testId).length;
    if (itemsFoundAfterDelete === 0) {
       Logger.log('✅ SUCESSO: Itens removidos da planilha "Itens".');
    } else {
       throw new Error('❌ FALHA: Os itens do recibo ainda existem na planilha após a exclusão.');
    }

  } catch (error) {
    Logger.log('\n====================================================');
    Logger.log('A SUÍTE DE TESTES FALHOU!');
    Logger.log('ERRO: ' + error.message);
    Logger.log('====================================================');
    return; // Interrompe a execução
  } finally {
    // --- LIMPEZA FINAL ---
    // Garante que o item de teste seja deletado mesmo se um passo intermediário falhar
    Logger.log('\n--- LIMPEZA FINAL ---');
    if(receiptsSheet && itemsSheet){
      handleDelete(null, receiptsSheet, itemsSheet, testId);
      Logger.log('Limpeza do recibo de teste ('+testId+') concluída.');
    }
  }

  Logger.log('\n====================================================');
  Logger.log('✅ SUÍTE DE TESTES COMPLETA CONCLUÍDA COM SUCESSO!');
  Logger.log('====================================================');
}

// FIM DO SCRIPT