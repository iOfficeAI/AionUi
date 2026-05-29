type TaskboxRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

type NotchTaskboxStatus = {
  enabled: boolean;
  open: boolean;
  hardwareNotch: boolean;
};

type NotchTaskboxBridgeEvent = {
  name: string;
  data: unknown;
};

type TaskStatus = 'Idle' | 'Working' | 'Waiting' | 'Done' | 'Error';

type TaskSummary = {
  id: string;
  title: string;
  status: TaskStatus;
  lastText: string;
  updatedAt: number;
  pendingPermissionIds: Set<string>;
};

type PermissionSummary = {
  id: string;
  conversationId: string;
  callId: string;
  messageId: string;
  title: string;
  description: string;
  options: Array<{ label: string; value: unknown }>;
};

declare global {
  interface Window {
    aionuiTaskbox: {
      request: (path: string, options?: TaskboxRequestOptions) => Promise<unknown>;
      setExpanded: (expanded: boolean) => Promise<void>;
      openMainWindow: () => Promise<void>;
      onBridgeEvent: (callback: (event: NotchTaskboxBridgeEvent) => void) => () => void;
      onExpandedChange: (callback: (expanded: boolean) => void) => () => void;
      onStatus: (callback: (status: NotchTaskboxStatus) => void) => () => void;
    };
  }
}

const shell = document.getElementById('shell') as HTMLDivElement;
const surface = document.getElementById('surface') as HTMLDivElement;
const compactMain = document.getElementById('compact-main') as HTMLDivElement;
const statusDot = document.getElementById('status-dot') as HTMLSpanElement;
const compactLabel = document.getElementById('compact-label') as HTMLSpanElement;
const compactMeta = document.getElementById('compact-meta') as HTMLSpanElement;
const content = document.getElementById('content') as HTMLDivElement;
const detail = document.getElementById('detail') as HTMLDivElement;
const reply = document.getElementById('reply') as HTMLTextAreaElement;
const send = document.getElementById('send') as HTMLButtonElement;

const tasks = new Map<string, TaskSummary>();
const permissions = new Map<string, PermissionSummary>();
let activeTaskId: string | null = null;
let expanded = false;
let collapseTimer: ReturnType<typeof setTimeout> | null = null;

const copy = getCopy();

surface.addEventListener('mouseenter', () => {
  setExpanded(true);
});
surface.addEventListener('mouseleave', () => {
  scheduleCollapse();
});
reply.addEventListener('focus', () => {
  setExpanded(true);
});
reply.addEventListener('input', () => {
  resizeReply();
  renderComposerState();
});
reply.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    void sendReply();
  }
});
send.addEventListener('click', () => {
  void sendReply();
});

window.aionuiTaskbox.onExpandedChange((nextExpanded) => {
  expanded = nextExpanded;
  shell.classList.toggle('expanded', expanded);
  if (expanded) {
    render();
  }
});

window.aionuiTaskbox.onStatus((status) => {
  shell.classList.toggle('hardware-notch', status.hardwareNotch);
});

window.aionuiTaskbox.onBridgeEvent((event) => {
  handleBridgeEvent(event);
});

render();

function getCopy(): Record<string, string> {
  const isZh = navigator.language.toLowerCase().startsWith('zh');
  return isZh
    ? {
        idle: '等待 AI 任务',
        active: '正在处理',
        waiting: '等待授权',
        done: '已完成',
        error: '出现错误',
        tasks: '任务',
        permissions: '授权请求',
        noTasks: '暂无活动任务',
        latest: '上一条内容',
        noContent: '还没有可展示的内容',
        placeholder: '回复当前任务...',
        noActivePlaceholder: '选择一个任务后回复',
        openMain: '打开主窗口',
      }
    : {
        idle: 'Waiting for AI tasks',
        active: 'Working',
        waiting: 'Waiting for approval',
        done: 'Done',
        error: 'Error',
        tasks: 'Tasks',
        permissions: 'Authorizations',
        noTasks: 'No active tasks',
        latest: 'Latest content',
        noContent: 'No content yet',
        placeholder: 'Reply to current task...',
        noActivePlaceholder: 'Select a task to reply',
        openMain: 'Open main window',
      };
}

function handleBridgeEvent(event: NotchTaskboxBridgeEvent): void {
  switch (event.name) {
    case 'message.stream':
    case 'chat.response.stream':
    case 'openclaw.response.stream':
      handleMessageStream(event.data);
      break;
    case 'confirmation.add':
    case 'confirmation.update':
      handleConfirmation(event.data);
      break;
    case 'confirmation.remove':
      handleConfirmationRemove(event.data);
      break;
    case 'turn.completed':
    case 'conversation.turn.completed':
      handleTurnCompleted(event.data);
      break;
  }
}

function handleMessageStream(data: unknown): void {
  const record = asRecord(data);
  const conversationId = asString(record?.['conversation_id']);
  if (!conversationId) return;

  const task = getTask(conversationId);
  task.updatedAt = Date.now();
  const messageType = asString(record?.['type']);
  const text = extractStreamText(record);

  if (messageType === 'error') {
    task.status = 'Error';
  } else if (messageType === 'finish') {
    task.status = 'Done';
  } else if (messageType === 'thinking' || messageType === 'thought') {
    task.status = 'Working';
  } else if (text) {
    task.status = 'Working';
    task.lastText = record?.['replace'] === true ? text : `${task.lastText}${text}`.slice(-1200);
  }

  activeTaskId = conversationId;
  render();
}

function handleConfirmation(data: unknown): void {
  const record = asRecord(data);
  const id = asString(record?.['id']);
  const conversationId = asString(record?.['conversation_id']);
  const callId = asString(record?.['call_id']);
  if (!id || !conversationId || !callId) return;

  const permission = normalizePermission(record, id, conversationId, callId);
  permissions.set(id, permission);

  const task = getTask(conversationId);
  task.status = 'Waiting';
  task.updatedAt = Date.now();
  task.pendingPermissionIds.add(id);
  activeTaskId = conversationId;
  render();
}

function handleConfirmationRemove(data: unknown): void {
  const record = asRecord(data);
  const id = asString(record?.['id']);
  if (!id) return;

  const permission = permissions.get(id);
  permissions.delete(id);
  if (permission) {
    const task = tasks.get(permission.conversationId);
    task?.pendingPermissionIds.delete(id);
    if (task && task.pendingPermissionIds.size === 0 && task.status === 'Waiting') {
      task.status = 'Working';
    }
  }
  render();
}

function handleTurnCompleted(data: unknown): void {
  const record = asRecord(data);
  const conversationId = asString(record?.['conversation_id']);
  if (!conversationId) return;
  const task = getTask(conversationId);
  task.status = task.pendingPermissionIds.size > 0 ? 'Waiting' : 'Done';
  task.updatedAt = Date.now();
  render();
}

function getTask(conversationId: string): TaskSummary {
  const existing = tasks.get(conversationId);
  if (existing) return existing;

  const task: TaskSummary = {
    id: conversationId,
    title: shortConversationId(conversationId),
    status: 'Idle',
    lastText: '',
    updatedAt: Date.now(),
    pendingPermissionIds: new Set<string>(),
  };
  tasks.set(conversationId, task);
  void hydrateTaskTitle(task);
  return task;
}

async function hydrateTaskTitle(task: TaskSummary): Promise<void> {
  try {
    const data = await window.aionuiTaskbox.request(`/api/conversations/${encodeURIComponent(task.id)}`);
    const record = asRecord(data);
    const name = asString(record?.['name']) || asString(record?.['title']);
    if (name) {
      task.title = name;
      render();
    }
  } catch {
    // Keep the short conversation id fallback.
  }
}

function normalizePermission(
  record: Record<string, unknown>,
  id: string,
  conversationId: string,
  callId: string
): PermissionSummary {
  const rawOptions = Array.isArray(record['options']) ? record['options'] : [];
  return {
    id,
    conversationId,
    callId,
    messageId: asString(record['msg_id']) || id,
    title: asString(record['title']) || asString(record['action']) || copy.waiting,
    description: asString(record['description']) || '',
    options: rawOptions.map((item, index) => {
      const option = asRecord(item);
      return {
        label: asString(option?.['label']) || `#${index + 1}`,
        value: option?.['value'],
      };
    }),
  };
}

function extractStreamText(record: Record<string, unknown> | null): string {
  if (!record) return '';
  const data = record['data'];
  if (typeof data === 'string') return data;
  const dataRecord = asRecord(data);
  return (
    asString(dataRecord?.['content']) ||
    asString(dataRecord?.['text']) ||
    asString(dataRecord?.['delta']) ||
    asString(record['content']) ||
    ''
  );
}

function render(): void {
  const sortedTasks = [...tasks.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  if (!activeTaskId && sortedTasks[0]) {
    activeTaskId = sortedTasks[0].id;
  }
  const activeTask = activeTaskId ? tasks.get(activeTaskId) : sortedTasks[0];
  renderCompact(activeTask);
  renderContent(sortedTasks);
  renderDetail(activeTask);
  renderComposerState();
}

function renderCompact(activeTask: TaskSummary | undefined): void {
  const pendingCount = permissions.size;
  const status = pendingCount > 0 ? 'Waiting' : (activeTask?.status ?? 'Idle');
  statusDot.className = `dot ${status}`;
  compactMain.classList.toggle('request', pendingCount > 0);
  compactLabel.textContent = getStatusLabel(status, pendingCount, activeTask);
  compactMeta.textContent = activeTask?.lastText ? activeTask.lastText : pendingCount > 0 ? copy.waiting : '';
}

function renderContent(sortedTasks: TaskSummary[]): void {
  const permissionCards = [...permissions.values()]
    .map(
      (permission) => `
        <div class="card" data-permission-id="${escapeAttr(permission.id)}">
          <div class="permission-title"><span class="dot Waiting"></span><span>${escapeHtml(permission.title)}</span></div>
          <div class="permission-body">${escapeHtml(permission.description || copy.waiting)}</div>
          <div class="actions">
            ${permission.options
              .map(
                (option, index) =>
                  `<button class="action" data-action="confirm" data-permission-id="${escapeAttr(permission.id)}" data-option-index="${index}" type="button">${escapeHtml(option.label)}</button>`
              )
              .join('')}
            <button class="action" data-action="open-main" type="button">${escapeHtml(copy.openMain)}</button>
          </div>
        </div>`
    )
    .join('');

  const taskRows = sortedTasks
    .map(
      (task) => `
        <button class="row ${task.id === activeTaskId ? 'selected' : ''}" data-task-id="${escapeAttr(task.id)}" type="button">
          <span class="dot ${task.status}"></span>
          <span class="title">
            <span class="primary">${escapeHtml(task.title)}</span>
            <span class="secondary">${escapeHtml(task.lastText || getStatusLabel(task.status, 0, task))}</span>
          </span>
          <span class="progress">${task.pendingPermissionIds.size > 0 ? task.pendingPermissionIds.size : ''}</span>
        </button>`
    )
    .join('');

  content.innerHTML = `
    ${permissions.size > 0 ? `<div class="section-title">${escapeHtml(copy.permissions)}</div>${permissionCards}` : ''}
    <div class="section-title">${escapeHtml(copy.tasks)}</div>
    ${taskRows || `<div class="empty">${escapeHtml(copy.noTasks)}</div>`}
  `;

  content.querySelectorAll<HTMLButtonElement>('[data-task-id]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTaskId = button.dataset['taskId'] || null;
      render();
    });
  });
  content.querySelectorAll<HTMLButtonElement>('[data-action="open-main"]').forEach((button) => {
    button.addEventListener('click', () => {
      void window.aionuiTaskbox.openMainWindow();
    });
  });
  content.querySelectorAll<HTMLButtonElement>('[data-action="confirm"]').forEach((button) => {
    button.addEventListener('click', () => {
      void confirmPermission(button.dataset['permissionId'] || '', Number(button.dataset['optionIndex'] || '0'));
    });
  });
}

function renderDetail(activeTask: TaskSummary | undefined): void {
  detail.innerHTML = `
    <div class="detail-title">${escapeHtml(copy.latest)}</div>
    <div class="detail-body">${escapeHtml(activeTask?.lastText || copy.noContent)}</div>
  `;
}

function renderComposerState(): void {
  const activeTask = activeTaskId ? tasks.get(activeTaskId) : null;
  reply.placeholder = activeTask ? copy.placeholder : copy.noActivePlaceholder;
  send.disabled = !activeTask || reply.value.trim().length === 0;
}

async function confirmPermission(permissionId: string, optionIndex: number): Promise<void> {
  const permission = permissions.get(permissionId);
  const option = permission?.options[optionIndex];
  if (!permission || !option) return;

  await window.aionuiTaskbox.request(
    `/api/conversations/${encodeURIComponent(permission.conversationId)}/confirmations/${encodeURIComponent(permission.callId)}/confirm`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg_id: permission.messageId, data: option.value }),
    }
  );
}

async function sendReply(): Promise<void> {
  const input = reply.value.trim();
  const activeTask = activeTaskId ? tasks.get(activeTaskId) : null;
  if (!input || !activeTask) return;

  reply.value = '';
  resizeReply();
  renderComposerState();
  await window.aionuiTaskbox.request(`/api/conversations/${encodeURIComponent(activeTask.id)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: input, loading_id: `notch-${Date.now()}` }),
  });
}

function getStatusLabel(status: TaskStatus, pendingCount: number, activeTask: TaskSummary | undefined): string {
  if (pendingCount > 0) return `${copy.waiting} · ${pendingCount}`;
  if (!activeTask) return copy.idle;
  switch (status) {
    case 'Working':
      return copy.active;
    case 'Waiting':
      return copy.waiting;
    case 'Done':
      return copy.done;
    case 'Error':
      return copy.error;
    default:
      return copy.idle;
  }
}

function setExpanded(nextExpanded: boolean): void {
  if (collapseTimer) {
    clearTimeout(collapseTimer);
    collapseTimer = null;
  }
  if (expanded === nextExpanded) return;
  expanded = nextExpanded;
  shell.classList.toggle('expanded', expanded);
  void window.aionuiTaskbox.setExpanded(nextExpanded);
}

function scheduleCollapse(): void {
  if (reply === document.activeElement) return;
  if (collapseTimer) clearTimeout(collapseTimer);
  collapseTimer = setTimeout(() => {
    setExpanded(false);
  }, 260);
}

function resizeReply(): void {
  reply.style.height = '0px';
  reply.style.height = `${Math.min(reply.scrollHeight, 88)}px`;
}

function shortConversationId(id: string): string {
  return id.length <= 12 ? id : `${id.slice(0, 6)}...${id.slice(-4)}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

export {};
