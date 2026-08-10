import { type ChatFileRef, chatFileRefKey, uploadFileRef } from '@/common/types/chatFile';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

/**
 * Collect the send-path file refs from the two selection sources, source-tagged
 * and deduped. `uploadFile` paths (device uploads → managed dir) become `upload`
 * refs; `atPath` items carrying a `chatRef` (Explorer tree → `project`, backend
 * machine picker → `local`) are sent verbatim; bare `atPath` entries without a
 * `chatRef` fall back to `upload`. The backend resolves each ref to an absolute
 * path — the front-end no longer builds paths nor splices the `[[AION_FILES]]`
 * marker into the message body.
 */
export const collectChatFileRefs = (uploadFile: string[], atPath: Array<string | FileOrFolderItem>): ChatFileRef[] => {
  const refs: ChatFileRef[] = [];
  const seen = new Set<string>();
  const push = (ref: ChatFileRef): void => {
    const key = chatFileRefKey(ref);
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(ref);
  };

  for (const path of uploadFile) {
    if (path) push(uploadFileRef(path));
  }
  for (const item of atPath) {
    if (typeof item === 'string') {
      if (item) push(uploadFileRef(item));
    } else if (item.chatRef) {
      push(item.chatRef);
    } else if (item.path) {
      push(uploadFileRef(item.path));
    }
  }
  return refs;
};

/**
 * Split refs back into the two send-box selection lanes — the inverse of
 * {@link collectChatFileRefs}, used when a queued command is edited back into
 * the box. `upload` refs return as paths (the `uploadFile` lane); `project` and
 * `local` refs rebuild a selection item carrying their `chatRef` (the `atPath`
 * lane) so a re-send collects the same ref again.
 */
export const splitChatFileRefs = (refs: ChatFileRef[]): { uploadFiles: string[]; atPath: FileOrFolderItem[] } => {
  const uploadFiles: string[] = [];
  const atPath: FileOrFolderItem[] = [];
  for (const ref of refs) {
    if (ref.kind === 'upload') {
      uploadFiles.push(ref.path);
    } else {
      const path = ref.kind === 'project' ? ref.relative_path : ref.path;
      atPath.push({
        path,
        name: path.split(/[\\/]/).pop() || path,
        isFile: true,
        chatRef: ref,
      });
    }
  }
  return { uploadFiles, atPath };
};
