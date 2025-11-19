/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConversionResult, ExcelWorkbookData, PPTJsonData } from '@/common/types/conversion';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { BrowserWindow } from 'electron';
import fs from 'fs/promises';
import mammoth from 'mammoth';
import PPTX2Json from 'pptx2json';
import TurndownService from 'turndown';
import * as XLSX from 'xlsx';

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
   * 将 Word 文档转换为 Markdown
   */
  public async wordToMarkdown(filePath: string): Promise<ConversionResult<string>> {
    try {
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
   * Markdown -> Word (.docx)
   * 将 Markdown 转换为 Word 文档
   * Note: This is a basic implementation. For complex markdown, we might need a better parser.
   * 注意：这是一个基础实现。对于复杂的 Markdown，可能需要更好的解析器。
   */
  public async markdownToWord(markdown: string, targetPath: string): Promise<ConversionResult<void>> {
    try {
      // Simple implementation: split by newlines and create paragraphs
      // 简单实现：按行分割并创建段落
      // TODO: Use a proper Markdown parser to generate Docx structure
      // TODO: 使用合适的 Markdown 解析器生成 Docx 结构
      const lines = markdown.split('\n');
      const children = lines.map(
        (line) =>
          new Paragraph({
            children: [new TextRun(line)],
          })
      );

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: children,
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);
      await fs.writeFile(targetPath, buffer);
      return { success: true };
    } catch (error) {
      console.error('[ConversionService] markdownToWord failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Excel (.xlsx) -> JSON
   * 将 Excel 文件转换为 JSON 数据
   */
  public async excelToJson(filePath: string): Promise<ConversionResult<ExcelWorkbookData>> {
    try {
      const buffer = await fs.readFile(filePath);
      const workbook = XLSX.read(buffer, { type: 'buffer' });

      const sheets = workbook.SheetNames.map((name) => {
        const sheet = workbook.Sheets[name];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        return {
          name,
          data,
          merges: sheet['!merges'] as any,
        };
      });

      return { success: true, data: { sheets } };
    } catch (error) {
      console.error('[ConversionService] excelToJson failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * JSON -> Excel (.xlsx)
   * 将 JSON 数据转换为 Excel 文件
   */
  public async jsonToExcel(data: ExcelWorkbookData, targetPath: string): Promise<ConversionResult<void>> {
    try {
      const workbook = XLSX.utils.book_new();

      data.sheets.forEach((sheetData) => {
        const worksheet = XLSX.utils.aoa_to_sheet(sheetData.data);
        if (sheetData.merges) {
          worksheet['!merges'] = sheetData.merges;
        }
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetData.name);
      });

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      await fs.writeFile(targetPath, buffer);
      return { success: true };
    } catch (error) {
      console.error('[ConversionService] jsonToExcel failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * PowerPoint (.pptx) -> JSON
   * 将 PowerPoint 文件转换为 JSON 结构
   * Converts PowerPoint file to JSON structure including slides, images, and layouts
   */
  public async pptToJson(filePath: string): Promise<ConversionResult<PPTJsonData>> {
    try {
      const pptx2json = new PPTX2Json();
      const json = await pptx2json.toJson(filePath);

      console.log('[ConversionService] pptx2json raw result keys:', Object.keys(json));

      // 提取幻灯片信息 / Extract slide information
      const slides = [];

      // 尝试多种可能的路径结构
      const possiblePaths = ['ppt/slides', 'ppt\\slides', 'slides'];

      let slidesData: any = null;
      for (const path of possiblePaths) {
        if (json[path]) {
          slidesData = json[path];
          console.log(`[ConversionService] Found slides at path: ${path}`);
          break;
        }
      }

      // 如果上面的路径都找不到，尝试查找所有包含 'slide' 的键
      if (!slidesData) {
        const allKeys = Object.keys(json);
        console.log('[ConversionService] All keys in json:', allKeys);

        // 查找所有以 slide 开头的键
        const slideKeys = allKeys.filter((key) => key.toLowerCase().includes('slide') && key.endsWith('.xml'));

        console.log('[ConversionService] Found slide keys:', slideKeys);

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
        console.log('[ConversionService] Found slide files:', slideFiles);

        for (let i = 0; i < slideFiles.length; i++) {
          slides.push({
            slideNumber: i + 1,
            content: slidesData[slideFiles[i]],
          });
        }
      }

      console.log('[ConversionService] Total slides extracted:', slides.length);

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

  /**
   * HTML -> PDF
   * 将 HTML 转换为 PDF
   * Uses a hidden BrowserWindow to render and print
   * 使用隐藏的 BrowserWindow 进行渲染和打印
   */
  public async htmlToPdf(html: string, targetPath: string): Promise<ConversionResult<void>> {
    let win: BrowserWindow | null = null;
    try {
      win = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: system-ui, sans-serif; padding: 20px; }
            img { max-width: 100%; }
          </style>
        </head>
        <body>
          ${html}
        </body>
        </html>
      `;

      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

      const data = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
      });

      await fs.writeFile(targetPath, data);
      return { success: true };
    } catch (error) {
      console.error('[ConversionService] htmlToPdf failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    } finally {
      if (win) {
        win.close();
      }
    }
  }

  /**
   * Markdown -> PDF
   * 将 Markdown 转换为 PDF
   */
  public async markdownToPdf(markdown: string, targetPath: string): Promise<ConversionResult<void>> {
    try {
      // Simple conversion using marked or similar would be better,
      // but for now we can use a basic wrapper or rely on the renderer to send HTML.
      // Since we are in main process, we don't have 'marked' installed by default unless we add it.
      // But we have 'mammoth' which is for Word.
      // Let's assume we receive HTML for PDF generation usually, but if we must support MD->PDF here:

      // For now, let's wrap markdown in a pre tag if we don't have a parser,
      // OR better, let's rely on the renderer to convert MD to HTML and call htmlToPdf.
      // But the interface says markdownToPdf.
      // Let's use a simple replacement for headers/bold to make it look decent,
      // or just treat it as plain text if no parser is available.
      // Actually, 'turndown' is HTML->MD. We need MD->HTML.
      // We can use 'showdown' or 'marked' if installed.
      // Checking package.json... 'react-markdown' is in dependencies but that's for React.
      // 'diff2html' is there.

      // Let's fallback to simple text wrapping for now, or ask user to install 'marked'.
      // Given the constraints, I'll implement a very basic text-to-html wrapper.
      // 简单转换：目前使用 pre 标签包裹，建议后续集成 marked 等库

      const html = `<pre style="white-space: pre-wrap; font-family: monospace;">${markdown}</pre>`;
      return await this.htmlToPdf(html, targetPath);
    } catch (error) {
      console.error('[ConversionService] markdownToPdf failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

export const conversionService = new ConversionService();
