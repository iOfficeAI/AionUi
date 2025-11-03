import { useCallback } from 'react';
import type { FileMetadata } from '@/renderer/services/FileService';
import { getCleanFileNames } from '@/renderer/services/FileService';

/**
 * 创建通用的setUploadFile函数
 * 支持函数式更新，避免闭包陷阱
 */
export const createSetUploadFile = (mutate: (fn: (prev: any) => any) => void, data: any) => {
  return useCallback(
    (uploadFile: string[] | ((prev: string[]) => string[])) => {
      mutate((prev: any) => {
        const newUploadFile = typeof uploadFile === 'function' ? uploadFile(prev?.uploadFile || []) : uploadFile;
        return { ...prev, uploadFile: newUploadFile };
      });
    },
    [data, mutate]
  );
};

interface UseSendBoxFilesProps {
  atPath: string[];
  uploadFile: string[];
  setAtPath: (atPath: string[]) => void;
  setUploadFile: (uploadFile: string[] | ((prev: string[]) => string[])) => void;
}

/**
 * 独立的文件格式化工具函数，用于GUID等不需要完整SendBox状态管理的组件
 * Note: files can be full paths, getCleanFileNames will extract filenames
 */
export const formatFilesForMessage = (files: string[]): string => {
  if (files.length > 0) {
    return getCleanFileNames(files)
      .map((v) => `@${v}`)
      .join(' ');
  }
  return '';
};

/**
 * 共享的SendBox文件处理逻辑
 * 消除ACP、Gemini、GUID三个组件间的代码重复
 */
export const useSendBoxFiles = ({ atPath, uploadFile, setAtPath, setUploadFile }: UseSendBoxFilesProps) => {
  // 处理拖拽或粘贴的文件
  const handleFilesAdded = useCallback(
    (files: FileMetadata[]) => {
      const filePaths = files.map((file) => file.path);
      // 使用函数式更新，基于最新状态而不是闭包中的状态
      setUploadFile((prevUploadFile) => [...prevUploadFile, ...filePaths]);
    },
    [setUploadFile]
  );

  // 处理消息中的文件引用（@文件名 格式）
  // Process file references in messages (format: @filename)
  const processMessageWithFiles = useCallback(
    (message: string): string => {
      if (atPath.length || uploadFile.length) {
        const cleanUploadFiles = getCleanFileNames(uploadFile).map((fileName) => '@' + fileName);
        // atPath 现在包含完整路径，只提取文件名用于消息显示
        // atPath now contains full paths, extract filenames only for message display
        const cleanAtPaths = getCleanFileNames(atPath).map((fileName) => '@' + fileName);
        return cleanUploadFiles.join(' ') + ' ' + cleanAtPaths.join(' ') + ' ' + message;
      }
      return message;
    },
    [atPath, uploadFile]
  );

  // 清理文件状态
  const clearFiles = useCallback(() => {
    setAtPath([]);
    setUploadFile([]);
  }, [setAtPath, setUploadFile]);

  return {
    handleFilesAdded,
    processMessageWithFiles,
    clearFiles,
  };
};
