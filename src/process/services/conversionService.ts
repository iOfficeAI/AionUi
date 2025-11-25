/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConversionResult, ExcelWorkbookData, PPTJsonData } from '@/common/types/conversion';
import { DOMParser } from '@xmldom/xmldom';
import { Document as DocxDocument, Packer, Paragraph, TextRun } from 'docx';
import { BrowserWindow } from 'electron';
import fs from 'fs/promises';
import mammoth from 'mammoth';
import PPTX2Json from 'pptx2json';
import TurndownService from 'turndown';
import * as XLSX from 'xlsx-republish';
import * as yauzl from 'yauzl';

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

      const doc = new DocxDocument({
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
      const sheetImages = await this.extractExcelImages(buffer);

      const sheets = workbook.SheetNames.map((name) => {
        const sheet = workbook.Sheets[name];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        return {
          name,
          data,
          merges: sheet['!merges'] as any,
          images: sheetImages[name],
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
   * 提取 Excel 中的图片资源，并且定位到对应单元格
   */
  private async extractExcelImages(buffer: Buffer): Promise<Record<string, { row: number; col: number; src: string; width?: number; height?: number }[]>> {
    try {
      const fileMap = await this.loadExcelZipEntries(buffer);
      const workbookXml = fileMap.get('xl/workbook.xml');
      if (!workbookXml) {
        return {};
      }

      const workbookRels = this.parseRelationships(fileMap.get('xl/_rels/workbook.xml.rels'));
      const workbookDoc = new DOMParser().parseFromString(workbookXml.toString('utf8'), 'text/xml');
      const sheetNodes = workbookDoc.getElementsByTagName('sheet');
      const sheetInfos: Array<{ name: string; path: string }> = [];

      for (let i = 0; i < sheetNodes.length; i++) {
        const sheetNode = sheetNodes.item(i);
        if (!sheetNode) continue;
        const name = sheetNode.getAttribute('name') || `Sheet${i + 1}`;
        const relId = sheetNode.getAttribute('r:id') || sheetNode.getAttribute('Id') || sheetNode.getAttribute('id');
        if (!relId) continue;
        const rel = workbookRels.get(relId);
        if (!rel) continue;
        const sheetPath = this.resolveZipPath('xl/workbook.xml', rel.target);
        if (!sheetPath) continue;
        sheetInfos.push({ name, path: sheetPath });
      }

      if (sheetInfos.length === 0) {
        return {};
      }

      const parser = new DOMParser();
      const result: Record<string, { row: number; col: number; src: string; width?: number; height?: number }[]> = {};

      for (const sheetInfo of sheetInfos) {
        const sheetRelPath = this.getRelsPath(sheetInfo.path);
        const sheetRelXml = sheetRelPath ? fileMap.get(sheetRelPath) : null;
        if (!sheetRelXml) continue;
        const sheetRelMap = this.parseRelationships(sheetRelXml);
        const drawingRels = Array.from(sheetRelMap.values()).filter((rel) => rel.type === ConversionService.DRAWING_REL_TYPE);
        if (drawingRels.length === 0) continue;

        for (const drawingRel of drawingRels) {
          const drawingPath = this.resolveZipPath(sheetInfo.path, drawingRel.target);
          if (!drawingPath) continue;
          const drawingXml = fileMap.get(drawingPath);
          if (!drawingXml) continue;
          const drawingDoc = parser.parseFromString(drawingXml.toString('utf8'), 'text/xml');
          const anchors = this.parseDrawingAnchors(drawingDoc);
          if (!anchors.length) continue;
          const drawingRelMap = this.parseRelationships(fileMap.get(this.getRelsPath(drawingPath)));

          anchors.forEach((anchor) => {
            const relInfo = drawingRelMap.get(anchor.embedId);
            if (!relInfo) return;
            const imagePath = this.resolveZipPath(drawingPath, relInfo.target);
            if (!imagePath) return;
            const imageBuffer = fileMap.get(imagePath);
            if (!imageBuffer) return;
            const mime = this.getMimeTypeFromName(imagePath);
            const src = `data:${mime};base64,${imageBuffer.toString('base64')}`;
            (result[sheetInfo.name] ||= []).push({ row: anchor.row, col: anchor.col, src, width: anchor.width, height: anchor.height });
          });
        }
      }

      return result;
    } catch (error) {
      console.warn('[ConversionService] extractExcelImages failed:', error);
      return {};
    }
  }

  /**
   * 解析 Drawing XML 中的图片锚点信息
   */
  private parseDrawingAnchors(doc: Document): Array<{ row: number; col: number; embedId: string; width?: number; height?: number }> {
    const anchors: Element[] = [];
    const anchorTags = ['xdr:twoCellAnchor', 'xdr:oneCellAnchor', 'xdr:absoluteAnchor', 'twoCellAnchor', 'oneCellAnchor', 'absoluteAnchor'];
    anchorTags.forEach((tag) => {
      const nodes = doc.getElementsByTagName(tag);
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes.item(i);
        if (node) anchors.push(node);
      }
    });

    const blipTags = ['a:blip', 'pic:blip', 'blip'];
    const fromTags = ['xdr:from', 'from'];
    const rowTags = ['xdr:row', 'row'];
    const colTags = ['xdr:col', 'col'];
    const sizeTags = ['xdr:ext', 'a:ext', 'ext'];

    const entries: Array<{ row: number; col: number; embedId: string; width?: number; height?: number }> = [];

    anchors.forEach((anchor) => {
      const blip = this.findFirstChild(anchor, blipTags);
      const embedId = blip?.getAttribute('r:embed') || blip?.getAttribute('embed');
      if (!embedId) return;

      const fromNode = this.findFirstChild(anchor, fromTags);
      const row = this.safeParseInt(this.findFirstChild(fromNode, rowTags)?.textContent, 0);
      const col = this.safeParseInt(this.findFirstChild(fromNode, colTags)?.textContent, 0);

      const sizeNode = this.findFirstChild(anchor, sizeTags);
      const width = this.safeSize(sizeNode?.getAttribute('cx'));
      const height = this.safeSize(sizeNode?.getAttribute('cy'));

      entries.push({ row, col, embedId, width, height });
    });

    return entries;
  }

  private safeParseInt(value: string | null | undefined, fallback: number): number {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private safeSize(value: string | null | undefined): number | undefined {
    const parsed = Number.parseInt(value ?? '', 10);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }
    const pixels = Math.round(parsed / 9525);
    return pixels > 0 ? pixels : undefined;
  }

  private findFirstChild(root: Element | null, tagNames: string[]): Element | null {
    if (!root) return null;
    for (const tag of tagNames) {
      const nodes = root.getElementsByTagName(tag);
      if (nodes.length > 0) {
        return nodes.item(0);
      }
    }
    return null;
  }

  private loadExcelZipEntries(buffer: Buffer): Promise<Map<string, Buffer>> {
    return new Promise((resolve, reject) => {
      yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
        if (err || !zip) {
          reject(err);
          return;
        }

        const fileMap = new Map<string, Buffer>();

        const handleError = (error: Error) => {
          zip.close();
          reject(error);
        };

        zip.on('error', handleError);
        zip.on('end', () => {
          zip.close();
          resolve(fileMap);
        });

        zip.on('entry', (entry) => {
          const normalizedPath = this.normalizeZipPath(entry.fileName);
          if (!this.shouldKeepZipEntry(normalizedPath) || entry.fileName.endsWith('/')) {
            zip.readEntry();
            return;
          }

          zip.openReadStream(entry, (streamErr, stream) => {
            if (streamErr || !stream) {
              handleError(streamErr || new Error('Unable to open zip stream'));
              return;
            }

            const chunks: Buffer[] = [];
            stream.on('data', (chunk) => chunks.push(chunk as Buffer));
            stream.on('error', handleError);
            stream.on('end', () => {
              fileMap.set(normalizedPath, Buffer.concat(chunks));
              zip.readEntry();
            });
          });
        });

        zip.readEntry();
      });
    });
  }

  private shouldKeepZipEntry(path: string): boolean {
    if (!path.startsWith('xl/')) return false;
    return path === 'xl/workbook.xml' || path === 'xl/_rels/workbook.xml.rels' || path.startsWith('xl/worksheets/') || path.startsWith('xl/worksheets/_rels/') || path.startsWith('xl/drawings/') || path.startsWith('xl/drawings/_rels/') || path.startsWith('xl/media/');
  }

  private normalizeZipPath(filePath: string): string {
    const cleaned = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const parts = cleaned.split('/');
    const stack: string[] = [];
    parts.forEach((part) => {
      if (!part || part === '.') return;
      if (part === '..') stack.pop();
      else stack.push(part);
    });
    return stack.join('/');
  }

  private resolveZipPath(basePath: string, target: string): string {
    if (!target) return '';
    if (target.startsWith('/')) {
      return this.normalizeZipPath(target);
    }
    const baseParts = this.normalizeZipPath(basePath).split('/');
    baseParts.pop();
    return this.normalizeZipPath([...baseParts, target].join('/'));
  }

  private getRelsPath(partPath: string): string {
    const normalized = this.normalizeZipPath(partPath);
    const idx = normalized.lastIndexOf('/');
    const dir = idx >= 0 ? normalized.substring(0, idx) : '';
    const file = idx >= 0 ? normalized.substring(idx + 1) : normalized;
    return this.normalizeZipPath(`${dir}/_rels/${file}.rels`);
  }

  private parseRelationships(xml?: Buffer | string | null): Map<string, { target: string; type: string }> {
    const map = new Map<string, { target: string; type: string }>();
    if (!xml) return map;

    const parser = new DOMParser();
    const doc = parser.parseFromString(typeof xml === 'string' ? xml : xml.toString('utf8'), 'text/xml');
    const nodes: Element[] = [];
    const byTag = doc.getElementsByTagName('Relationship');
    for (let i = 0; i < byTag.length; i++) {
      const node = byTag.item(i);
      if (node) nodes.push(node);
    }
    if (nodes.length === 0 && doc.getElementsByTagNameNS) {
      const byNS = doc.getElementsByTagNameNS('*', 'Relationship');
      for (let i = 0; i < byNS.length; i++) {
        const node = byNS.item(i);
        if (node) nodes.push(node);
      }
    }

    nodes.forEach((node) => {
      const id = node.getAttribute('Id') || node.getAttribute('ID');
      const target = node.getAttribute('Target');
      const type = node.getAttribute('Type') || '';
      if (!id || !target) return;
      map.set(id, { target, type });
    });

    return map;
  }

  private getMimeTypeFromName(fileName: string): string {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.bmp')) return 'image/bmp';
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    return 'application/octet-stream';
  }

  private static readonly DRAWING_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing';

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
