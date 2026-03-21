/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConversionResult, ExcelWorkbookData, PPTJsonData } from '@/common/types/conversion';
import { excelToJson as nativeExcelToJson } from '@aionui/native';
import mammoth from 'mammoth';
import PPTX2Json from 'pptx2json';
import TurndownService from 'turndown';

class ConversionService {
  private turndownService: TurndownService;

  constructor() {
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });
  }

  /**
   * Word (.docx) -> Markdown
   */
  public async wordToMarkdown(filePath: string): Promise<ConversionResult<string>> {
    try {
      const fs = await import('fs/promises');
      const buffer = await fs.readFile(filePath);
      const result = await mammoth.convertToHtml({ buffer });
      const html = result.value;
      const markdown = this.turndownService.turndown(html);
      return { success: true, data: markdown };
    } catch (error) {
      console.error('[ConversionService] wordToMarkdown failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Excel (.xlsx/.xls) -> JSON
   * Uses Rust aionui-doc (calamine) for reading and image extraction.
   */
  public async excelToJson(filePath: string): Promise<ConversionResult<ExcelWorkbookData>> {
    try {
      const result = nativeExcelToJson(filePath);
      return {
        success: true,
        data: {
          sheets: result.sheets.map((sheet) => ({
            name: sheet.name,
            data: sheet.data as any[][],
            merges: sheet.merges,
            images: sheet.images,
          })),
        },
      };
    } catch (error) {
      console.error('[ConversionService] excelToJson failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * PowerPoint (.pptx) -> JSON
   */
  public async pptToJson(filePath: string): Promise<ConversionResult<PPTJsonData>> {
    try {
      const pptx2json = new PPTX2Json();
      const json = await pptx2json.toJson(filePath);

      const slides = [];

      const possiblePaths = ['ppt/slides', 'ppt\\slides', 'slides'];

      let slidesData: any = null;
      for (const path of possiblePaths) {
        if (json[path]) {
          slidesData = json[path];
          break;
        }
      }

      if (!slidesData) {
        const allKeys = Object.keys(json);
        const slideKeys = allKeys.filter((key) => key.toLowerCase().includes('slide') && key.endsWith('.xml'));

        if (slideKeys.length > 0) {
          for (let i = 0; i < slideKeys.length; i++) {
            slides.push({
              slideNumber: i + 1,
              content: json[slideKeys[i]],
            });
          }
        }
      } else if (typeof slidesData === 'object') {
        const slideFiles = Object.keys(slidesData).filter((key) => key.startsWith('slide') && key.endsWith('.xml'));

        for (let i = 0; i < slideFiles.length; i++) {
          slides.push({
            slideNumber: i + 1,
            content: slidesData[slideFiles[i]],
          });
        }
      }

      return {
        success: true,
        data: {
          slides,
          raw: json,
        },
      };
    } catch (error) {
      console.error('[ConversionService] pptToJson failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

export const conversionService = new ConversionService();
