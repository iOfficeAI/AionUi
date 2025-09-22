import { useCallback } from 'react';
import { ipcBridge } from '@/common';
import type { FileMetadata } from '@/renderer/services/FileService';
import { getFileExtension } from '@/renderer/services/FileService';

interface UseLocalPasteProps {
  supportedExts: string[];
  onFilesAdded?: (files: FileMetadata[]) => void;
  setInput?: (value: string) => void;
  input?: string;
}

// MIME 类型到文件扩展名的映射
function getExtensionFromMimeType(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/bmp': '.bmp',
    'image/svg+xml': '.svg',
  };
  return mimeMap[mimeType] || '.png'; // 默认为 .png
}

/**
 * 组件级的粘贴处理hook - 替代全局的PasteService
 * 直接返回onPaste事件处理器，在组件上使用
 */
export const useLocalPaste = ({ supportedExts, onFilesAdded, setInput, input }: UseLocalPasteProps) => {
  const handlePaste = useCallback(
    async (event: React.ClipboardEvent) => {
      if (!onFilesAdded) return;

      const clipboardText = event.clipboardData?.getData('text');
      const files = event.clipboardData?.files;

      // 如果有文本但没有文件，只允许默认行为，不手动设置
      if (clipboardText && (!files || files.length === 0)) {
        // 不手动设置文本，让浏览器默认行为处理，避免重复
        return; // 允许默认行为继续处理文本
      }

      // 如果有文件，处理文件上传
      if (files && files.length > 0) {
        event.preventDefault(); // 阻止默认行为，我们自己处理文件

        const fileList: FileMetadata[] = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const filePath = (file as File & { path?: string }).path;

          // 检查是否有文件路径 (Electron 环境下 File 对象会有额外的 path 属性)
          if (!filePath && file.type.startsWith('image/')) {
            // 剪贴板图片，需要检查是否支持该类型
            const fileExt = getFileExtension(file.name) || getExtensionFromMimeType(file.type);

            if (supportedExts.includes(fileExt)) {
              try {
                const arrayBuffer = await file.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);

                // 生成简洁的文件名，如果剪贴板图片有奇怪的默认名，替换为简洁名称
                const now = new Date();
                const timeStr = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;

                // 如果文件名看起来像系统生成的（包含时间戳格式），使用我们的命名
                const isSystemGenerated = file.name && /^[a-zA-Z]?_?\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/.test(file.name);
                const fileName = file.name && !isSystemGenerated ? file.name : `pasted_image_${timeStr}${fileExt}`;

                // 创建临时文件并写入数据
                const tempPath = await ipcBridge.fs.createTempFile.invoke({ fileName });
                if (tempPath) {
                  await ipcBridge.fs.writeFile.invoke({ path: tempPath, data: uint8Array });
                }

                if (tempPath) {
                  fileList.push({
                    name: fileName,
                    path: tempPath,
                    size: file.size,
                    type: file.type,
                    lastModified: Date.now(),
                  });
                }
              } catch (error) {
                console.error('创建临时文件失败:', error);
              }
            } else {
              // 不支持的文件类型，跳过但不报错（让后续过滤处理）
              console.warn(`Unsupported image type: ${file.type}, extension: ${fileExt}`);
            }
          } else if (filePath) {
            // 有文件路径的文件（从文件管理器拖拽的文件）
            // 检查文件类型是否支持
            const fileExt = getFileExtension(file.name);

            if (supportedExts.includes(fileExt)) {
              fileList.push({
                name: file.name,
                path: filePath,
                size: file.size,
                type: file.type,
                lastModified: file.lastModified,
              });
            } else {
              // 不支持的文件类型
              console.warn(`Unsupported file type: ${file.name}, extension: ${fileExt}`);
            }
          } else if (!file.type.startsWith('image/')) {
            // 没有文件路径的非图片文件（从文件管理器复制粘贴的文件）
            const fileExt = getFileExtension(file.name);

            if (supportedExts.includes(fileExt)) {
              // 对于复制粘贴的文件，我们需要创建临时文件
              try {
                const arrayBuffer = await file.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);

                // 使用原文件名
                const fileName = file.name;

                // 创建临时文件并写入数据
                const tempPath = await ipcBridge.fs.createTempFile.invoke({ fileName });
                if (tempPath) {
                  await ipcBridge.fs.writeFile.invoke({ path: tempPath, data: uint8Array });

                  fileList.push({
                    name: fileName,
                    path: tempPath,
                    size: file.size,
                    type: file.type,
                    lastModified: Date.now(),
                  });
                }
              } catch (error) {
                console.error('创建临时文件失败:', error);
              }
            } else {
              console.warn(`Unsupported file type: ${file.name}, extension: ${fileExt}`);
            }
          }
        }

        // 处理完文件后，如果有文件则调用回调
        if (fileList.length > 0) {
          onFilesAdded(fileList);
        }
      }
    },
    [supportedExts, onFilesAdded, setInput, input]
  );

  return {
    onPaste: handlePaste,
  };
};
