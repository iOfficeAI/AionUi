(() => {
  const PAGE_SIZE = 20;
  const pending = new Map();
  const categoryValues = ['all', 'gemini', 'acp', 'codex', 'openclaw-gateway', 'nanobot', 'remote', 'aionrs'];

  const defaultTranslations = {
    page: {
      eyebrow: 'Conversation Control',
      title: 'Session Management',
      description: 'Search and manage conversations by category, workspace path, and title.',
    },
    filters: {
      category: 'Category',
      workspaceKeyword: 'Workspace keyword',
      workspacePlaceholder: 'Search workspace path',
      keyword: 'Session keyword',
      keywordPlaceholder: 'Search conversation title',
      search: 'Search',
      reset: 'Reset',
    },
    categories: {
      all: 'All',
      gemini: 'Gemini',
      acp: 'ACP',
      codex: 'Codex',
      'openclaw-gateway': 'OpenClaw Gateway',
      nanobot: 'Nanobot',
      remote: 'Remote',
      aionrs: 'AionRS',
    },
    selection: {
      selectAll: 'Select All',
      clear: 'Clear Selection',
      selectedCount: 'Selected {count}',
      pageScoped: 'Current-page selection only.',
    },
    actions: {
      deleteSelected: 'Delete Selected',
      delete: 'Delete',
      open: 'Open',
      previous: 'Previous',
      next: 'Next',
      page: 'Page {current} of {total}',
    },
    list: {
      empty: 'No sessions found',
    },
    fields: {
      workspace: 'Workspace',
      updatedAt: 'Updated',
      category: 'Category',
    },
    messages: {
      waitingForBridge: 'Waiting for host bridge...',
      loading: 'Loading sessions...',
      ready: 'Session management is ready.',
      searchLoaded: '{count} sessions available.',
      searchFailed: 'Failed to load sessions.',
      noSelection: 'No sessions selected.',
      deleteSuccess: 'Deleted {count} session(s).',
      deletePartialSuccess: 'Deleted {count} session(s).',
      deleteFailed: 'Failed to delete sessions.',
      openFailed: 'Failed to open the selected session.',
    },
    confirm: {
      delete: 'Delete {count} selected session(s)?',
    },
  };

  const state = {
    locale: 'en-US',
    translations: defaultTranslations,
    filters: {
      category: 'all',
      workspaceKeyword: '',
      keyword: '',
    },
    page: 0,
    total: 0,
    hasMore: false,
    items: [],
    loading: false,
    selectedIds: new Set(),
  };

  const elements = {
    status: document.getElementById('status'),
    category: document.getElementById('category'),
    workspaceKeyword: document.getElementById('workspace-keyword'),
    keyword: document.getElementById('keyword'),
    searchButton: document.getElementById('search-button'),
    resetButton: document.getElementById('reset-button'),
    toggleSelection: document.getElementById('toggle-selection'),
    selectionCount: document.getElementById('selection-count'),
    pageScope: document.getElementById('page-scope'),
    deleteSelected: document.getElementById('delete-selected'),
    results: document.getElementById('results'),
    pagination: document.getElementById('pagination'),
  };

  const deepMerge = (base, override) => {
    const result = { ...base };
    for (const [key, value] of Object.entries(override || {})) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        result[key] &&
        typeof result[key] === 'object' &&
        !Array.isArray(result[key])
      ) {
        result[key] = deepMerge(result[key], value);
      } else {
        result[key] = value;
      }
    }
    return result;
  };

  const deepGet = (source, key) => {
    return key.split('.').reduce((current, part) => {
      if (!current || typeof current !== 'object') {
        return undefined;
      }
      return current[part];
    }, source);
  };

  const t = (key, params) => {
    const template = deepGet(state.translations, key);
    const text = typeof template === 'string' ? template : key;
    return text.replace(/\{(\w+)\}/g, (_, name) =>
      String(params && Object.prototype.hasOwnProperty.call(params, name) ? params[name] : `{${name}}`)
    );
  };

  const setStatus = (key, tone, params) => {
    if (!elements.status) {
      return;
    }

    elements.status.textContent = t(key, params);
    elements.status.className = 'status';
    if (tone) {
      elements.status.classList.add(tone);
    }
  };

  const readFiltersFromInputs = () => {
    state.filters = {
      category: elements.category && elements.category.value ? elements.category.value : 'all',
      workspaceKeyword:
        elements.workspaceKeyword && typeof elements.workspaceKeyword.value === 'string'
          ? elements.workspaceKeyword.value
          : '',
      keyword: elements.keyword && typeof elements.keyword.value === 'string' ? elements.keyword.value : '',
    };
  };

  const syncInputs = () => {
    if (elements.category) {
      elements.category.value = state.filters.category;
    }
    if (elements.workspaceKeyword) {
      elements.workspaceKeyword.value = state.filters.workspaceKeyword;
    }
    if (elements.keyword) {
      elements.keyword.value = state.filters.keyword;
    }
  };

  const formatTimestamp = (value) => {
    if (!value) {
      return '';
    }

    return new Intl.DateTimeFormat(state.locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(value);
  };

  const getCategoryLabel = (value) => t(`categories.${value}`) || value;

  const renderCategoryOptions = () => {
    if (!elements.category) {
      return;
    }

    elements.category.innerHTML = '';
    categoryValues.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = getCategoryLabel(value);
      elements.category.append(option);
    });
    elements.category.value = state.filters.category;
  };

  const renderTranslations = () => {
    document.title = t('page.title');

    document.querySelectorAll('[data-i18n]').forEach((node) => {
      const key = node.getAttribute('data-i18n');
      if (!key) {
        return;
      }
      node.textContent = t(key);
    });

    if (elements.workspaceKeyword) {
      elements.workspaceKeyword.placeholder = t('filters.workspacePlaceholder');
    }
    if (elements.keyword) {
      elements.keyword.placeholder = t('filters.keywordPlaceholder');
    }

    renderCategoryOptions();
    renderToolbar();
    renderPagination();
  };

  const renderToolbar = () => {
    const allSelected = state.items.length > 0 && state.items.every((item) => state.selectedIds.has(item.id));
    const selectedCount = state.selectedIds.size;

    if (elements.toggleSelection) {
      elements.toggleSelection.textContent = allSelected ? t('selection.clear') : t('selection.selectAll');
      elements.toggleSelection.disabled = state.items.length === 0;
    }

    if (elements.selectionCount) {
      elements.selectionCount.textContent = t('selection.selectedCount', { count: selectedCount });
    }

    if (elements.pageScope) {
      elements.pageScope.textContent = t('selection.pageScoped');
      elements.pageScope.classList.toggle('hidden', !state.hasMore);
    }

    if (elements.deleteSelected) {
      elements.deleteSelected.textContent = t('actions.deleteSelected');
      elements.deleteSelected.disabled = selectedCount === 0;
    }
  };

  const renderEmptyState = () => {
    if (!elements.results) {
      return;
    }

    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = t('list.empty');
    elements.results.replaceChildren(empty);
  };

  const renderResults = () => {
    if (!elements.results) {
      return;
    }

    if (state.items.length === 0) {
      renderEmptyState();
      return;
    }

    const fragment = document.createDocumentFragment();

    state.items.forEach((conversation) => {
      const card = document.createElement('article');
      card.className = 'conversation-card';
      if (state.selectedIds.has(conversation.id)) {
        card.classList.add('is-selected');
      }

      const selectCell = document.createElement('div');
      selectCell.className = 'select-cell';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = state.selectedIds.has(conversation.id);
      checkbox.addEventListener('click', (event) => event.stopPropagation());
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          state.selectedIds.add(conversation.id);
        } else {
          state.selectedIds.delete(conversation.id);
        }
        renderToolbar();
        card.classList.toggle('is-selected', state.selectedIds.has(conversation.id));
      });
      selectCell.append(checkbox);

      const main = document.createElement('div');
      main.className = 'card-main';
      const head = document.createElement('div');
      head.className = 'card-head';

      const info = document.createElement('div');
      const name = document.createElement('h2');
      name.className = 'conversation-name';
      name.textContent = conversation.name || conversation.id;
      const workspace = document.createElement('p');
      workspace.className = 'workspace';
      workspace.textContent = `${t('fields.workspace')}: ${conversation.extra?.workspace || '-'}`;
      info.append(name, workspace);

      const meta = document.createElement('div');
      meta.className = 'card-meta';
      const category = document.createElement('span');
      category.className = 'category-pill';
      category.textContent = `${t('fields.category')}: ${getCategoryLabel(conversation.type)}`;
      const timestamp = document.createElement('span');
      timestamp.className = 'timestamp-pill';
      timestamp.textContent = `${t('fields.updatedAt')}: ${formatTimestamp(conversation.modifyTime)}`;
      meta.append(category, timestamp);

      head.append(info, meta);
      main.append(head);

      const actions = document.createElement('div');
      actions.className = 'row-actions';
      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'button button-primary';
      openButton.textContent = t('actions.open');
      openButton.addEventListener('click', async (event) => {
        event.stopPropagation();
        await openConversation(conversation);
      });

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'button button-danger';
      deleteButton.textContent = t('actions.delete');
      deleteButton.addEventListener('click', async (event) => {
        event.stopPropagation();
        await deleteSelected([conversation.id]);
      });

      actions.append(openButton, deleteButton);

      card.append(selectCell, main, actions);
      card.addEventListener('click', () => {
        void openConversation(conversation);
      });

      fragment.append(card);
    });

    elements.results.replaceChildren(fragment);
  };

  const renderPagination = () => {
    if (!elements.pagination) {
      return;
    }

    elements.pagination.innerHTML = '';

    if (state.total === 0) {
      return;
    }

    const pageCount = Math.max(1, Math.ceil(state.total / PAGE_SIZE));

    const label = document.createElement('span');
    label.className = 'pagination-label';
    label.textContent = t('actions.page', { current: state.page + 1, total: pageCount });

    const previous = document.createElement('button');
    previous.type = 'button';
    previous.className = 'button';
    previous.textContent = t('actions.previous');
    previous.disabled = state.page === 0 || state.loading;
    previous.addEventListener('click', async () => {
      if (state.page === 0) {
        return;
      }
      state.page -= 1;
      await search();
    });

    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'button';
    next.textContent = t('actions.next');
    next.disabled = !state.hasMore || state.loading;
    next.addEventListener('click', async () => {
      if (!state.hasMore) {
        return;
      }
      state.page += 1;
      await search();
    });

    elements.pagination.append(label, previous, next);
  };

  const render = () => {
    syncInputs();
    renderToolbar();
    renderResults();
    renderPagination();
  };

  const invokeHost = (action, payload) =>
    new Promise((resolve, reject) => {
      const requestId = `${action}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
      const timer = window.setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`Timed out waiting for host action: ${action}`));
      }, 10000);

      pending.set(requestId, { resolve, reject, timer });
      window.parent.postMessage(
        {
          type: 'ext:api-call',
          requestId,
          data: { action, payload },
        },
        '*'
      );
    });

  const syncSelectionToVisibleItems = () => {
    const visibleIds = new Set(state.items.map((item) => item.id));
    state.selectedIds = new Set(Array.from(state.selectedIds).filter((id) => visibleIds.has(id)));
  };

  const search = async () => {
    state.loading = true;
    renderToolbar();
    renderPagination();
    setStatus('messages.loading');

    try {
      const result = await invokeHost('conversation.searchManaged', {
        ...state.filters,
        page: state.page,
        pageSize: PAGE_SIZE,
      });

      state.items = Array.isArray(result.items) ? result.items : [];
      state.total = typeof result.total === 'number' ? result.total : 0;
      state.hasMore = Boolean(result.hasMore);
      syncSelectionToVisibleItems();
      setStatus('messages.searchLoaded', 'success', { count: state.total });
    } catch (error) {
      console.error('[session-management extension] Failed to search conversations:', error);
      state.items = [];
      state.total = 0;
      state.hasMore = false;
      state.selectedIds = new Set();
      setStatus('messages.searchFailed', 'error');
    } finally {
      state.loading = false;
      render();
    }
  };

  const deleteSelected = async (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) {
      setStatus('messages.noSelection', 'warning');
      return;
    }

    if (!window.confirm(t('confirm.delete', { count: ids.length }))) {
      return;
    }

    try {
      const result = await invokeHost('conversation.removeMany', { ids });
      const successCount = typeof result.successCount === 'number' ? result.successCount : 0;

      if (successCount <= 0) {
        setStatus('messages.deleteFailed', 'error');
        return;
      }

      state.selectedIds = new Set();
      if (state.page > 0 && successCount === state.items.length) {
        state.page -= 1;
      }
      setStatus(successCount === ids.length ? 'messages.deleteSuccess' : 'messages.deletePartialSuccess', 'success', {
        count: successCount,
      });
      await search();
    } catch (error) {
      console.error('[session-management extension] Failed to delete conversations:', error);
      setStatus('messages.deleteFailed', 'error');
    }
  };

  const openConversation = async (conversation) => {
    try {
      await invokeHost('conversation.open', { conversation });
    } catch (error) {
      console.error('[session-management extension] Failed to open conversation:', error);
      setStatus('messages.openFailed', 'error');
    }
  };

  const resetFilters = async () => {
    state.filters = {
      category: 'all',
      workspaceKeyword: '',
      keyword: '',
    };
    state.page = 0;
    state.selectedIds = new Set();
    syncInputs();
    await search();
  };

  const toggleSelection = () => {
    const allSelected = state.items.length > 0 && state.items.every((item) => state.selectedIds.has(item.id));
    if (allSelected) {
      state.selectedIds = new Set();
    } else {
      state.selectedIds = new Set(state.items.map((item) => item.id));
    }
    renderToolbar();
    renderResults();
  };

  if (elements.searchButton) {
    elements.searchButton.addEventListener('click', async () => {
      readFiltersFromInputs();
      state.page = 0;
      await search();
    });
  }

  if (elements.resetButton) {
    elements.resetButton.addEventListener('click', () => {
      void resetFilters();
    });
  }

  if (elements.toggleSelection) {
    elements.toggleSelection.addEventListener('click', toggleSelection);
  }

  if (elements.deleteSelected) {
    elements.deleteSelected.addEventListener('click', () => {
      void deleteSelected(Array.from(state.selectedIds));
    });
  }

  window.addEventListener('message', (event) => {
    const data = event.data || {};

    if (data.type === 'aion:init') {
      state.locale = data.locale || 'en-US';
      const mergedTranslations = (data.translations && data.translations.settings) || {};
      state.translations = deepMerge(defaultTranslations, mergedTranslations);
      renderTranslations();
      render();
      setStatus('messages.ready', 'success');
      void search();
      return;
    }

    if (data.type === 'ext:api-response' && data.requestId && pending.has(data.requestId)) {
      const current = pending.get(data.requestId);
      pending.delete(data.requestId);
      window.clearTimeout(current.timer);

      if (data.success === false) {
        current.reject(new Error(data.error || 'Host action failed'));
      } else {
        current.resolve(data.data);
      }
    }
  });

  renderTranslations();
  renderEmptyState();
  setStatus('messages.waitingForBridge');
  window.parent.postMessage({ type: 'aion:get-locale' }, '*');
})();
