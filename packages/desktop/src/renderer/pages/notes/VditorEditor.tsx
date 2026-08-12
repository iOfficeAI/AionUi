/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import Vditor from 'vditor';
import 'vditor/dist/index.css';
import React, { useEffect, useId, useRef } from 'react';
import { getBaseUrl } from '@/common/adapter/httpBridge';
import { ipcBridge } from '@/common';

type VditorTheme = 'light' | 'dark';

interface VditorEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: (value: string) => void;
  onLeaveFirstLine?: (content: string) => void;
  theme: VditorTheme;
  placeholder?: string;
}

const TOOLBAR: Array<string | IMenuItem> = [
  'emoji',
  'headings',
  'bold',
  'italic',
  'strike',
  '|',
  'line',
  'quote',
  'list',
  'ordered-list',
  'check',
  'indent',
  'outdent',
  '|',
  'code',
  'inline-code',
  'insert-after',
  'insert-before',
  '|',
  'link',
  'upload',
  'table',
  '|',
  'undo',
  'redo',
  '|',
  'fullscreen',
  'edit-mode',
  {
    name: 'more',
    icon: '···',
    tip: '更多',
    toolbar: ['both', 'code-theme', 'content-theme', 'export', 'outline', 'preview', 'devtools', 'help'],
  },
];

const VditorEditor: React.FC<VditorEditorProps> = ({
  value,
  onChange,
  onBlur,
  onLeaveFirstLine,
  theme,
  placeholder,
}) => {
  const rawId = useId();
  const containerId = `vditor-${rawId.replace(/:/g, '')}`;
  const vditorRef = useRef<Vditor | null>(null);
  // `new Vditor()` returns synchronously but vditor.lute is set only after the
  // async lute.min.js script load — getValue()/setValue() throw until then.
  const readyRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onBlurRef = useRef(onBlur);
  onBlurRef.current = onBlur;
  const onLeaveFirstLineRef = useRef(onLeaveFirstLine);
  onLeaveFirstLineRef.current = onLeaveFirstLine;
  // Track whether the cursor was previously inside the first block so
  // we only fire onLeaveFirstLine on the *transition* out, not on every
  // selection change while already outside.
  const wasInFirstBlockRef = useRef(false);
  const leaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Capture the latest `value` so the `after` callback (set once at mount) can
  // sync whatever the prop has become by the time lute finishes loading.
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const vditor = new Vditor(containerId, {
      value,
      mode: 'wysiwyg',
      lang: 'zh_CN',
      theme: theme === 'dark' ? 'dark' : 'classic',
      placeholder: placeholder ?? '',
      height: '100%',
      toolbar: TOOLBAR,
      cache: { enable: false },
      cdn: './vditor',
      // Vditor calls `options.customWysiwygToolbar(type, popover)` whenever
      // the user interacts with a wysiwyg block (footnote, blockquote, table,
      // heading, etc.). The option is typed as optional, but Vditor 3.11.x
      // invokes it unconditionally without a null check, throwing on the
      // first interaction. A no-op preserves the default empty popover and
      // unblocks the input event chain.
      customWysiwygToolbar: () => {},
      after: () => {
        readyRef.current = true;
        // The value effect below already runs on prop changes, but if the prop
        // change arrived BEFORE lute finished loading, that effect saw
        // readyRef=false and skipped. Catch up here.
        if (vditor.vditor && vditor.getValue() !== valueRef.current) {
          vditor.setValue(valueRef.current);
        }
      },
      upload: {
        url: `${getBaseUrl()}/api/fs/upload`,
        fieldName: 'file',
        accept: 'image/*',
        success: async (_editorElement: HTMLElement, responseText: string) => {
          try {
            const response = JSON.parse(responseText) as {
              success: boolean;
              data?: string;
            };
            if (!response.success || !response.data) return;
            const base64Url = await ipcBridge.fs.getImageBase64.invoke({
              path: response.data,
            });
            if (!base64Url) return;
            const fileName = response.data.split(/[\\/]/).pop() || 'image';
            vditorRef.current?.insertValue(`![${fileName}](${base64Url})`);
          } catch (error) {
            console.error('[Vditor] Upload error:', error);
          }
        },
      },
      input: (newValue: string) => {
        onChangeRef.current(newValue);
      },
      blur: (newValue: string) => {
        // Vditor invokes `blur` with the current Markdown, not the
        // wysiwyg HTML — the hook works off the HTML it already cached
        // in `valueRef`, but we forward the latest content so callers
        // get a fresh read anyway.
        onBlurRef.current?.(valueRef.current || newValue);
      },
    });
    vditorRef.current = vditor;

    return () => {
      // Flush the title commit before destroying so switching notes or
      // closing the panel doesn't lose the last edit.
      onBlurRef.current?.(valueRef.current);
      if (vditor.vditor) {
        vditor.destroy();
      }
      vditorRef.current = null;
      readyRef.current = false;
      if (leaveDebounceRef.current) {
        clearTimeout(leaveDebounceRef.current);
        leaveDebounceRef.current = null;
      }
    };
  }, []);

  // Listen for cursor leaving the first line via native selectionchange.
  // Vditor's built-in `select` callback only fires when the user has
  // actually selected text (selectText.trim() !== ''), so clicking to
  // move the caret or using arrow keys never triggers it.
  useEffect(() => {
    const handler = () => {
      const editorEl = document.getElementById(containerId);
      if (!editorEl) return;
      const firstBlock = editorEl.querySelector<HTMLElement>('.vditor-reset > :first-child');
      if (!firstBlock) return;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      const isInFirst = firstBlock.contains(range.startContainer);

      if (wasInFirstBlockRef.current && !isInFirst) {
        // Grab the current Markdown straight from Vditor so the title
        // sync doesn't depend on the debounced `input` callback having
        // already written the latest content to lastContentRef.
        let currentContent = '';
        if (readyRef.current) {
          try {
            currentContent = vditorRef.current?.getValue() ?? '';
          } catch {
            // getValue() throws before lute finishes loading — safe to ignore.
          }
        }
        if (leaveDebounceRef.current) clearTimeout(leaveDebounceRef.current);
        leaveDebounceRef.current = setTimeout(() => {
          onLeaveFirstLineRef.current?.(currentContent);
        }, 200);
      }
      wasInFirstBlockRef.current = isInFirst;
    };

    document.addEventListener('selectionchange', handler);
    return () => {
      document.removeEventListener('selectionchange', handler);
      if (leaveDebounceRef.current) {
        clearTimeout(leaveDebounceRef.current);
        leaveDebounceRef.current = null;
      }
    };
  }, [containerId]);

  useEffect(() => {
    const vditor = vditorRef.current;
    if (readyRef.current && vditor?.vditor && vditor.getValue() !== value) {
      vditor.setValue(value);
    }
  }, [value]);

  useEffect(() => {
    const vditor = vditorRef.current;
    if (vditor?.vditor) {
      vditor.setTheme(theme === 'dark' ? 'dark' : 'classic');
    }
  }, [theme]);

  return <div id={containerId} className='h-full w-full' />;
};

export default VditorEditor;
