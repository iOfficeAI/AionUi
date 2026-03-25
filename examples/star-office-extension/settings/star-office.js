(() => {
  const statsEl = document.getElementById('stats');
  const agentLayerEl = document.getElementById('agent-layer');
  const feedEl = document.getElementById('activity-feed');
  const sourceEl = document.getElementById('source-text');
  const refreshBtn = document.getElementById('refresh-btn');
  const autoplayBtn = document.getElementById('autoplay-btn');

  const ZONES = {
    idle: { x: [18, 36], y: [24, 56] },
    writing: { x: [18, 36], y: [64, 90] },
    researching: { x: [45, 63], y: [24, 56] },
    executing: { x: [45, 63], y: [64, 90] },
    syncing: { x: [72, 90], y: [24, 56] },
    error: { x: [72, 90], y: [64, 90] },
  };

  let autoPlay = true;
  let mode = 'mock';
  let lastSnapshot = null;

  const now = () => Date.now();
  const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const STATUS_TEXT = {
    idle: '待命',
    writing: '写作',
    researching: '调研',
    executing: '执行',
    syncing: '同步',
    error: '错误',
  };

  const runtimeToState = (runtimeStatus) => {
    if (runtimeStatus === 'running') return 'executing';
    if (runtimeStatus === 'pending') return 'syncing';
    return 'idle';
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  const normalizeSnapshot = (input) => {
    if (!input || typeof input !== 'object') return null;
    const rawAgents = Array.isArray(input.agents) ? input.agents : [];

    const agents = rawAgents.map((a, idx) => {
      const state = ZONES[a.state] ? a.state : runtimeToState(a.runtimeStatus);
      return {
        id: String(a.id || `agent-${idx}`),
        agentName: String(a.agentName || a.backend || `Agent-${idx + 1}`),
        backend: String(a.backend || 'unknown'),
        state,
        runtimeStatus: String(a.runtimeStatus || 'unknown'),
        lastActiveAt: Number(a.lastActiveAt || now()),
        currentTask: a.currentTask ? String(a.currentTask) : `${STATUS_TEXT[state]}中`,
        recentEvents: Array.isArray(a.recentEvents)
          ? a.recentEvents.slice(0, 3).map((e) => ({
              at: Number(e.at || now()),
              text: String(e.text || ''),
            }))
          : [],
      };
    });

    const runningConversations = Number(
      input.runningConversations || agents.filter((a) => a.runtimeStatus === 'running').length
    );
    const totalConversations = Number(input.totalConversations || agents.length);

    return {
      generatedAt: Number(input.generatedAt || now()),
      runningConversations,
      totalConversations,
      agents,
    };
  };

  const buildMockSnapshot = () => {
    const names = ['Claude', 'Codex', 'Gemini', 'Qwen', 'OpenClaw', 'CodeBuddy'];
    const states = ['idle', 'writing', 'researching', 'executing', 'syncing', 'error'];
    const agents = names.map((name, idx) => {
      const state = pick(states);
      return {
        id: `mock-${idx}`,
        backend: name.toLowerCase(),
        agentName: name,
        state,
        runtimeStatus: state === 'idle' ? 'finished' : state === 'error' ? 'finished' : 'running',
        lastActiveAt: now() - rnd(1000, 240000),
        currentTask: `${STATUS_TEXT[state]} · workspace-${(idx % 3) + 1}`,
        recentEvents: [
          { at: now() - rnd(2000, 200000), text: `${name} ${STATUS_TEXT[state]}中` },
          { at: now() - rnd(1000, 300000), text: `${name} 更新会话状态` },
        ],
      };
    });

    return {
      generatedAt: now(),
      totalConversations: agents.length,
      runningConversations: agents.filter((a) => a.runtimeStatus === 'running').length,
      agents,
    };
  };

  const setSourceText = (text) => {
    sourceEl.textContent = `数据源：${text}`;
  };

  const renderStats = (snapshot) => {
    const counters = {
      agents: snapshot.agents.length,
      running: snapshot.agents.filter((a) => a.runtimeStatus === 'running').length,
      errors: snapshot.agents.filter((a) => a.state === 'error').length,
      updated: formatTime(snapshot.generatedAt),
    };

    statsEl.innerHTML = `
      <div class="stat-card"><div class="k">Agents</div><div class="v">${counters.agents}</div></div>
      <div class="stat-card"><div class="k">Running</div><div class="v">${counters.running}</div></div>
      <div class="stat-card"><div class="k">Errors</div><div class="v">${counters.errors}</div></div>
      <div class="stat-card"><div class="k">Updated</div><div class="v" style="font-size:14px">${counters.updated}</div></div>
    `;
  };

  const renderAgents = (snapshot) => {
    agentLayerEl.innerHTML = '';
    snapshot.agents.forEach((agent, idx) => {
      const z = ZONES[agent.state] || ZONES.idle;
      const x = rnd(z.x[0], z.x[1]);
      const y = rnd(z.y[0], z.y[1]);
      const div = document.createElement('div');
      div.className = `agent state-${agent.state}`;
      div.setAttribute('data-name', agent.agentName);
      div.style.left = `${x}%`;
      div.style.top = `${y}%`;
      div.style.animationDelay = `${(idx % 5) * 0.1}s`;
      agentLayerEl.appendChild(div);
    });
  };

  const renderFeed = (snapshot) => {
    const events = [];
    snapshot.agents.forEach((a) => {
      if (a.recentEvents.length > 0) {
        a.recentEvents.forEach((ev) => events.push({ at: ev.at, text: `${a.agentName}: ${ev.text}` }));
      } else {
        events.push({ at: a.lastActiveAt, text: `${a.agentName}: ${a.currentTask}` });
      }
    });

    events.sort((a, b) => b.at - a.at);
    const top = events.slice(0, 16);

    feedEl.innerHTML = top
      .map((ev) => `<li><div class="time">${formatTime(ev.at)}</div><div class="text">${ev.text}</div></li>`)
      .join('');
  };

  const renderSnapshot = (snapshot) => {
    lastSnapshot = snapshot;
    renderStats(snapshot);
    renderAgents(snapshot);
    renderFeed(snapshot);
  };

  const requestSnapshotFromParent = () => {
    if (!window.parent || window.parent === window) {
      return Promise.reject(new Error('no parent'));
    }

    const reqId = `star-office-${now()}-${Math.random().toString(36).slice(2, 7)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        reject(new Error('parent timeout'));
      }, 1200);

      const onMessage = (event) => {
        const data = event && event.data;
        if (!data || data.type !== 'star-office:activity-snapshot' || data.reqId !== reqId) return;
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        resolve(data.snapshot);
      };

      window.addEventListener('message', onMessage);
      window.parent.postMessage({ type: 'star-office:request-snapshot', reqId }, '*');
    });
  };

  const loadSnapshot = async (forceMock = false) => {
    if (!forceMock) {
      try {
        const remote = await requestSnapshotFromParent();
        const normalized = normalizeSnapshot(remote);
        if (normalized) {
          mode = 'live';
          setSourceText('Host postMessage (live)');
          renderSnapshot(normalized);
          return;
        }
      } catch {
        // fallback to mock
      }
    }

    mode = 'mock';
    setSourceText('Mock data (扩展独立可运行)');
    renderSnapshot(buildMockSnapshot());
  };

  window.addEventListener('message', (event) => {
    const data = event && event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'star-office:activity-snapshot' && data.snapshot) {
      const snapshot = normalizeSnapshot(data.snapshot);
      if (snapshot) {
        mode = 'live';
        setSourceText('Host push update');
        renderSnapshot(snapshot);
      }
      return;
    }

    if (data.type === 'star-office:toggle-autoplay') {
      autoPlay = !!data.enabled;
      autoplayBtn.textContent = `自动轮询：${autoPlay ? '开' : '关'}`;
    }
  });

  refreshBtn.addEventListener('click', () => {
    loadSnapshot(false);
  });

  autoplayBtn.addEventListener('click', () => {
    autoPlay = !autoPlay;
    autoplayBtn.textContent = `自动轮询：${autoPlay ? '开' : '关'}`;
  });

  setInterval(() => {
    if (!autoPlay) return;
    if (mode === 'live') {
      loadSnapshot(false);
    } else if (lastSnapshot) {
      renderSnapshot(buildMockSnapshot());
    }
  }, 5000);

  loadSnapshot(false);
})();
