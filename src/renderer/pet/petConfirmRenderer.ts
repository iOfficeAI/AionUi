/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

interface IConfirmation<Option = any> {
  title?: string;
  id: string;
  action?: string;
  description: string;
  callId: string;
  options: Array<{
    label: string;
    value: Option;
    params?: Record<string, string>;
  }>;
  commandType?: string;
  conversation_id: string;
}

const titleEl = document.getElementById('title')!;
const descriptionEl = document.getElementById('description')!;
const optionsEl = document.getElementById('options')!;

let currentConfirmation: IConfirmation | null = null;
let msgId = '';

/**
 * Render confirmation UI.
 */
function renderConfirmation(confirmation: IConfirmation): void {
  currentConfirmation = confirmation;
  msgId = confirmation.id;

  // Render title
  if (confirmation.title) {
    titleEl.textContent = confirmation.title;
    titleEl.style.display = 'block';
  } else {
    titleEl.style.display = 'none';
  }

  // Render description
  descriptionEl.textContent = confirmation.description;

  // Render options — shortcut badge before label (matches ConversationChatConfirm style)
  optionsEl.innerHTML = '';
  confirmation.options.forEach((option, index) => {
    const btn = document.createElement('div');
    btn.className = 'option-btn';

    // Determine shortcut hint using option.value (stable across locales)
    let shortcut = '';
    if (index === 0) {
      shortcut = 'Enter';
    } else if (option.value === 'cancel' || option.value === 'deny') {
      shortcut = 'Esc';
    } else if (option.value === 'proceed_always') {
      shortcut = 'A';
    } else if (option.value === 'proceed_once') {
      shortcut = 'Y';
    } else {
      shortcut = String(index + 1);
    }

    const shortcutSpan = document.createElement('span');
    shortcutSpan.className = 'shortcut';
    shortcutSpan.textContent = shortcut;

    const labelSpan = document.createElement('span');
    labelSpan.textContent = option.label;

    btn.appendChild(shortcutSpan);
    btn.appendChild(labelSpan);

    btn.addEventListener('click', () => {
      respond(option.value);
    });

    optionsEl.appendChild(btn);
  });
}

/**
 * Send response to main process.
 */
function respond(value: any): void {
  if (!currentConfirmation) return;

  window.petConfirmAPI.respond({
    conversation_id: currentConfirmation.conversation_id,
    msg_id: msgId,
    callId: currentConfirmation.callId,
    data: value,
  });

  currentConfirmation = null;
}

/**
 * Handle keyboard shortcuts.
 */
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (!currentConfirmation) return;

  // Enter: first option
  if (e.key === 'Enter') {
    e.preventDefault();
    if (currentConfirmation.options.length > 0) {
      respond(currentConfirmation.options[0].value);
    }
    return;
  }

  // Escape: find cancel option
  if (e.key === 'Escape') {
    e.preventDefault();
    const cancelOption = currentConfirmation.options.find((opt) => opt.value === 'cancel' || opt.value === 'deny');
    if (cancelOption) {
      respond(cancelOption.value);
    }
    return;
  }

  // A: always allow
  if (e.key === 'a' || e.key === 'A') {
    e.preventDefault();
    const alwaysOption = currentConfirmation.options.find((opt) => opt.value === 'proceed_always');
    if (alwaysOption) {
      respond(alwaysOption.value);
    }
    return;
  }

  // Y: allow once
  if (e.key === 'y' || e.key === 'Y') {
    e.preventDefault();
    const yesOption = currentConfirmation.options.find((opt) => opt.value === 'proceed_once');
    if (yesOption) {
      respond(yesOption.value);
    }
    return;
  }

  // N: no/deny
  if (e.key === 'n' || e.key === 'N') {
    e.preventDefault();
    const noOption = currentConfirmation.options.find((opt) => opt.value === 'cancel' || opt.value === 'deny');
    if (noOption) {
      respond(noOption.value);
    }
    return;
  }
});

// Listen for theme changes from main process
window.petConfirmAPI.onThemeChange((theme: string) => {
  document.documentElement.setAttribute('data-theme', theme);
});

// Listen for confirmation events
window.petConfirmAPI.onConfirmationAdd((data: IConfirmation) => {
  renderConfirmation(data);
});

window.petConfirmAPI.onConfirmationUpdate((data: IConfirmation) => {
  renderConfirmation(data);
});

window.petConfirmAPI.onConfirmationRemove((data: { conversation_id: string; id: string }) => {
  if (currentConfirmation && currentConfirmation.id === data.id) {
    currentConfirmation = null;
  }
});

// Drag support via the grip handle
const dragHandle = document.getElementById('drag-handle')!;
let confirmDragging = false;

dragHandle.addEventListener('mousedown', (e: MouseEvent) => {
  if (e.button !== 0) return;
  confirmDragging = true;
  window.petConfirmAPI.dragStart();
});

document.addEventListener('mouseup', () => {
  if (confirmDragging) {
    confirmDragging = false;
    window.petConfirmAPI.dragEnd();
  }
});
