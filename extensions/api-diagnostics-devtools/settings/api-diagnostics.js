(() => {
  const MAX_WINDOW = 20;

  const defaultTranslations = {
    page: {
      title: 'API 诊断',
    },
    common: {
      on: '已开启',
      off: '已关闭',
      persist: '落盘',
      doNotPersist: '仅内存',
      emptyState: '--',
      mb: 'MB',
      timelineSeparator: ' / ',
    },
    hero: {
      eyebrow: '运行时巡检',
      title: 'API 诊断',
      lede: '用于观察 AionUi 全局执行状态，并排查本地 HTTP API 中会话停止清理、Worker 残留和内存增长问题的独立诊断工作台。',
    },
    panel: {
      samplingTitle: '采样控制',
      samplingDesc: '自动采样只作用于当前运行期，不会改动用户保存的常规 API 配置。',
      autoSamplingLabel: '自动采样',
      autoSamplingHelp: '控制是否持续记录运行中的 API 诊断样本。手动抓取始终可用。',
      sampleIntervalLabel: '采样间隔 (ms)',
      outputDirLabel: '输出目录',
      manualTitle: '手动抓取',
      manualDesc: '可指定单个会话，也可以留空以抓取全局进程快照。即使自动采样关闭，手动抓取仍然可用。',
      sessionIdLabel: '会话 ID',
      sessionIdPlaceholder: '留空则抓取全局快照',
      trendTitle: '近期采样趋势',
      trendDesc: '展示本次应用运行期间的最新内存快照，包括自动路由采样和手动抓取结果。',
      snapshotTitle: '快照内容',
      activityTitle: '当前执行情况',
      activityDesc: '展示 AionUi 当前仍在运行、处理中或等待确认的会话，方便直接查看整体执行状态。',
    },
    action: {
      applyConfig: '应用配置',
      refreshState: '刷新状态',
      openOutput: '打开输出目录',
      captureSnapshot: '抓取快照',
      copyJson: '复制 JSON',
    },
    summary: {
      rss: 'RSS',
      heap: '堆已用',
      tasks: 'Worker 任务',
      cache: '消息缓存',
    },
    trend: {
      window: '窗口：{current}/{max}',
      empty: '暂时还没有近期趋势数据。启用自动采样或先抓取一次快照后，这里会展示图表。',
      rssTitle: 'RSS 趋势',
      rssSubtitle: '近期采样中的常驻内存变化。',
      heapTitle: '堆内存趋势',
      heapSubtitle: '最近几次抓取中的 JS 堆变化。',
      tasksTitle: 'Worker 任务趋势',
      tasksSubtitle: '适合观察停止后任务是否残留。',
      cacheTitle: '缓存 / 处理中趋势',
      cacheSubtitle: '消息缓存规模与活跃轮次残留的组合指标。',
    },
    timeline: {
      empty: '本次应用运行期间还没有记录到任何抓取结果。',
      capture: '抓取',
      runtimeSnapshot: '运行时快照',
      rss: 'RSS',
      heap: '堆',
      tasks: '任务',
      cache: '缓存',
    },
    snapshot: {
      empty: '暂未抓取任何诊断快照。',
      latest: '最近一次抓取：{timestamp}。',
      latestWithFile: '最近一次抓取：{timestamp}。最近文件：{filePath}',
    },
    activity: {
      count: '活跃会话：{count}',
      empty: '当前没有活跃中的全局会话。开启自动采样或点一次刷新，可以继续观察 AionUi 整体运行状态。',
      status: '状态',
      detail: '详情',
      workspace: '工作区',
      source: '来源',
      model: '类型',
      lastMessage: '最后消息',
      processing: '处理中',
      waitingConfirmation: '等待确认',
      waitingInput: '等待输入',
      canSend: '可继续发送',
      cannotSend: '暂不可发送',
      unnamed: '未命名会话',
      none: '无',
    },
    chip: {
      autoSamplingOn: '自动采样已开启',
      autoSamplingOff: '自动采样已关闭',
    },
    status: {
      waitingForBridge: '正在等待宿主桥接...',
      loadingState: '正在加载诊断状态...',
      ready: '诊断页面已就绪，当前自动采样{state}。',
      updatingSampling: '正在更新自动采样开关...',
      samplingUpdated: '自动采样开关已更新。',
      applyingConfig: '正在应用运行时诊断配置...',
      configApplied: '诊断配置已应用到当前运行实例。',
      capturingSnapshot: '正在抓取运行时快照...',
      snapshotCaptured: '诊断快照已抓取。',
      snapshotCapturedPersisted: '诊断快照已抓取并写入磁盘。',
      noOutputPath: '当前还没有可用的诊断输出路径。',
      outputOpened: '已在宿主文件管理器中打开诊断输出位置。',
      snapshotCopied: '快照 JSON 已复制到剪贴板。',
      loadFailed: '加载诊断状态失败。',
      applyFailed: '应用诊断配置失败。',
      captureFailed: '抓取诊断快照失败。',
      openOutputFailed: '打开诊断输出位置失败。',
      copyFailed: '复制快照 JSON 失败。',
    },
  };

  const state = {
    locale: 'zh-CN',
    translations: defaultTranslations,
    status: {
      type: 'key',
      value: 'status.waitingForBridge',
      tone: null,
      params: undefined,
    },
    config: {
      enabled: false,
      outputDir: '',
      sampleIntervalMs: 60000,
    },
    liveSnapshot: null,
    sessionId: '',
    persist: true,
    history: [],
    lastCapture: null,
  };

  const elements = {
    statusBanner: document.getElementById('status-banner'),
    samplingStateChip: document.getElementById('sampling-state-chip'),
    enabled: document.getElementById('enabled'),
    enabledStateText: document.getElementById('enabled-state-text'),
    sampleInterval: document.getElementById('sample-interval'),
    outputDir: document.getElementById('output-dir'),
    applyConfig: document.getElementById('apply-config'),
    refreshState: document.getElementById('refresh-state'),
    openOutput: document.getElementById('open-output'),
    sessionId: document.getElementById('session-id'),
    persistSnapshot: document.getElementById('persist-snapshot'),
    persistStateText: document.getElementById('persist-state-text'),
    captureSnapshot: document.getElementById('capture-snapshot'),
    copySnapshot: document.getElementById('copy-snapshot'),
    summaryRss: document.getElementById('summary-rss'),
    summaryHeap: document.getElementById('summary-heap'),
    summaryTasks: document.getElementById('summary-tasks'),
    summaryCache: document.getElementById('summary-cache'),
    activityCount: document.getElementById('activity-count'),
    activityGrid: document.getElementById('activity-grid'),
    trendWindow: document.getElementById('trend-window'),
    trendGrid: document.getElementById('trend-grid'),
    timeline: document.getElementById('timeline'),
    snapshotMeta: document.getElementById('snapshot-meta'),
    snapshotJson: document.getElementById('snapshot-json'),
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

  const deepGet = (source, path) => {
    const parts = path.split('.');
    let current = source;
    for (const part of parts) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }
      current = current[part];
    }
    return current;
  };

  const t = (key, params) => {
    const value = deepGet(state.translations, key);
    const template = typeof value === 'string' ? value : key;
    return template.replace(/\{(\w+)\}/g, (_, name) =>
      String(params && Object.prototype.hasOwnProperty.call(params, name) ? params[name] : `{${name}}`)
    );
  };

  const setText = (elementId, key, params) => {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = t(key, params);
    }
  };

  const setPlaceholder = (element, value) => {
    if (element) {
      element.placeholder = value;
    }
  };

  const hostCall = (action, payload) => {
    const requestId = `api-diagnostics-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        window.removeEventListener('message', onMessage);
        reject(new Error(`Host call timed out: ${action}`));
      }, 5000);

      const onMessage = (event) => {
        if (!event || event.source !== window.parent) return;
        const data = event.data;
        if (!data || data.type !== 'ext:api-response' || data.requestId !== requestId) return;

        window.clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        resolve(data);
      };

      window.addEventListener('message', onMessage);
      window.parent.postMessage(
        {
          type: 'ext:api-call',
          requestId,
          data: {
            action,
            payload,
          },
        },
        '*'
      );
    });
  };

  const invokeHost = async (action, payload) => {
    const envelope = await hostCall(action, payload);
    if (!envelope || envelope.success !== true) {
      throw new Error((envelope && envelope.error) || `Host bridge failed for ${action}`);
    }

    const bridgeResult = envelope.data;
    if (
      bridgeResult &&
      typeof bridgeResult === 'object' &&
      Object.prototype.hasOwnProperty.call(bridgeResult, 'success')
    ) {
      if (!bridgeResult.success) {
        throw new Error(bridgeResult.msg || bridgeResult.error || `Request failed for ${action}`);
      }
      return bridgeResult.data;
    }

    return bridgeResult;
  };

  const applyStatus = () => {
    if (!elements.statusBanner) return;

    const text = state.status.type === 'key' ? t(state.status.value, state.status.params) : state.status.value;
    elements.statusBanner.textContent = text;
    elements.statusBanner.className = 'status';
    if (state.status.tone) {
      elements.statusBanner.classList.add(state.status.tone);
    }
  };

  const setStatusKey = (key, tone, params) => {
    state.status = {
      type: 'key',
      value: key,
      tone: tone || null,
      params,
    };
    applyStatus();
  };

  const setStatusText = (text, tone) => {
    state.status = {
      type: 'text',
      value: text,
      tone: tone || null,
      params: undefined,
    };
    applyStatus();
  };

  const formatTimestamp = (value) => {
    if (!value) return t('common.emptyState');
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
  };

  const formatMemoryMb = (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return t('common.emptyState');
    return `${(value / 1024 / 1024).toFixed(1)} ${t('common.mb')}`;
  };

  const formatCount = (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return t('common.emptyState');
    return value.toLocaleString();
  };

  const parsePositiveInteger = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return undefined;
    if (!/^\d+$/.test(trimmed)) return undefined;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };

  const extractSummary = (snapshot) => {
    if (!snapshot || typeof snapshot !== 'object') return null;

    return {
      timestamp: snapshot.timestamp,
      route: snapshot.route,
      reason: snapshot.reason,
      sessionId:
        snapshot.session && snapshot.session.sessionId ? snapshot.session.sessionId : snapshot.sessionId || null,
      rssBytes: snapshot.process && snapshot.process.memoryUsage ? snapshot.process.memoryUsage.rss : undefined,
      heapUsedBytes:
        snapshot.process && snapshot.process.memoryUsage ? snapshot.process.memoryUsage.heapUsed : undefined,
      totalTasks:
        snapshot.runtime && snapshot.runtime.workerManage ? snapshot.runtime.workerManage.totalTasks : undefined,
      messageCacheSize:
        snapshot.runtime && snapshot.runtime.messageCache ? snapshot.runtime.messageCache.size : undefined,
      inFlightCount:
        snapshot.runtime && snapshot.runtime.turnCompletion ? snapshot.runtime.turnCompletion.inFlightCount : undefined,
      state: snapshot.session ? snapshot.session.state : null,
    };
  };

  const getDisplayedCapture = () => {
    return (
      state.history[state.history.length - 1] ||
      state.lastCapture ||
      (state.liveSnapshot ? { snapshot: state.liveSnapshot } : null)
    );
  };

  const buildSparklinePoints = (values) => {
    if (!values.length) return '';
    if (values.length === 1) return '0,24 100,24';

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    return values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * 100;
        const y = 42 - ((value - min) / range) * 28;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  };

  const renderTrendCards = (summaries) => {
    const latest = summaries[summaries.length - 1];
    const previous = summaries[summaries.length - 2];
    const cards = [
      {
        title: t('trend.rssTitle'),
        subtitle: t('trend.rssSubtitle'),
        color: '#2563eb',
        values: summaries.map((item) => item.rssBytes || 0),
        latest: latest ? latest.rssBytes : undefined,
        previous: previous ? previous.rssBytes : undefined,
        formatter: formatMemoryMb,
      },
      {
        title: t('trend.heapTitle'),
        subtitle: t('trend.heapSubtitle'),
        color: '#d97706',
        values: summaries.map((item) => item.heapUsedBytes || 0),
        latest: latest ? latest.heapUsedBytes : undefined,
        previous: previous ? previous.heapUsedBytes : undefined,
        formatter: formatMemoryMb,
      },
      {
        title: t('trend.tasksTitle'),
        subtitle: t('trend.tasksSubtitle'),
        color: '#16a34a',
        values: summaries.map((item) => item.totalTasks || 0),
        latest: latest ? latest.totalTasks : undefined,
        previous: previous ? previous.totalTasks : undefined,
        formatter: formatCount,
      },
      {
        title: t('trend.cacheTitle'),
        subtitle: t('trend.cacheSubtitle'),
        color: '#7c3aed',
        values: summaries.map((item) => (item.messageCacheSize || 0) + (item.inFlightCount || 0)),
        latest: latest ? (latest.messageCacheSize || 0) + (latest.inFlightCount || 0) : undefined,
        previous: previous ? (previous.messageCacheSize || 0) + (previous.inFlightCount || 0) : undefined,
        formatter: formatCount,
      },
    ];

    elements.trendGrid.innerHTML = '';

    if (!cards.some((card) => card.values.length)) {
      elements.trendGrid.innerHTML = `<div class="empty">${t('trend.empty')}</div>`;
      return;
    }

    cards.forEach((card) => {
      const points = buildSparklinePoints(card.values);
      const delta =
        typeof card.latest === 'number' && typeof card.previous === 'number' ? card.latest - card.previous : null;
      const deltaText = delta === null ? t('common.emptyState') : `${delta > 0 ? '+' : ''}${card.formatter(delta)}`;
      const deltaColor = delta === null ? '#526071' : delta > 0 ? '#dc2626' : delta < 0 ? '#16a34a' : '#526071';

      const article = document.createElement('article');
      article.className = 'trend-card';
      article.innerHTML = `
        <header>
          <div>
            <h3>${card.title}</h3>
            <p>${card.subtitle}</p>
          </div>
          <div class="trend-metric">
            <strong>${card.formatter(card.latest)}</strong>
            <span style="color:${deltaColor}; font-size:12px;">${deltaText}</span>
          </div>
        </header>
        <svg class="sparkline" viewBox="0 0 100 46" aria-hidden="true">
          <line x1="0" y1="36" x2="100" y2="36" stroke="rgba(148,163,184,0.7)" stroke-width="1" stroke-dasharray="4 4"></line>
          <polyline fill="none" points="${points}" stroke="${card.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
        </svg>
      `;
      elements.trendGrid.appendChild(article);
    });
  };

  const renderTimeline = (summaries) => {
    elements.timeline.innerHTML = '';
    if (!summaries.length) {
      elements.timeline.innerHTML = `<div class="empty">${t('timeline.empty')}</div>`;
      return;
    }

    summaries
      .slice()
      .toReversed()
      .forEach((item) => {
        const entry = document.createElement('article');
        entry.className = 'timeline-item';
        entry.innerHTML = `
          <div>
            <span>${t('timeline.capture')}</span>
            <h3>${formatTimestamp(item.timestamp)}</h3>
            <p>${[item.route, item.reason, item.sessionId || item.state || null].filter(Boolean).join(t('common.timelineSeparator')) || t('timeline.runtimeSnapshot')}</p>
          </div>
          <div><span>${t('timeline.rss')}</span><strong>${formatMemoryMb(item.rssBytes)}</strong></div>
          <div><span>${t('timeline.heap')}</span><strong>${formatMemoryMb(item.heapUsedBytes)}</strong></div>
          <div><span>${t('timeline.tasks')}</span><strong>${formatCount(item.totalTasks)}</strong></div>
          <div><span>${t('timeline.cache')}</span><strong>${formatCount(item.messageCacheSize)}</strong></div>
        `;
        elements.timeline.appendChild(entry);
      });
  };

  const renderActivityGrid = (snapshot) => {
    const sessions =
      snapshot &&
      snapshot.runtime &&
      snapshot.runtime.activeSessions &&
      Array.isArray(snapshot.runtime.activeSessions.sessions)
        ? snapshot.runtime.activeSessions.sessions
        : [];

    elements.activityCount.textContent = t('activity.count', {
      count:
        snapshot &&
        snapshot.runtime &&
        snapshot.runtime.activeSessions &&
        typeof snapshot.runtime.activeSessions.count === 'number'
          ? snapshot.runtime.activeSessions.count
          : sessions.length,
    });

    elements.activityGrid.innerHTML = '';

    if (!sessions.length) {
      elements.activityGrid.innerHTML = `<div class="empty">${t('activity.empty')}</div>`;
      return;
    }

    sessions.forEach((session) => {
      const article = document.createElement('article');
      article.className = 'activity-card';

      const lastMessageSummary =
        session.lastMessage && session.lastMessage.content !== undefined && session.lastMessage.content !== null
          ? typeof session.lastMessage.content === 'string'
            ? session.lastMessage.content
            : JSON.stringify(session.lastMessage.content)
          : t('activity.none');

      article.innerHTML = `
        <header class="activity-card-head">
          <div>
            <h3>${session.name || t('activity.unnamed')}</h3>
            <p>${session.sessionId}</p>
          </div>
          <span class="activity-badge activity-status-${session.status}">${session.status} / ${session.state}</span>
        </header>
        <dl class="activity-meta">
          <div><dt>${t('activity.detail')}</dt><dd>${session.detail || t('activity.none')}</dd></div>
          <div><dt>${t('activity.workspace')}</dt><dd>${session.workspace || t('activity.none')}</dd></div>
          <div><dt>${t('activity.source')}</dt><dd>${session.source || 'aionui'}</dd></div>
          <div><dt>${t('activity.model')}</dt><dd>${session.type || t('activity.none')}</dd></div>
          <div><dt>${t('activity.status')}</dt><dd>${session.canSendMessage ? t('activity.canSend') : t('activity.cannotSend')}</dd></div>
          <div><dt>${t('activity.lastMessage')}</dt><dd title="${lastMessageSummary.replace(/"/g, '&quot;')}">${lastMessageSummary}</dd></div>
        </dl>
      `;

      elements.activityGrid.appendChild(article);
    });
  };

  const renderControlState = () => {
    const enabledValue = elements.enabled ? !!elements.enabled.checked : !!state.config.enabled;
    const persistValue = elements.persistSnapshot ? !!elements.persistSnapshot.checked : !!state.persist;

    if (elements.enabledStateText) {
      elements.enabledStateText.textContent = enabledValue ? t('common.on') : t('common.off');
    }
    if (elements.samplingStateChip) {
      elements.samplingStateChip.textContent = enabledValue ? t('chip.autoSamplingOn') : t('chip.autoSamplingOff');
      elements.samplingStateChip.className = `mode-chip ${enabledValue ? 'active' : 'inactive'}`;
    }
    if (elements.persistStateText) {
      elements.persistStateText.textContent = persistValue ? t('common.persist') : t('common.doNotPersist');
    }
  };

  const applyStaticTranslations = () => {
    document.documentElement.lang = state.locale || 'zh-CN';
    document.title = t('page.title');

    setText('text-hero-eyebrow', 'hero.eyebrow');
    setText('text-hero-title', 'hero.title');
    setText('text-hero-lede', 'hero.lede');
    setText('text-sampling-title', 'panel.samplingTitle');
    setText('text-sampling-desc', 'panel.samplingDesc');
    setText('text-auto-sampling-label', 'panel.autoSamplingLabel');
    setText('text-auto-sampling-help', 'panel.autoSamplingHelp');
    setText('text-sample-interval-label', 'panel.sampleIntervalLabel');
    setText('text-output-dir-label', 'panel.outputDirLabel');
    setText('text-manual-title', 'panel.manualTitle');
    setText('text-manual-desc', 'panel.manualDesc');
    setText('text-session-id-label', 'panel.sessionIdLabel');
    setText('text-summary-rss-label', 'summary.rss');
    setText('text-summary-heap-label', 'summary.heap');
    setText('text-summary-tasks-label', 'summary.tasks');
    setText('text-summary-cache-label', 'summary.cache');
    setText('text-activity-title', 'panel.activityTitle');
    setText('text-activity-desc', 'panel.activityDesc');
    setText('text-trend-title', 'panel.trendTitle');
    setText('text-trend-desc', 'panel.trendDesc');
    setText('text-snapshot-title', 'panel.snapshotTitle');

    elements.applyConfig.textContent = t('action.applyConfig');
    elements.refreshState.textContent = t('action.refreshState');
    elements.openOutput.textContent = t('action.openOutput');
    elements.captureSnapshot.textContent = t('action.captureSnapshot');
    elements.copySnapshot.textContent = t('action.copyJson');

    setPlaceholder(elements.sampleInterval, '60000');
    setPlaceholder(elements.outputDir, '.aionui/diagnostics/api');
    setPlaceholder(elements.sessionId, t('panel.sessionIdPlaceholder'));

    renderControlState();
    applyStatus();
  };

  const render = () => {
    elements.enabled.checked = !!state.config.enabled;
    elements.sampleInterval.value = state.config.sampleIntervalMs ? String(state.config.sampleIntervalMs) : '';
    elements.outputDir.value = state.config.outputDir || '';
    elements.sessionId.value = state.sessionId || '';
    elements.persistSnapshot.checked = !!state.persist;

    renderControlState();

    const displayedCapture = getDisplayedCapture();
    const summarySource = state.liveSnapshot || (displayedCapture && displayedCapture.snapshot);
    const displayedSummary = summarySource ? extractSummary(summarySource) : null;
    const historySummaries = state.history
      .map((capture) => extractSummary(capture.snapshot))
      .filter(Boolean)
      .slice(-MAX_WINDOW);

    elements.summaryRss.textContent = displayedSummary
      ? formatMemoryMb(displayedSummary.rssBytes)
      : t('common.emptyState');
    elements.summaryHeap.textContent = displayedSummary
      ? formatMemoryMb(displayedSummary.heapUsedBytes)
      : t('common.emptyState');
    elements.summaryTasks.textContent = displayedSummary
      ? formatCount(displayedSummary.totalTasks)
      : t('common.emptyState');
    elements.summaryCache.textContent = displayedSummary
      ? formatCount(displayedSummary.messageCacheSize)
      : t('common.emptyState');
    renderActivityGrid(state.liveSnapshot || (displayedCapture && displayedCapture.snapshot));
    elements.trendWindow.textContent = t('trend.window', { current: historySummaries.length, max: MAX_WINDOW });

    renderTrendCards(historySummaries);
    renderTimeline(historySummaries);

    if (displayedCapture) {
      elements.snapshotMeta.textContent = displayedCapture.filePath
        ? t('snapshot.latestWithFile', {
            timestamp: formatTimestamp(displayedSummary && displayedSummary.timestamp),
            filePath: displayedCapture.filePath,
          })
        : t('snapshot.latest', {
            timestamp: formatTimestamp(displayedSummary && displayedSummary.timestamp),
          });
      elements.snapshotJson.value = JSON.stringify(displayedCapture.snapshot, null, 2);
    } else {
      elements.snapshotMeta.textContent = t('snapshot.empty');
      elements.snapshotJson.value = '{}';
    }

    elements.copySnapshot.disabled = !displayedCapture;
  };

  const loadState = async () => {
    setStatusKey('status.loadingState', null);
    try {
      const [config, history, liveCapture] = await Promise.all([
        invokeHost('application.getApiDiagnosticsState'),
        invokeHost('application.getApiDiagnosticsHistory', { limit: MAX_WINDOW }),
        invokeHost('application.getApiDiagnosticsLiveSnapshot', {
          sessionId: elements.sessionId.value.trim() || undefined,
        }),
      ]);
      state.config = {
        enabled: !!(config && config.enabled),
        outputDir: (config && config.outputDir) || '',
        sampleIntervalMs: (config && config.sampleIntervalMs) || 60000,
      };
      state.liveSnapshot = liveCapture ? liveCapture.snapshot || null : null;
      state.history = history && Array.isArray(history.captures) ? history.captures : [];
      render();
      setStatusKey('status.ready', 'success', {
        state: state.config.enabled ? t('common.on') : t('common.off'),
      });
    } catch (error) {
      console.error('[API Diagnostics Extension] Failed to load state:', error);
      setStatusText(error instanceof Error ? error.message : t('status.loadFailed'), 'error');
    }
  };

  const applyConfig = async () => {
    setStatusKey('status.applyingConfig', null);
    try {
      const nextConfig = await invokeHost('application.updateApiDiagnosticsConfig', {
        enabled: elements.enabled.checked,
        outputDir: elements.outputDir.value.trim(),
        sampleIntervalMs: parsePositiveInteger(elements.sampleInterval.value),
      });

      state.config = {
        enabled: !!(nextConfig && nextConfig.enabled),
        outputDir: (nextConfig && nextConfig.outputDir) || '',
        sampleIntervalMs: (nextConfig && nextConfig.sampleIntervalMs) || 60000,
      };
      render();
      setStatusKey('status.configApplied', 'success');
    } catch (error) {
      console.error('[API Diagnostics Extension] Failed to apply config:', error);
      setStatusText(error instanceof Error ? error.message : t('status.applyFailed'), 'error');
    }
  };

  const updateSamplingEnabled = async () => {
    const nextEnabled = !!elements.enabled.checked;
    const previousEnabled = !!state.config.enabled;

    state.config.enabled = nextEnabled;
    renderControlState();
    setStatusKey('status.updatingSampling', null);

    try {
      const nextConfig = await invokeHost('application.updateApiDiagnosticsConfig', {
        enabled: nextEnabled,
      });

      state.config = {
        enabled: !!(nextConfig && nextConfig.enabled),
        outputDir: (nextConfig && nextConfig.outputDir) || '',
        sampleIntervalMs: (nextConfig && nextConfig.sampleIntervalMs) || 60000,
      };
      render();
      setStatusKey('status.samplingUpdated', 'success');
    } catch (error) {
      state.config.enabled = previousEnabled;
      elements.enabled.checked = previousEnabled;
      renderControlState();
      console.error('[API Diagnostics Extension] Failed to update sampling state:', error);
      setStatusText(error instanceof Error ? error.message : t('status.applyFailed'), 'error');
    }
  };

  const captureSnapshot = async () => {
    setStatusKey('status.capturingSnapshot', null);
    try {
      state.sessionId = elements.sessionId.value.trim();
      state.persist = elements.persistSnapshot.checked;

      const capture = await invokeHost('application.captureApiDiagnosticsSnapshot', {
        sessionId: state.sessionId || undefined,
        persist: state.persist,
      });

      state.lastCapture = capture || null;
      await loadState();
      setStatusKey(state.persist ? 'status.snapshotCapturedPersisted' : 'status.snapshotCaptured', 'success');
    } catch (error) {
      console.error('[API Diagnostics Extension] Failed to capture snapshot:', error);
      setStatusText(error instanceof Error ? error.message : t('status.captureFailed'), 'error');
    }
  };

  const openOutput = async () => {
    const displayedCapture = getDisplayedCapture();
    const targetPath = (displayedCapture && displayedCapture.filePath) || state.config.outputDir;
    if (!targetPath) {
      setStatusKey('status.noOutputPath', 'error');
      return;
    }

    try {
      await invokeHost('shell.showItemInFolder', targetPath);
      setStatusKey('status.outputOpened', 'success');
    } catch (error) {
      console.error('[API Diagnostics Extension] Failed to open output:', error);
      setStatusText(error instanceof Error ? error.message : t('status.openOutputFailed'), 'error');
    }
  };

  const copySnapshot = async () => {
    try {
      await navigator.clipboard.writeText(elements.snapshotJson.value || '{}');
      setStatusKey('status.snapshotCopied', 'success');
    } catch (error) {
      console.error('[API Diagnostics Extension] Failed to copy snapshot:', error);
      setStatusKey('status.copyFailed', 'error');
    }
  };

  const onHostMessage = (event) => {
    if (!event || event.source !== window.parent) return;
    const data = event.data;
    if (!data || data.type !== 'aion:init') return;

    state.locale = typeof data.locale === 'string' ? data.locale : state.locale;
    const settingsTranslations =
      data.translations && typeof data.translations === 'object' ? data.translations.settings || {} : {};
    state.translations = deepMerge(defaultTranslations, settingsTranslations);
    applyStaticTranslations();
    render();
  };

  window.addEventListener('message', onHostMessage);

  elements.applyConfig.addEventListener('click', () => {
    void applyConfig();
  });
  elements.refreshState.addEventListener('click', () => {
    void loadState();
  });
  elements.openOutput.addEventListener('click', () => {
    void openOutput();
  });
  elements.captureSnapshot.addEventListener('click', () => {
    void captureSnapshot();
  });
  elements.copySnapshot.addEventListener('click', () => {
    void copySnapshot();
  });
  elements.sessionId.addEventListener('input', (event) => {
    state.sessionId = event.target.value;
  });
  elements.persistSnapshot.addEventListener('change', (event) => {
    state.persist = event.target.checked;
    renderControlState();
  });
  elements.enabled.addEventListener('change', () => {
    void updateSamplingEnabled();
  });

  applyStaticTranslations();
  window.parent.postMessage({ type: 'aion:get-locale' }, '*');
  void loadState();
})();
