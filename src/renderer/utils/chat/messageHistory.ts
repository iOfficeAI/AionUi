import type { TMessage } from '@/common/chat/chatLib';

export function getConversationInputHistory(messages: TMessage[], conversationId?: string): string[] {
  if (!conversationId) {
    return [];
  }

  const history: string[] = [];
  const seen = new Set<string>();

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message.conversation_id !== conversationId ||
      message.type !== 'text' ||
      message.position !== 'right' ||
      !message.content.content.trim()
    ) {
      continue;
    }

    const content = message.content.content;
    if (seen.has(content)) {
      continue;
    }

    seen.add(content);
    history.push(content);
  }

  return history;
}

const CARET_MIRROR_STYLE_PROPERTIES = [
  'boxSizing',
  'width',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'whiteSpace',
  'wordBreak',
  'overflowWrap',
  'tabSize',
] as const;

function getLineHeightPx(style: CSSStyleDeclaration): number {
  const parsed = Number.parseFloat(style.lineHeight);
  if (Number.isFinite(parsed)) return parsed;
  const fontSize = Number.parseFloat(style.fontSize);
  return Number.isFinite(fontSize) ? fontSize * 1.4 : 20;
}

export function isCaretOnFirstLine(textarea: HTMLTextAreaElement): boolean {
  const selectionStart = textarea.selectionStart ?? 0;
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return !textarea.value.slice(0, selectionStart).includes('\n');
  }

  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const caret = document.createElement('span');

  CARET_MIRROR_STYLE_PROPERTIES.forEach((property) => {
    mirror.style[property] = style[property];
  });

  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.left = '-9999px';
  mirror.style.top = '0';
  mirror.style.height = 'auto';
  mirror.style.minHeight = '0';
  mirror.style.overflow = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.textContent = textarea.value.slice(0, selectionStart);
  caret.textContent = '\u200b';
  mirror.appendChild(caret);
  document.body.appendChild(mirror);

  const caretTop = caret.offsetTop;
  const lineHeight = getLineHeightPx(style);
  mirror.remove();

  return caretTop < lineHeight * 0.75;
}

export function isCaretAtLineStart(textarea: HTMLTextAreaElement): boolean {
  const pos = textarea.selectionStart ?? 0;
  if (pos === 0) return true;
  const textBefore = textarea.value.slice(0, pos);
  return textBefore.endsWith('\n');
}

export function isCaretOnLastLine(textarea: HTMLTextAreaElement): boolean {
  const selectionEnd = textarea.selectionEnd ?? textarea.value.length;
  return !textarea.value.slice(selectionEnd).includes('\n');
}
