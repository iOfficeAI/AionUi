/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '../../common';
import { vnstockService } from '../services/vnstockService';
import type { VnstockQuoteParams, VnstockFinancialParams, VnstockListingParams, VnstockPriceBoardParams } from '../services/vnstockService';

export function initVnstockBridge(): void {
  // Check vnstock installation
  ipcBridge.handle('vnstock:checkInstallation', async () => {
    return vnstockService.checkInstallation();
  });

  // Get stock quote
  ipcBridge.handle('vnstock:getQuote', async (_event, params: VnstockQuoteParams) => {
    return vnstockService.getQuote(params);
  });

  // Get financial statements
  ipcBridge.handle('vnstock:getFinancials', async (_event, params: VnstockFinancialParams) => {
    return vnstockService.getFinancials(params);
  });

  // List symbols
  ipcBridge.handle('vnstock:listSymbols', async (_event, params: VnstockListingParams) => {
    return vnstockService.listSymbols(params);
  });

  // Get price board
  ipcBridge.handle('vnstock:getPriceBoard', async (_event, params: VnstockPriceBoardParams) => {
    return vnstockService.getPriceBoard(params);
  });

  // Screen stocks
  ipcBridge.handle('vnstock:screenStocks', async (_event, params: Record<string, any>) => {
    return vnstockService.screenStocks(params);
  });

  // Get fund data
  ipcBridge.handle('vnstock:getFundData', async (_event, params: Record<string, any>) => {
    return vnstockService.getFundData(params);
  });
}
