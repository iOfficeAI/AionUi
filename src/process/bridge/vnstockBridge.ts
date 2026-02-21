/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { vnstockService } from '../services/vnstockService';
import type { VnstockQuoteParams, VnstockFinancialParams, VnstockListingParams, VnstockPriceBoardParams } from '../services/vnstockService';

export function initVnstockBridge(): void {
  // Check vnstock installation
  ipcBridge.vnstock.checkInstallation.provider(async () => {
    return vnstockService.checkInstallation();
  });

  // Get stock quote
  ipcBridge.vnstock.getQuote.provider(async (params: VnstockQuoteParams) => {
    return vnstockService.getQuote(params);
  });

  // Get financial statements
  ipcBridge.vnstock.getFinancials.provider(async (params: VnstockFinancialParams) => {
    return vnstockService.getFinancials(params);
  });

  // List symbols
  ipcBridge.vnstock.listSymbols.provider(async (params: VnstockListingParams) => {
    return vnstockService.listSymbols(params);
  });

  // Get price board
  ipcBridge.vnstock.getPriceBoard.provider(async (params: VnstockPriceBoardParams) => {
    return vnstockService.getPriceBoard(params);
  });

  // Screen stocks
  ipcBridge.vnstock.screenStocks.provider(async (params: Record<string, any>) => {
    return vnstockService.screenStocks(params);
  });

  // Get fund data
  ipcBridge.vnstock.getFundData.provider(async (params: Record<string, any>) => {
    return vnstockService.getFundData(params);
  });
}
