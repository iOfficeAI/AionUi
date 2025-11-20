/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ExcelWorkbookData } from '@/common/types/conversion';
import { Message } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';

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
  const [excelData, setExcelData] = useState<ExcelWorkbookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [, messageContextHolder] = Message.useMessage();

  /**
   * 加载 Excel 文件
   */
  useEffect(() => {
    const loadExcel = async () => {
      if (!filePath) {
        setError('未提供文件路径');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // 通过 IPC 调用主进程转换
        const result = await ipcBridge.conversion.excelToJson.invoke({ filePath });

        if (result.success && result.data) {
          setExcelData(result.data);
          // 默认选中第一个工作表
          if (result.data.sheets.length > 0) {
            setActiveSheet(result.data.sheets[0].name);
          }
        } else {
          throw new Error(result.error || 'Excel 转换失败');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载 Excel 文档失败');
      } finally {
        setLoading(false);
      }
    };

    void loadExcel();
  }, [filePath]);

  /**
   * 渲染工作表数据为 HTML 表格
   */
  const renderSheetTable = (sheetName: string) => {
    const sheet = excelData?.sheets.find((s) => s.name === sheetName);
    if (!sheet || !sheet.data || sheet.data.length === 0) {
      return (
        <div className='flex items-center justify-center h-200px'>
          <div className='text-center'>
            <div className='text-14px text-t-secondary mb-8px'>此工作表无数据</div>
            <div className='text-12px text-t-tertiary'>请检查 Excel 文件是否包含数据</div>
          </div>
        </div>
      );
    }

    const data = sheet.data;

    // 如果只有表头没有数据行，显示提示
    if (data.length === 1) {
      return (
        <div className='w-full h-full overflow-auto p-16px bg-bg-1'>
          <div className='mb-16px'>
            <table className='min-w-full border-collapse border border-border-base'>
              <thead>
                <tr className='bg-bg-3'>
                  {data[0]?.map((cell: any, colIndex: number) => (
                    <th key={colIndex} className='border border-border-base px-12px py-8px text-left text-13px font-600 text-t-primary min-w-100px whitespace-nowrap'>
                      {String(cell || '')}
                    </th>
                  ))}
                </tr>
              </thead>
            </table>
          </div>
          <div className='text-center py-40px'>
            <div className='text-14px text-t-secondary mb-8px'>⚠️ 此工作表仅包含表头，无数据行</div>
            <div className='text-12px text-t-tertiary'>请检查 Excel 文件是否包含数据行</div>
          </div>
        </div>
      );
    }

    return (
      <div className='w-full h-full overflow-auto p-16px bg-bg-1'>
        <div className='relative inline-block min-w-full'>
          <table
            className='border-collapse text-13px text-t-primary'
            style={{
              borderCollapse: 'collapse',
              border: '1px solid var(--color-border-2, #d4d4d8)',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: 'var(--color-fill-2, #f7f8fa)' }}>
                {data[0]?.map((cell: any, colIndex: number) => (
                  <th
                    key={colIndex}
                    className='px-12px py-8px text-left font-600 whitespace-nowrap'
                    style={{
                      border: '1px solid var(--color-border-2, #d4d4d8)',
                      minWidth: '100px',
                    }}
                  >
                    {String(cell || '')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.slice(1).map((row: any, rowIndex: number) => {
                const rowData = Array.isArray(row) ? row : [];
                const cellCount = Math.max(rowData.length, data[0]?.length || 0);

                return (
                  <tr
                    key={rowIndex}
                    style={{
                      backgroundColor: rowIndex % 2 === 0 ? 'var(--color-bg-1, #ffffff)' : 'var(--color-fill-1, #f2f3f5)',
                    }}
                  >
                    {Array.from({ length: cellCount }).map((_, colIndex) => (
                      <td
                        key={colIndex}
                        className='px-12px py-8px'
                        style={{
                          border: '1px solid var(--color-border-2, #d4d4d8)',
                          minWidth: '100px',
                        }}
                      >
                        {String(rowData[colIndex] ?? '')}
                      </td>
                    ))}
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
        <div className='text-14px text-t-secondary'>加载 Excel 文档中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-center'>
          <div className='text-16px text-t-error mb-8px'>❌ {error}</div>
          <div className='text-12px text-t-secondary'>请检查文件是否为有效的 Excel 文档</div>
        </div>
      </div>
    );
  }

  if (!excelData || excelData.sheets.length === 0) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-14px text-t-secondary'>Excel 文件中没有工作表</div>
      </div>
    );
  }

  return (
    <div className='h-full w-full flex flex-col'>
      {messageContextHolder}

      {/* 工具栏 */}
      {!hideToolbar && (
        <div className='flex items-center justify-between h-40px px-12px bg-bg-2 border-b border-border-base flex-shrink-0'>
          <div className='flex items-center gap-8px'>
            <span className='text-13px text-t-secondary'>📊 Excel 表格</span>
            <span className='text-11px text-t-tertiary'>只读预览</span>
          </div>

          <div className='flex items-center gap-8px'>
            <span className='text-12px text-t-secondary'>{excelData.sheets.length} 个工作表</span>
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
