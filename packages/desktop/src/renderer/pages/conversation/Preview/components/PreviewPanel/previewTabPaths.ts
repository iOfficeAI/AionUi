/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChatFileRef } from '@/common/types/chatFile';
import type { PreviewContentType } from '../../types';

/**
 * 怎么复制这个 tab 的绝对路径。
 *
 * `filePath` —— 渲染进程手上就有后端主机上的绝对路径。
 * `url` —— 浏览器 tab 的地址。可以复制，但它**不是文件系统路径**：这一支之所以
 *   与 filePath 分开，就是为了「打开所在目录」永远不会把一个 URL 交给
 *   showItemInFolder。
 * `projectRef` —— 渲染进程**从来拿不到**项目文件的绝对路径（见 ipcBridge.fs 的
 *   注释：前端不构造也不接收绝对路径），必须回后端 resolve 并由后端完成动作。
 *   这条路仅限 Electron 桌面端：远程 WebUI 不该看到宿主机的设备路径。
 *
 * How to address a tab's absolute location.
 *
 * `filePath` — the renderer already holds an absolute path on the backend host.
 * `url` — a browser tab's address. Copyable, but NOT a filesystem path: this
 *   variant is split from filePath precisely so that "show in folder" can never
 *   hand a URL to showItemInFolder.
 * `projectRef` — the renderer NEVER receives a project file's absolute path (see
 *   the ipcBridge.fs comments: the front end neither builds nor receives one), so
 *   the action has to go back to the backend, which resolves the ref and performs
 *   it. Electron desktop only: a remote WebUI must not be shown the host
 *   machine's device paths.
 */
export type PreviewTabAbsolutePath =
  | { kind: 'filePath'; value: string }
  | { kind: 'url'; value: string }
  | { kind: 'projectRef'; pe_id: string; relative_path: string };

/**
 * 一个 tab 可复制的地址。两者都是可选的：浏览器 tab 没有相对路径，
 * 而没有任何可寻址身份的 tab 两者皆无。
 *
 * The addresses a tab can copy. Both are optional: a browser tab has no
 * workspace-relative path, and a tab with no addressable identity has neither.
 */
export interface PreviewTabPaths {
  absolute?: PreviewTabAbsolutePath;
  relative?: string;
}

/**
 * tab 里参与路径解析的那部分，刻意只声明用到的字段 —— 这样这个纯函数不必
 * 跟着 PreviewTab / PreviewMetadata 的其余演化走。
 *
 * The slice of a tab that path resolution reads. Deliberately narrow so this
 * pure helper does not track the rest of PreviewTab / PreviewMetadata as they
 * evolve.
 */
export interface PreviewTabPathSource {
  content: string;
  content_type: PreviewContentType;
  metadata?: {
    fileRef?: ChatFileRef;
    file_path?: string;
    workspace?: string;
  };
}

/** Drop trailing separators so `/repo/` and `/repo` behave identically. */
const stripTrailingSeparators = (value: string): string => value.replace(/[\\/]+$/, '');

/**
 * 这个路径是不是 Windows 形态（有盘符，或含反斜杠）。
 *
 * 由字符串本身判断而非运行平台：这个模块是纯函数，而且路径可能来自后端主机 ——
 * 后端跑在哪个系统上，前端不该假设。
 *
 * Whether this looks like a Windows path (drive letter, or backslashes). Decided
 * from the string rather than the running platform: this module is pure, and the
 * path may describe the backend host, whose OS the front end must not assume.
 */
const isWindowsPath = (value: string): boolean => /^[a-zA-Z]:[\\/]/.test(value) || value.includes('\\');

/**
 * 把绝对路径转成相对 workspace 的路径；不在 workspace 内则返回 undefined。
 * Convert an absolute path to one relative to the workspace root, or undefined
 * when the file does not live inside it.
 */
const toWorkspaceRelative = (absolute: string, workspace?: string): string | undefined => {
  if (!workspace) return undefined;

  const root = stripTrailingSeparators(workspace);
  if (!root) return undefined;

  // Windows 路径大小写不敏感，`C:\repo` 与 `c:\repo` 是同一个目录 —— 两个字符串
  // 来自不同来源时盘符大小写常常不一致，逐字节比较会把文件判成「不在 workspace
  // 内」，「复制相对路径」于是在 Windows 上莫名置灰。
  //
  // POSIX 不能这么折叠：`/Repo` 和 `/repo` 确实是两个不同的目录，忽略大小写会给出
  // 一个错误的相对路径。所以判据取自路径形态，而不是一刀切。
  //
  // Windows paths are case-insensitive — `C:\repo` and `c:\repo` are one directory
  // — and when the two strings come from different sources their drive letters
  // often disagree. A byte-wise comparison then reads the file as outside the
  // workspace, silently greying out copy-relative-path on Windows.
  //
  // POSIX must not fold this way: `/Repo` and `/repo` really are two directories,
  // and ignoring case would hand back a relative path that is simply wrong. Hence
  // the test is on the shape of the path rather than applied uniformly.
  const fold = (value: string): string => (isWindowsPath(absolute) ? value.toLowerCase() : value);
  if (!fold(absolute).startsWith(fold(root))) return undefined;

  // 必须在边界上是分隔符：否则 `/repo/src` 会被当成住在 `/repo/s` 下面 ——
  // 共同前缀冒充了包含关系。
  //
  // The boundary must land on a separator, otherwise `/repo/src` reads as living
  // under `/repo/s`: a shared prefix masquerading as containment.
  const rest = absolute.slice(root.length);
  if (!/^[\\/]/.test(rest)) return undefined;

  return rest.replace(/^[\\/]+/, '') || undefined;
};

/**
 * 解析一个预览 tab 可复制的绝对/相对地址，供 tab 右键菜单使用。
 * Resolve the absolute/relative addresses a preview tab can copy, for the tab
 * context menu.
 */
export const previewTabPaths = (tab: PreviewTabPathSource): PreviewTabPaths => {
  // 浏览器 tab 指向的是 URL 而非文件：URL 是唯一值得复制的东西，
  // 「相对于 workspace」对它没有意义。
  //
  // A browser tab addresses a URL rather than a file: the URL is the only thing
  // worth copying, and "relative to the workspace" means nothing for it.
  if (tab.content_type === 'browser') {
    const url = tab.content?.trim();
    return url ? { absolute: { kind: 'url', value: url } } : {};
  }

  const ref = tab.metadata?.fileRef;
  const filePath = tab.metadata?.file_path?.trim() || undefined;
  const workspace = tab.metadata?.workspace;

  // project ref 的身份本来就是 workspace 相对路径，直接用，不必从绝对路径反推。
  // 绝对路径则交给后端：这类 tab（Explorer 打开的文件）在前端根本没有绝对路径，
  // 早先按「没有就置灰」处理，结果是最常见的一类 tab 复制路径永远不可点。
  //
  // A project ref's identity already is the workspace-relative path — use it
  // directly instead of deriving it back out of an absolute path. The absolute
  // path is delegated to the backend: these tabs (files opened from the Explorer)
  // simply have no absolute path in the front end, and treating "absent" as
  // "nothing to copy" left copy-path permanently disabled for the commonest tab
  // of all.
  if (ref?.kind === 'project') {
    return {
      absolute: filePath
        ? { kind: 'filePath', value: filePath }
        : { kind: 'projectRef', pe_id: ref.pe_id, relative_path: ref.relative_path },
      relative: ref.relative_path?.trim() || undefined,
    };
  }

  // upload / local ref 携带的就是后端主机上的绝对路径；file_path 是尚未迁移到
  // fileRef 的旧查看器留下的回退。
  //
  // upload / local refs carry an absolute path on the backend host; file_path is
  // the fallback left by viewers not yet migrated to fileRef.
  const absolute = (ref?.kind === 'upload' || ref?.kind === 'local' ? ref.path?.trim() : undefined) || filePath;
  if (!absolute) return {};

  return { absolute: { kind: 'filePath', value: absolute }, relative: toWorkspaceRelative(absolute, workspace) };
};

/**
 * 「复制路径」这一项在当前运行环境下是否可用。
 *
 * 只有 `projectRef` 那条路受环境限制：它靠后端解析出宿主机的设备路径并写剪贴板，
 * 远程 WebUI 不该拿到那种路径，所以非桌面端置灰。渲染进程自己就有字符串的
 * `text` 那条路（含浏览器 tab 的 URL）在哪儿都能复制。
 *
 * Whether the copy-path entry is available in the current runtime.
 *
 * Only the `projectRef` route is environment-bound: it has the backend resolve a
 * device path on the host machine and write the clipboard, and a remote WebUI must
 * not be handed such a path — so it greys out off the desktop. The `text` route,
 * where the renderer already holds the string (including a browser tab's URL),
 * copies anywhere.
 */
export const canCopyAbsolutePath = (absolute: PreviewTabAbsolutePath | undefined, isDesktop: boolean): boolean => {
  if (!absolute) return false;
  return absolute.kind !== 'projectRef' || isDesktop;
};

/**
 * 「打开文件所在目录」这一项在当前运行环境下是否可用。
 *
 * 一律要求 Electron 桌面端：这个动作打开的是**后端主机**的文件管理器，从远程
 * WebUI 触发只会在别人机器上弹出窗口。浏览器 tab 也不适用 —— URL 没有所在目录。
 *
 * Whether the show-in-folder entry is available in the current runtime.
 *
 * Always requires the Electron desktop: the action opens a file manager on the
 * BACKEND host, so triggering it from a remote WebUI would pop a window open on
 * someone else's machine. Browser tabs are excluded too — a URL has no
 * containing folder.
 */
export const canRevealInFolder = (absolute: PreviewTabAbsolutePath | undefined, isDesktop: boolean): boolean => {
  if (!absolute || !isDesktop) return false;
  return absolute.kind !== 'url';
};
