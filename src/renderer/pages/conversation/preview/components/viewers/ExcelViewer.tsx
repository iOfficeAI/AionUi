/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ExcelWorkbookData } from '@/common/types/conversion';
import { usePreviewToolbarExtras } from '../../context/PreviewToolbarExtrasContext';
import { Button, Message } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ExcelPreviewProps {
  filePath?: string;
  content?: string; // 预留，暂不使用
  hideToolbar?: boolean;
}

/**
 * Excel 表格预览组件（只读模式）
 *
 * 功能：
 * 1. 通过 IPC 从主进程读取 Excel 文件
 * 2. 主进程使用 xlsx 库转换为 JSON 格式
 * 3. 渲染进程用 HTML 表格展示数据
 */
const ExcelPreview: React.FC<ExcelPreviewProps> = ({ filePath, hideToolbar = false }) => {
  const { t } = useTranslation();
  const [excelData, setExcelData] = useState<ExcelWorkbookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [messageApi, messageContextHolder] = Message.useMessage();
  const toolbarExtrasContext = usePreviewToolbarExtras();
  const usePortalToolbar = Boolean(toolbarExtrasContext) && !hideToolbar;

  const handleOpenInSystem = useCallback(async () => {
    if (!filePath) {
      messageApi.error(t('preview.errors.openWithoutPath'));
      return;
    }

    try {
      await ipcBridge.shell.openFile.invoke(filePath);
      messageApi.success(t('preview.openInSystemSuccess'));
    } catch (err) {
      messageApi.error(t('preview.openInSystemFailed'));
    }
  }, [filePath, messageApi, t]);

  const sheetCount = excelData?.sheets.length;

  useEffect(() => {
    if (!usePortalToolbar || !toolbarExtrasContext) return;
    toolbarExtrasContext.setExtras({
      left: (
        <div className='flex items-center gap-8px'>
          <span className='text-13px text-t-secondary'>📊 {t('preview.excel.title')}</span>
          <span className='text-11px text-t-tertiary'>{t('preview.readOnlyLabel')}</span>
          {typeof sheetCount === 'number' && <span className='text-12px text-t-secondary'>{t('preview.excel.sheetCount', { count: sheetCount })}</span>}
        </div>
      ),
      right: null,
    });
    return () => toolbarExtrasContext.setExtras(null);
  }, [usePortalToolbar, toolbarExtrasContext, sheetCount, t]);

  /**
   * 加载 Excel 文件
   */
  useEffect(() => {
    const loadExcel = async () => {
      if (!filePath) {
        setError(t('preview.errors.missingFilePath'));
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // 通过 IPC 调用主进程转换
        // 调用统一的 document.convert 将 Excel 转换为 JSON / Convert Excel to JSON via document.convert
        const response = await ipcBridge.document.convert.invoke({ filePath, to: 'excel-json' });

        if (response.to !== 'excel-json') {
          throw new Error(t('preview.excel.convertFailed'));
        }

        if (response.result.success && response.result.data) {
          setExcelData(response.result.data);
          // 默认选中第一个工作表
          if (response.result.data.sheets.length > 0) {
            setActiveSheet(response.result.data.sheets[0].name);
          }
        } else {
          throw new Error(response.result.error || t('preview.excel.convertFailed'));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('preview.excel.loadFailed'));
      } finally {
        setLoading(false);
      }
    };

    void loadExcel();
  }, [filePath, t]);

  /**
   * 渲染工作表数据为 HTML 表格
   */
  const renderSheetTable = (sheetName: string) => {
    const sheet = excelData?.sheets.find((s) => s.name === sheetName);
    const hasTableData = !!sheet?.data && sheet.data.length > 0;
    const sheetImages = sheet?.images || [];

    if (!hasTableData && sheetImages.length === 0) {
      return (
        <div className='flex items-center justify-center h-200px'>
          <div className='text-center'>
            <div className='text-14px text-t-secondary mb-8px'>{t('preview.excel.emptySheet')}</div>
            <div className='text-12px text-t-tertiary'>{t('preview.excel.emptySheetHint')}</div>
          </div>
        </div>
      );
    }

    const rows = hasTableData && sheet ? sheet.data : [[]];
    const imageMap = new Map<string, typeof sheetImages>();
    const rowImageMaxCols = new Map<number, number>();
    let maxImageRow = -1;
    sheetImages.forEach((img) => {
      const key = `${img.row}-${img.col}`;
      const list = imageMap.get(key) || [];
      list.push(img);
      imageMap.set(key, list);
      const existingMax = rowImageMaxCols.get(img.row) ?? 0;
      if (img.col + 1 > existingMax) {
        rowImageMaxCols.set(img.row, img.col + 1);
      }
      if (img.row > maxImageRow) {
        maxImageRow = img.row;
      }
    });

    const maxColumnsFromData = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
    const maxColumnsFromMerges = (sheet?.merges || []).reduce((max, merge) => Math.max(max, (merge?.e?.c ?? 0) + 1), 0);
    const maxColumnsFromImages = rowImageMaxCols.size > 0 ? Math.max(...rowImageMaxCols.values()) : 0;
    const totalColumns = Math.max(1, maxColumnsFromData, maxColumnsFromMerges, maxColumnsFromImages);

    const maxRowFromMerges = (sheet?.merges || []).reduce((max, merge) => Math.max(max, (merge?.e?.r ?? 0) + 1), 0);
    const totalRows = Math.max(rows.length, maxImageRow + 1, maxRowFromMerges);

    const mergeMap = new Map<string, { colSpan: number; rowSpan: number }>();
    const skipCells = new Set<string>();
    (sheet?.merges || []).forEach((merge) => {
      const start = merge.s;
      const end = merge.e;
      const colSpan = (end.c ?? start.c) - (start.c ?? 0) + 1;
      const rowSpan = (end.r ?? start.r) - (start.r ?? 0) + 1;
      const key = `${start.r}-${start.c}`;
      mergeMap.set(key, { colSpan, rowSpan });

      for (let r = start.r; r <= end.r; r += 1) {
        for (let c = start.c; c <= end.c; c += 1) {
          if (r === start.r && c === start.c) continue;
          skipCells.add(`${r}-${c}`);
        }
      }
    });

    const renderCellContent = (value: unknown, cellImages?: typeof sheetImages) => {
      const text = value === undefined || value === null ? '' : String(value);
      const hasText = text !== '';
      const hasImages = !!cellImages && cellImages.length > 0;
      if (!hasText && !hasImages) return null;

      return (
        <div className='flex flex-col gap-4px'>
          {hasText && <span>{text}</span>}
          {cellImages?.map((img, idx) => {
            const maxWidth = img.width ? Math.min(img.width, 240) : 160;
            const maxHeight = img.height ? Math.min(img.height, 200) : 120;
            return (
              <img
                key={`${img.col}-${img.row}-${idx}`}
                src={img.src}
                alt={img.alt || 'cell image'}
                style={{
                  maxWidth: `${maxWidth}px`,
                  maxHeight: `${maxHeight}px`,
                  width: img.width ? `${Math.min(img.width, 240)}px` : 'auto',
                  height: img.height ? `${Math.min(img.height, 200)}px` : 'auto',
                  objectFit: 'contain',
                  borderRadius: '4px',
                  backgroundColor: 'var(--bg-1)',
                }}
              />
            );
          })}
        </div>
      );
    };

    return (
      <div className='w-full h-full overflow-auto p-10px bg-bg-1'>
        <div className='relative inline-block min-w-full'>
          <table
            className='border-collapse text-13px text-t-primary'
            style={{
              borderCollapse: 'collapse',
              border: '1px solid var(--color-border-2, #d4d4d8)',
            }}
          >
            <tbody>
              {Array.from({ length: totalRows }).map((_, rowIndex) => {
                const rowData = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
                const rowKey = `${sheetName}-row-${rowIndex}`;
                const backgroundColor = rowIndex % 2 === 0 ? 'var(--color-bg-1, #ffffff)' : 'var(--color-fill-1, #f2f3f5)';

                return (
                  <tr key={rowKey} style={{ backgroundColor }}>
                    {Array.from({ length: totalColumns }).map((_, colIndex) => {
                      const cellKey = `${rowIndex}-${colIndex}`;
                      if (skipCells.has(cellKey)) {
                        return null;
                      }

                      const mergeInfo = mergeMap.get(cellKey);
                      const value = rowData[colIndex];
                      const cellImages = imageMap.get(cellKey);
                      const content = renderCellContent(value, cellImages);

                      return (
                        <td
                          key={cellKey}
                          colSpan={mergeInfo?.colSpan}
                          rowSpan={mergeInfo?.rowSpan}
                          className='px-12px py-8px whitespace-pre-wrap align-top'
                          style={{
                            border: '1px solid var(--color-border-2, #d4d4d8)',
                            minWidth: '100px',
                            backgroundColor,
                          }}
                        >
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-14px text-t-secondary'>{t('preview.excel.loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-center'>
          <div className='text-16px text-t-error mb-8px'>❌ {error}</div>
          <div className='text-12px text-t-secondary'>{t('preview.excel.invalid')}</div>
        </div>
      </div>
    );
  }

  if (!excelData || excelData.sheets.length === 0) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-14px text-t-secondary'>{t('preview.excel.noSheets')}</div>
      </div>
    );
  }

  return (
    <div className='h-full w-full flex flex-col'>
      {messageContextHolder}

      {/* 工具栏 */}
      {!usePortalToolbar && !hideToolbar && (
        <div className='flex items-center justify-between h-40px px-12px bg-bg-2 border-b border-border-base flex-shrink-0'>
          <div className='flex items-center gap-8px'>
            <span className='text-13px text-t-secondary'>📊 {t('preview.excel.title')}</span>
            <span className='text-11px text-t-tertiary'>{t('preview.readOnlyLabel')}</span>
          </div>

          <div className='flex items-center gap-8px'>
            <span className='text-12px text-t-secondary'>{t('preview.excel.sheetCount', { count: excelData.sheets.length })}</span>
            {filePath && (
              <Button size='mini' type='text' onClick={handleOpenInSystem} title={t('preview.openWithApp', { app: 'Excel' })}>
                <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                  <path d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' />
                  <polyline points='15 3 21 3 21 9' />
                  <line x1='10' y1='14' x2='21' y2='3' />
                </svg>
                <span>{t('preview.openWithApp', { app: 'Excel' })}</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* 内容区域 */}
      <div className='flex-1 overflow-hidden flex flex-col bg-bg-1'>
        {excelData.sheets.length === 1 ? (
          // 单个工作表：直接显示表格
          renderSheetTable(excelData.sheets[0].name)
        ) : (
          // 多个工作表：使用紧凑的工作表切换栏
          <>
            {/* 工作表切换栏 */}
            <div className='flex items-center h-28px px-8px bg-bg-1 border-b border-border-base overflow-x-auto flex-shrink-0'>
              {excelData.sheets.map((sheet) => (
                <button
                  key={sheet.name}
                  type='button'
                  className='px-12px h-24px flex items-center cursor-pointer text-11px whitespace-nowrap transition-colors'
                  style={{
                    color: activeSheet === sheet.name ? 'var(--color-text-1)' : 'var(--color-text-3)',
                    backgroundColor: activeSheet === sheet.name ? 'var(--color-bg-2)' : 'transparent',
                    fontWeight: activeSheet === sheet.name ? 500 : 400,
                    borderRadius: '2px',
                    border: 'none',
                    outline: 'none',
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setActiveSheet(sheet.name);
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                >
                  {sheet.name}
                </button>
              ))}
            </div>
            {/* 当前工作表内容 */}
            <div className='flex-1 overflow-hidden' key={activeSheet}>
              {renderSheetTable(activeSheet)}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ExcelPreview;
