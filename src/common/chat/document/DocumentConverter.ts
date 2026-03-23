/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 文档转换器 - Markdown 中心化
 *
 * 核心理念：所有可编辑文档都转换为 Markdown 进行统一编辑
 * Word/Excel → Markdown → 编辑 → Word/Excel/PDF
 */
export class DocumentConverter {
  /**
   * Word → Markdown
   * 使用 mammoth + turndown
   */
  async wordToMarkdown(arrayBuffer: ArrayBuffer): Promise<string> {
    // 动态导入以减少初始加载
    const mammoth = await import('mammoth');
    const TurndownService = (await import('turndown')).default;
    const { gfm } = await import('turndown-plugin-gfm');

    // 1. Word → HTML
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const html = result.value;

    // 2. HTML → Markdown
    const turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });
    turndown.use(gfm); // 支持 GitHub Flavored Markdown (表格等)

    const markdown = turndown.turndown(html);

    return markdown;
  }

  /**
   * Markdown → Word
   * 使用 docx 库将 Markdown 转换为 Word 文档
   */
  async markdownToWord(markdown: string): Promise<ArrayBuffer> {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');

    // 简单实现：将 Markdown 段落转为 Word 段落
    // 更复杂的实现可以解析 Markdown AST
    const lines = markdown.split('\n');
    const paragraphs = [];

    for (const line of lines) {
      if (line.startsWith('# ')) {
        paragraphs.push(
          new Paragraph({
            text: line.substring(2),
            heading: HeadingLevel.HEADING_1,
          })
        );
      } else if (line.startsWith('## ')) {
        paragraphs.push(
          new Paragraph({
            text: line.substring(3),
            heading: HeadingLevel.HEADING_2,
          })
        );
      } else if (line.startsWith('### ')) {
        paragraphs.push(
          new Paragraph({
            text: line.substring(4),
            heading: HeadingLevel.HEADING_3,
          })
        );
      } else if (line.trim()) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun(line)],
          })
        );
      } else {
        // 空行
        paragraphs.push(new Paragraph({ text: '' }));
      }
    }

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: paragraphs,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    // 将 Buffer 转换为 ArrayBuffer
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  }

  /**
   * Excel → Markdown (表格)
   * 使用 SheetJS
   */
  async excelToMarkdown(arrayBuffer: ArrayBuffer): Promise<string> {
    const XLSX = await import('xlsx-republish');

    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    let markdown = '';

    workbook.SheetNames.forEach((sheetName) => {
      // 多个 Sheet 时添加标题
      if (workbook.SheetNames.length > 1) {
        markdown += `## ${sheetName}\n\n`;
      }

      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      if (data.length === 0) return;

      // 表头
      const headers = data[0].map((cell: any) => String(cell || ''));
      markdown += `| ${headers.join(' | ')} |\n`;
      markdown += `| ${headers.map(() => '---').join(' | ')} |\n`;

      // 数据行
      for (let i = 1; i < data.length; i++) {
        const row = data[i].map((cell: any) => String(cell || ''));
        // 补齐列数
        while (row.length < headers.length) {
          row.push('');
        }
        markdown += `| ${row.join(' | ')} |\n`;
      }

      markdown += '\n';
    });

    return markdown;
  }

  /**
   * Markdown → Excel
   * 解析 Markdown 表格并转换为 Excel
   */
  async markdownToExcel(markdown: string): Promise<ArrayBuffer> {
    const XLSX = await import('xlsx-republish');

    const workbook = XLSX.utils.book_new();
    const sheets = this.parseMarkdownTables(markdown);

    sheets.forEach((sheet, index) => {
      const sheetName = sheet.name || `Sheet${index + 1}`;
      const worksheet = XLSX.utils.aoa_to_sheet(sheet.data);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    });

    const uint8Array = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    // 将 Uint8Array 转换为 ArrayBuffer
    return uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength);
  }

  /**
   * 解析 Markdown 表格
   */
  private parseMarkdownTables(markdown: string): Array<{ name: string; data: any[][] }> {
    const sheets: Array<{ name: string; data: any[][] }> = [];
    const lines = markdown.split('\n');

    let currentSheet: { name: string; data: any[][] } | null = null;
    let currentTable: any[][] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 检测 Sheet 标题 (## Sheet名)
      if (line.startsWith('## ')) {
        // 保存上一个 Sheet
        if (currentSheet && currentTable.length > 0) {
          currentSheet.data = currentTable;
          sheets.push(currentSheet);
        }

        // 创建新 Sheet
        currentSheet = {
          name: line.substring(3).trim(),
          data: [],
        };
        currentTable = [];
        continue;
      }

      // 检测表格行
      if (line.startsWith('|')) {
        const cells = line
          .split('|')
          .filter((cell, idx, arr) => idx > 0 && idx < arr.length - 1)
          .map((cell) => cell.trim());

        // 跳过分隔行 (|---|---|)
        if (cells.every((cell) => /^-+$/.test(cell))) {
          continue;
        }

        currentTable.push(cells);
      } else if (currentTable.length > 0) {
        // 表格结束
        if (currentSheet) {
          currentSheet.data = currentTable;
          sheets.push(currentSheet);
          currentSheet = null;
        } else {
          sheets.push({ name: `Sheet${sheets.length + 1}`, data: currentTable });
        }
        currentTable = [];
      }
    }

    // 保存最后一个表格
    if (currentTable.length > 0) {
      if (currentSheet) {
        currentSheet.data = currentTable;
        sheets.push(currentSheet);
      } else {
        sheets.push({ name: `Sheet${sheets.length + 1}`, data: currentTable });
      }
    }

    return sheets;
  }
}

export const documentConverter = new DocumentConverter();
