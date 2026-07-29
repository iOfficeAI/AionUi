/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ChatFileRef, chatFileRefPath, localFileRef, uploadFileRef } from '@/common/types/chatFile';
import { useDragUpload } from '@/renderer/hooks/file/useDragUpload';
import { usePasteService } from '@/renderer/hooks/file/usePasteService';
import { allSupportedExts, type FileMetadata } from '@/renderer/services/FileService';
import { measureCaretTop, scrollCaretToLastLine } from '../utils/caretUtils';
import { useCallback, useEffect, useState } from 'react';

export type GuidInputResult = {
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  files: ChatFileRef[];
  setFiles: React.Dispatch<React.SetStateAction<ChatFileRef[]>>;
  dir: string;
  setDir: React.Dispatch<React.SetStateAction<string>>;
  isInputFocused: boolean;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  handleFilesPasted: (pastedFiles: FileMetadata[]) => void;
  /** Device uploads (blob → managed dir): sent as `upload` refs. */
  handleFilesUploaded: (uploadedPaths: string[]) => void;
  /** Backend-machine picker paths (native/server-fs): sent as `local` refs. */
  handleFilesPicked: (pickedPaths: string[]) => void;
  handleRemoveFile: (targetPath: string) => void;
  handleTextareaFocus: () => void;
  handleTextareaBlur: () => void;
  onPaste: ReturnType<typeof usePasteService>['onPaste'];
  isFileDragging: boolean;
  dragHandlers: ReturnType<typeof useDragUpload>['dragHandlers'];
};

type UseGuidInputOptions = {
  locationState: { workspace?: string } | null;
};

/**
 * Hook that manages input state, file handling, and drag/paste for the Guid page.
 */
export const useGuidInput = ({ locationState }: UseGuidInputOptions): GuidInputResult => {
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<ChatFileRef[]>([]);
  const [dir, setDir] = useState<string>('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  // Read workspace from location.state (passed from tabs add button)
  useEffect(() => {
    if (locationState?.workspace) {
      setDir(locationState.workspace);
    }
  }, [locationState]);

  // Handle pasted files (append mode to support multiple pastes)
  // Do NOT clear dir here: paste/drag should coexist with a selected workspace,
  // matching the dialog-upload path (handleFilesUploaded).
  const handleFilesPasted = useCallback((pastedFiles: FileMetadata[]) => {
    // Paste/drag bytes are uploaded to the managed dir by the paste/drag hooks →
    // `upload` refs.
    const refs = pastedFiles.map((file) => uploadFileRef(file.path));
    setFiles((prevFiles) => [...prevFiles, ...refs]);
  }, []);

  // Device uploads (browser input → managed dir): append as `upload` refs.
  const handleFilesUploaded = useCallback((uploadedPaths: string[]) => {
    setFiles((prevFiles) => [...prevFiles, ...uploadedPaths.map(uploadFileRef)]);
  }, []);

  // Backend-machine picker (native dialog / server-fs browse): append as `local`
  // refs — the path is already absolute on the backend host, sent as-is.
  const handleFilesPicked = useCallback((pickedPaths: string[]) => {
    setFiles((prevFiles) => [...prevFiles, ...pickedPaths.map(localFileRef)]);
  }, []);

  const handleRemoveFile = useCallback((targetPath: string) => {
    setFiles((prevFiles) => prevFiles.filter((ref) => chatFileRefPath(ref) !== targetPath));
  }, []);

  // Use drag upload hook (drag treated like paste, appends to existing files)
  const { isFileDragging, dragHandlers } = useDragUpload({
    supportedExts: allSupportedExts,
    onFilesAdded: handleFilesPasted,
  });

  // Use shared PasteService integration (paste appends to existing files)
  const { onPaste, onFocus } = usePasteService({
    supportedExts: allSupportedExts,
    onFilesAdded: handleFilesPasted,
    onTextPaste: (text: string) => {
      const textarea = document.activeElement as HTMLTextAreaElement | null;
      if (textarea && textarea.tagName === 'TEXTAREA') {
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? start;
        const current_value = textarea.value;
        const newValue = current_value.slice(0, start) + text + current_value.slice(end);
        setInput(newValue);

        setTimeout(() => {
          const newPos = start + text.length;
          textarea.setSelectionRange(newPos, newPos);
          const caretTop = measureCaretTop(textarea, newPos);
          scrollCaretToLastLine(textarea, caretTop);
        }, 0);
      } else {
        setInput((prev) => prev + text);
      }
    },
  });

  const handleTextareaFocus = useCallback(() => {
    onFocus();
    setIsInputFocused(true);
  }, [onFocus]);

  const handleTextareaBlur = useCallback(() => {
    setIsInputFocused(false);
  }, []);

  return {
    input,
    setInput,
    files,
    setFiles,
    dir,
    setDir,
    isInputFocused,
    loading,
    setLoading,
    handleFilesPasted,
    handleFilesUploaded,
    handleFilesPicked,
    handleRemoveFile,
    handleTextareaFocus,
    handleTextareaBlur,
    onPaste,
    isFileDragging,
    dragHandlers,
  };
};
