/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ipcBridge } from '@/common';
import type { PPTJsonData } from '@/common/types/conversion';

interface PPTPreviewProps {
  /**
   * PPT file path (absolute path on disk)
   * PPT 文件路径（磁盘上的绝对路径）
   */
  filePath?: string;
  /**
   * PPT content as JSON string
   * PPT 内容（JSON 字符串）
   */
  content?: string;
}

const PPTPreview: React.FC<PPTPreviewProps> = ({ filePath, content }) => {
  const [pptData, setPptData] = useState<PPTJsonData | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (content) {
        const data = JSON.parse(content) as PPTJsonData;
        console.log('[PPTPreview] Parsed PPT data:', data);
        setPptData(data);
        setCurrentSlide(0);
      } else {
        setError('PPT 内容为空');
      }
    } catch (err) {
      console.error('[PPTPreview] Failed to parse PPT data:', err);
      setError(`解析 PPT 数据失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [content]);

  const handleOpenExternal = async () => {
    if (filePath) {
      try {
        await ipcBridge.shell.openFile.invoke(filePath);
      } catch (err) {
        console.error('[PPTPreview] Failed to open file:', err);
      }
    }
  };

  const handleShowInFolder = async () => {
    if (filePath) {
      try {
        await ipcBridge.shell.showItemInFolder.invoke(filePath);
      } catch (err) {
        console.error('[PPTPreview] Failed to show in folder:', err);
      }
    }
  };

  const goToPreviousSlide = () => {
    if (pptData && currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const goToNextSlide = () => {
    if (pptData && currentSlide < pptData.slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  if (error) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-center'>
          <div className='text-16px text-t-error mb-8px'>❌ {error}</div>
          <div className='text-12px text-t-secondary'>无法加载 PPT 文件</div>
        </div>
      </div>
    );
  }

  if (!pptData || pptData.slides.length === 0) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-14px text-t-secondary'>加载中...</div>
      </div>
    );
  }

  // PPT 幻灯片预览界面 / PPT slides preview interface
  return (
    <div className='h-full w-full bg-bg-1 flex flex-col'>
      {/* 工具栏 / Toolbar */}
      <div className='flex items-center justify-between px-16px py-12px border-b border-line-1'>
        <div className='flex items-center gap-8px'>
          <span className='text-24px'>📊</span>
          <div>
            <div className='text-14px text-t-primary font-medium'>PowerPoint 演示文稿</div>
            <div className='text-11px text-t-tertiary'>
              幻灯片 {currentSlide + 1} / {pptData.slides.length}
            </div>
          </div>
        </div>

        <div className='flex items-center gap-8px'>
          {/* 幻灯片导航 / Slide navigation */}
          <button onClick={goToPreviousSlide} disabled={currentSlide === 0} className='inline-flex items-center gap-4px px-10px py-6px bg-bg-3 text-t-primary rd-4px hover:bg-bg-4 transition-colors text-12px disabled:opacity-50 disabled:cursor-not-allowed'>
            <span>◀</span>
            <span>上一页</span>
          </button>

          <button onClick={goToNextSlide} disabled={currentSlide === pptData.slides.length - 1} className='inline-flex items-center gap-4px px-10px py-6px bg-bg-3 text-t-primary rd-4px hover:bg-bg-4 transition-colors text-12px disabled:opacity-50 disabled:cursor-not-allowed'>
            <span>下一页</span>
            <span>▶</span>
          </button>

          {filePath && (
            <>
              <div className='w-1px h-20px bg-line-1 mx-4px' />

              <button onClick={handleOpenExternal} className='inline-flex items-center gap-6px px-12px py-6px bg-bg-3 text-t-primary rd-4px hover:bg-bg-4 transition-colors text-12px'>
                <span>🚀</span>
                <span>打开原文件</span>
              </button>

              <button onClick={handleShowInFolder} className='inline-flex items-center gap-6px px-12px py-6px bg-bg-3 text-t-primary rd-4px hover:bg-bg-4 transition-colors text-12px'>
                <span>📁</span>
                <span>显示位置</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 幻灯片内容区域 / Slide content area */}
      <div className='flex-1 overflow-auto p-24px bg-bg-2'>
        <div className='max-w-1200px mx-auto'>
          {/* 提示信息 / Hint message */}
          <div className='mb-16px p-12px bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rd-6px'>
            <div className='text-12px text-blue-800 dark:text-blue-200'>💡 提示：这是 PowerPoint 幻灯片的结构化预览。完整的视觉呈现请使用"打开原文件"功能。</div>
          </div>

          {/* 当前幻灯片 / Current slide */}
          <div className='bg-white dark:bg-bg-3 rd-8px p-24px shadow-sm'>
            <div className='text-18px text-t-primary font-semibold mb-16px border-b border-line-1 pb-12px'>
              幻灯片 {currentSlide + 1}
              <span className='text-12px text-t-tertiary ml-8px font-normal'>（结构化数据预览）</span>
            </div>

            {/* 幻灯片内容 / Slide content */}
            <div className='space-y-12px'>
              {/* 折叠/展开的 JSON 查看器 */}
              <details className='cursor-pointer'>
                <summary className='text-14px text-t-secondary font-medium mb-8px select-none hover:text-t-primary transition-colors'>📄 查看原始数据结构 (点击展开/折叠)</summary>
                <pre className='font-mono text-11px text-t-secondary bg-bg-2 p-16px rd-6px overflow-auto max-h-600px border border-line-1 mt-8px'>{JSON.stringify(pptData.slides[currentSlide].content, null, 2)}</pre>
              </details>

              <div className='text-12px text-t-tertiary mt-12px p-12px bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rd-6px'>
                💡 <strong>说明</strong>：PowerPoint 幻灯片已成功解析为结构化数据。 如需查看完整的视觉效果，请使用"打开原文件"按钮在系统应用中打开。
              </div>
            </div>
          </div>

          {/* 幻灯片缩略图列表 / Slide thumbnail list */}
          <div className='mt-24px'>
            <div className='text-14px text-t-primary font-medium mb-12px'>所有幻灯片</div>
            <div className='grid grid-cols-4 gap-12px'>
              {pptData.slides.map((slide, index) => (
                <div key={index} onClick={() => setCurrentSlide(index)} className={`cursor-pointer p-12px rd-6px border-2 transition-all ${index === currentSlide ? 'border-primary bg-primary bg-opacity-10' : 'border-line-1 bg-bg-3 hover:border-primary hover:border-opacity-50'}`}>
                  <div className='text-12px text-t-secondary mb-4px'>幻灯片 {index + 1}</div>
                  <div className='text-10px text-t-tertiary truncate'>点击查看</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PPTPreview;
