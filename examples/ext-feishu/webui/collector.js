/**
 * ext-飞书 WebUI 数据收集示例（默认未集成）
 * 约定导出 Express 风格处理函数：
 * - POST /ext-feishu/collect 记录事件
 * - GET  /ext-feishu/stats   返回汇总
 */

const state = {
  events: [],
  counters: {},
};

function addEvent(event) {
  const type = event && event.type ? String(event.type) : 'unknown';
  state.events.push({
    ...event,
    type,
    at: Date.now(),
  });
  state.counters[type] = (state.counters[type] || 0) + 1;

  // 控制内存占用，仅保留最近 1000 条
  if (state.events.length > 1000) {
    state.events.splice(0, state.events.length - 1000);
  }
}

module.exports = async function extFeishuCollector(req, res) {
  if (req.method === 'POST') {
    addEvent(req.body || {});
    return res.json({ ok: true, total: state.events.length });
  }

  return res.json({
    ok: true,
    total: state.events.length,
    counters: state.counters,
    latest: state.events.slice(-20),
  });
};
