import { useCallback } from 'react';
import type { FileMetadata } from '@/renderer/services/FileService';
import { getCleanFileNames, getFileExtension, textExts } from '@/renderer/services/FileService';
import type { FileOrFolderItem } from '@/renderer/types/files';

/**
 * 创建通用的setUploadFile函数
 * 支持函数式更新，避免闭包陷阱
 */
export const createSetUploadFile = (mutate: (fn: (prev: Record<string, unknown> | undefined) => Record<string, unknown>) => void, data: unknown) => {
  return useCallback(
    (uploadFile: string[] | ((prev: string[]) => string[])) => {
      mutate((prev) => {
        // 取出最新的上传文件列表，保证函数式更新正确 / Derive latest upload list to keep functional updates accurate
        const previousUploadFile = Array.isArray(prev?.uploadFile) ? (prev?.uploadFile as string[]) : [];
        const newUploadFile = typeof uploadFile === 'function' ? uploadFile(previousUploadFile) : uploadFile;
        return { ...(prev ?? {}), uploadFile: newUploadFile };
      });
    },
    [data, mutate]
  );
};

const formatFileRef = (fileName: string): string => {
  const trimmed = fileName.trim();
  const normalized = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  const ext = getFileExtension(normalized);
  if (textExts.includes(ext)) {
    return '@' + normalized;
  }
  return normalized;
};

interface UseSendBoxFilesProps {
  atPath: Array<string | FileOrFolderItem>;
  uploadFile: string[];
  setAtPath: (atPath: Array<string | FileOrFolderItem>) => void;
  setUploadFile: (uploadFile: string[] | ((prev: string[]) => string[])) => void;
}

/**
 * 独立的文件格式化工具函数，用于GUID等不需要完整SendBox状态管理的组件
 * Note: files can be full paths, getCleanFileNames will extract filenames
 */
export const formatFilesForMessage = (files: string[]): string => {
  if (files.length > 0) {
    return getCleanFileNames(files)
      .map((v) => formatFileRef(v))
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
        const cleanUploadFiles = getCleanFileNames(uploadFile).map((fileName) => formatFileRef(fileName));
        // atPath 现在可能包含字符串路径或对象，需要分别处理
        // atPath may now contain string paths or objects, need to handle separately
        const atPathStrings = atPath.map((item) => {
          if (typeof item === 'string') {
            return item;
          } else {
            return item.path;
          }
        });
        const cleanAtPaths = getCleanFileNames(atPathStrings).map((fileName) => formatFileRef(fileName));
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
