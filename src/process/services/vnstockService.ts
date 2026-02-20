/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { app } from 'electron';

const execAsync = promisify(exec);

export type VnstockInterval = '1D' | '1W' | '1M' | '1m' | '5m' | '15m' | '30m' | '1H';
export type VnstockSource = 'KBS' | 'VCI';
export type VnstockPeriod = 'annual' | 'quarterly';
export type VnstockLanguage = 'en' | 'vi';
export type VnstockStatementType = 'balance_sheet' | 'income_statement' | 'cash_flow' | 'ratio';
export type VnstockListingCategory = 'all' | 'exchange' | 'industry' | 'group' | 'industry_list' | 'bonds' | 'futures';

export interface VnstockQuoteParams {
  symbol: string;
  start?: string;
  end?: string;
  interval?: VnstockInterval;
  source?: VnstockSource;
}

export interface VnstockFinancialParams {
  symbol: string;
  statement_type?: VnstockStatementType;
  period?: VnstockPeriod;
  lang?: VnstockLanguage;
}

export interface VnstockListingParams {
  category?: VnstockListingCategory;
  exchange?: 'HOSE' | 'HNX' | 'UPCOM';
  industry?: string;
  group?: 'VN30' | 'VNMidCap' | 'VNSmallCap' | 'VNAllShare' | 'VN100' | 'ETF';
}

export interface VnstockPriceBoardParams {
  symbols_list: string;
  source?: VnstockSource;
}

export interface VnstockResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  [key: string]: any;
}

/**
 * Service for interacting with vnstock Python library
 * Provides Vietnamese stock market data through Python CLI wrapper
 */
class VnstockService {
  private pythonPath: string;
  private cliPath: string;

  constructor() {
    this.pythonPath = 'python3';
    this.cliPath = path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'assistant', 'vnstock', 'workspace', '.claude', 'skills', 'vnstock-data', 'scripts', 'vnstock_cli.py');
  }

  /**
   * Check if vnstock is installed
   */
  async checkInstallation(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('python3 -c "import vnstock; print(vnstock.__version__)"');
      console.log(`[VnstockService] vnstock version: ${stdout.trim()}`);
      return true;
    } catch (error) {
      console.error('[VnstockService] vnstock not installed:', error);
      return false;
    }
  }

  /**
   * Execute vnstock CLI command
   */
  private async executeCommand(command: string, params: Record<string, any>): Promise<VnstockResponse> {
    return new Promise((resolve, reject) => {
      const paramsJson = JSON.stringify(params);
      const args = [this.cliPath, command, '--params', paramsJson];

      console.log(`[VnstockService] Executing: ${command} with params:`, params);

      const process = spawn(this.pythonPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code !== 0) {
          console.error(`[VnstockService] Command failed with code ${code}:`, stderr);
          resolve({
            success: false,
            error: stderr || `Process exited with code ${code}`,
          });
          return;
        }

        try {
          const result = JSON.parse(stdout);
          console.log(`[VnstockService] Command successful:`, command);
          resolve(result);
        } catch (error) {
          console.error(`[VnstockService] Failed to parse response:`, error);
          resolve({
            success: false,
            error: `Failed to parse response: ${(error as Error).message}`,
          });
        }
      });

      process.on('error', (error) => {
        console.error(`[VnstockService] Process error:`, error);
        reject(error);
      });
    });
  }

  /**
   * Get historical or intraday price data
   */
  async getQuote(params: VnstockQuoteParams): Promise<VnstockResponse> {
    return this.executeCommand('quote', params);
  }

  /**
   * Get financial statements
   */
  async getFinancials(params: VnstockFinancialParams): Promise<VnstockResponse> {
    return this.executeCommand('finance', params);
  }

  /**
   * List market symbols
   */
  async listSymbols(params: VnstockListingParams): Promise<VnstockResponse> {
    return this.executeCommand('listing', params);
  }

  /**
   * Get price board with bid/ask data
   */
  async getPriceBoard(params: VnstockPriceBoardParams): Promise<VnstockResponse> {
    return this.executeCommand('trading', params);
  }

  /**
   * Screen stocks (placeholder)
   */
  async screenStocks(params: Record<string, any>): Promise<VnstockResponse> {
    return this.executeCommand('screener', { filters: JSON.stringify(params) });
  }

  /**
   * Get fund data (placeholder)
   */
  async getFundData(params: Record<string, any>): Promise<VnstockResponse> {
    return this.executeCommand('fund', params);
  }
}

// Export singleton instance
export const vnstockService = new VnstockService();
