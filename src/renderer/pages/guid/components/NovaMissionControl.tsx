/**
 * NovaMaster Mission Control — Live Empire Dashboard
 * Unified telemetry from Claw3D, OpenClaw, Hermes, Space Agent, Ollama
 */

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Message, Spin, Tooltip } from '@arco-design/web-react';
import {
  Computer, Connection, Cpu, Earth, HomeTwo, PlayOne,
  Robot, SettingConfig, Thunderstorm, Command, Browser,
} from '@icon-park/react';
import styles from '../index.module.css';

// ─── Types ───────────────────────────────────────────────────────────

interface NovaService {
  id: string;
  name: string;
  role: string;
  port: number;
  status: 'online' | 'degraded' | 'offline';
  latencyMs: number | null;
  openUrl: string;
  icon?: string;
}

interface NovaAgent {
  id: string;
  name: string;
  status: 'idle' | 'working' | 'error' | 'offline';
  model?: string;
  task?: string;
  cost_today?: number;
  revenue_impact?: number;
}

interface NovaTelemetry {
  cpu: number;
  memory: number;
  disk: number;
  uptime: number;
  revenue: number;
  cost: number;
  agentsTotal: number;
  agentsWorking: number;
  servicesOnline: number;
  servicesTotal: number;
}

interface NovaStackSummary {
  total: number;
  online: number;
  degraded: number;
  offline: number;
}

interface NovaStackData {
  services: NovaService[];
  agents: NovaAgent[];
  telemetry?: NovaTelemetry;
  summary?: NovaStackSummary;
  autopilot: string;
  updatedAt: string;
}

// ─── Sub-components ───────────────────────────────────────────────────

const StatPill: React.FC<{
  label: string;
  value: string | number;
  accent?: 'gold' | 'cyan' | 'green' | 'red';
  subtitle?: string;
}> = ({ label, value, accent = 'gold', subtitle }) => (
  <div className='nova-stat-card'>
    <span className='nova-stat-value'>{value}</span>
    <span className='nova-stat-label'>{label}</span>
    {subtitle && <span style={{ fontSize: 10, color: 'var(--text-disabled)' }}>{subtitle}</span>}
  </div>
);

const MetricBar: React.FC<{
  label: string;
  value: number;
  max?: number;
  unit?: string;
  accent?: 'gold' | 'cyan' | 'green' | 'red';
}> = ({ label, value, max = 100, unit = '%', accent = 'gold' }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
      <span>{label}</span>
      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{value}{unit}</span>
    </div>
    <div className='nova-metric-track'>
      <div
        className={`nova-metric-fill nova-metric-fill-${accent}`}
        style={{ width: `${Math.min((value / max) * 100, 100)}%` }}
      />
    </div>
  </div>
);

const ServiceChip: React.FC<{
  service: NovaService;
  onClick: () => void;
  loading: boolean;
  receipt?: string;
}> = ({ service, onClick, loading, receipt }) => {
  const statusClass = `nova-status-${service.status}`;
  const statusLabel = service.status === 'online' ? 'ON' : service.status === 'degraded' ? 'DEG' : 'OFF';
  return (
    <Tooltip content={receipt || `${service.name} :${service.port}`}>
      <div
        className='nova-agent-card'
        onClick={onClick}
        style={{ cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1 }}
      >
        <div className={`nova-agent-avatar ${service.role.includes('core') ? '' : 'accent'}`}>
          {service.icon || service.name[0]}
        </div>
        <div className='nova-agent-info'>
          <span className='nova-agent-name'>{service.name}</span>
          <span className='nova-agent-task'>:{service.port} · {statusLabel}</span>
        </div>
        <span className={`nova-status ${statusClass}`} style={{ marginLeft: 'auto' }} />
        {loading && <Spin dot style={{ marginLeft: 8 }} />}
      </div>
    </Tooltip>
  );
};

const AgentChip: React.FC<{ agent: NovaAgent }> = ({ agent }) => {
  const statusMap = {
    working: { cls: 'nova-status-working', label: 'WORK' },
    idle: { cls: 'nova-status-online', label: 'IDLE' },
    error: { cls: 'nova-status-offline', label: 'ERR' },
    offline: { cls: 'nova-status-offline', label: 'OFF' },
  } as const;
  const s = statusMap[agent.status];

  return (
    <div className='nova-agent-card'>
      <div className={`nova-agent-avatar ${agent.status === 'working' ? 'success' : ''}`}>
        {agent.name[0]}
      </div>
      <div className='nova-agent-info'>
        <span className='nova-agent-name'>{agent.name}</span>
        {agent.task && <span className='nova-agent-task'>{agent.task}</span>}
      </div>
      <span className={`nova-status ${s.cls}`} style={{ marginLeft: 'auto' }}>{s.label}</span>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────

const NovaMissionControl: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [stack, setStack] = useState<NovaStackData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launchingIds, setLaunchingIds] = useState<Set<string>>(new Set());
  const [receipts, setReceipts] = useState<Record<string, string>>({});
  const [showOpenClaw, setShowOpenClaw] = useState(false);
  const [showSpaceAgent, setShowSpaceAgent] = useState(false);
  const [activePanel, setActivePanel] = useState<'dashboard' | 'openclaw' | 'spaceagent'>('dashboard');

  // ── Fetch stack ──
  const fetchStack = useCallback(async () => {
    try {
      const res = await fetch('/api/novamaster/stack', { credentials: 'include' });
      const payload = await res.json();
      if (payload.success && payload.data) {
        setStack(payload.data);
        setError(null);
      } else {
        setError(payload.msg || 'Stack unavailable');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed');
    }
  }, []);

  useEffect(() => {
    fetchStack();
    const timer = setInterval(fetchStack, 12000);
    return () => clearInterval(timer);
  }, [fetchStack]);

  // ── Launch service ──
  const handleLaunch = useCallback(async (service: NovaService) => {
    setLaunchingIds((prev) => new Set(prev).add(service.id));
    try {
      const res = await fetch(`/api/novamaster/services/${service.id}/open`, { credentials: 'include' });
      const payload = await res.json();
      const targetUrl = payload.data?.openUrl || service.openUrl;
      if (targetUrl) window.open(targetUrl, '_blank');
      setReceipts((r) => ({ ...r, [service.id]: `Opened ${service.name}` }));
    } catch {
      window.open(service.openUrl, '_blank');
      setReceipts((r) => ({ ...r, [service.id]: `Fallback: ${service.openUrl}` }));
    } finally {
      setLaunchingIds((prev) => {
        const next = new Set(prev);
        next.delete(service.id);
        return next;
      });
    }
  }, []);

  // ── Priority services ──
  const priorityServices = useMemo(() => {
    const order = ['aionui', 'jarvis', 'openclaw', 'space-agent', 'hermes', 'claw3d', 'clawmem', 'ollama', 'video-factory'];
    const map = new Map((stack?.services || []).map((s) => [s.id, s]));
    return order.map((id) => map.get(id)).filter(Boolean) as NovaService[];
  }, [stack]);

  // ── Telemetry defaults ──
  const telemetry = useMemo<NovaTelemetry>(() => {
    if (stack?.telemetry) {
      return stack.telemetry;
    }

    const services = stack?.services || [];
    const agents = stack?.agents || [];
    return {
      cpu: 0, memory: 0, disk: 0, uptime: 0,
      revenue: 0, cost: 0,
      agentsTotal: agents.length,
      agentsWorking: agents.filter((agent) => agent.status === 'working').length,
      servicesOnline: stack?.summary?.online ?? services.filter((service) => service.status === 'online').length,
      servicesTotal: stack?.summary?.total ?? services.length,
    };
  }, [stack]);

  // ── Render ──
  return (
    <div className={styles.novaMissionControl}>
      {/* ── Ambient glow behind the grid ── */}
      <div style={{
        position: 'absolute', inset: -28, pointerEvents: 'none', zIndex: 0,
        background: `
          radial-gradient(circle at 18% 30%, rgba(217,164,49,0.14), transparent 26%),
          radial-gradient(circle at 68% 14%, rgba(255,241,168,0.1), transparent 18%),
          radial-gradient(circle at 88% 64%, rgba(143,211,163,0.1), transparent 20%)
        `,
        filter: 'blur(12px)', opacity: 0.62,
      }} />

      {/* ── Left: Orb + Stats ── */}
      <div className={styles.novaOrbPanel} style={{ position: 'relative', zIndex: 1 }}>
        {/* Orb */}
        <div className={styles.novaOrb}>
          <div className={styles.novaOrbRing} />
          <div className={styles.novaOrbRing} />
          <div className={styles.novaOrbRing} />
          <div className={styles.novaOrbScan} />
          <div className={styles.novaOrbOrbit} />
          <div className={styles.novaOrbOrbit} />
          <div className={styles.novaOrbCore} />
          <div className={styles.novaOrbNode} />
          <div className={styles.novaOrbNode} />
          <div className={styles.novaOrbNode} />
        </div>

        {/* Copy */}
        <div className={styles.novaOrbCopy}>
          <div className={styles.novaDeckEyebrow}>NOVAMASTER EMPIRE</div>
          <h2 style={{
            fontSize: 22, fontWeight: 800, margin: '2px 0 4px',
            background: 'var(--nova-gradient-primary)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Mission Control
          </h2>
          <p style={{
            fontSize: 12, color: 'var(--text-secondary)',
            margin: 0, lineHeight: 1.5, maxWidth: 340,
          }}>
            {stack ? (
              <>
                <span className='nova-live-indicator' style={{ marginRight: 8 }}>LIVE</span>
                {telemetry.servicesOnline}/{telemetry.servicesTotal} services online ·
                {telemetry.agentsWorking} agents working ·
                {stack?.autopilot === 'auto' ? 'Autopilot engaged' : 'Manual control'}
              </>
            ) : error ? (
              <span style={{ color: 'var(--nova-danger)' }}>{error}</span>
            ) : (
              'Connecting to Empire...'
            )}
          </p>

          {/* Quick nav */}
          <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
            <button className='nova-btn nova-btn-primary' onClick={() => navigate('/office')}>
              <HomeTwo theme='outline' size={16} /> 3D Office
            </button>
            <button className='nova-btn' onClick={() => setActivePanel(activePanel === 'openclaw' ? 'dashboard' : 'openclaw')}>
              <Command theme='outline' size={16} /> OpenClaw
            </button>
            <button className='nova-btn' onClick={() => setActivePanel(activePanel === 'spaceagent' ? 'dashboard' : 'spaceagent')}>
              <Browser theme='outline' size={16} /> Space Agent
            </button>
            <button className='nova-btn' onClick={() => navigate('/settings')}>
              <SettingConfig theme='outline' size={16} /> Settings
            </button>
          </div>
        </div>

        {/* Stats grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 8,
          alignContent: 'start',
          paddingTop: 4,
        }}>
          <StatPill label="CPU" value={`${telemetry.cpu}%`} accent={telemetry.cpu > 80 ? 'red' : telemetry.cpu > 50 ? 'cyan' : 'gold'} />
          <StatPill label="Memory" value={`${telemetry.memory}%`} accent={telemetry.memory > 80 ? 'red' : 'cyan'} />
          <StatPill label="Disk" value={`${telemetry.disk}%`} accent={telemetry.disk > 80 ? 'red' : 'gold'} />
          <StatPill label="Uptime" value={`${telemetry.uptime}h`} accent="green" />
        </div>

        {/* Detail bars */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 8,
          paddingTop: 4, gridColumn: '1 / -1',
        }}>
          <MetricBar label="CPU Load" value={telemetry.cpu} accent="gold" />
          <MetricBar label="Memory" value={telemetry.memory} accent="cyan" />
          <MetricBar label="Disk" value={telemetry.disk} accent={telemetry.disk > 80 ? 'red' : 'green'} />
        </div>

        {/* Bottom: Financial */}
        <div style={{
          gridColumn: '1 / -1',
          display: 'flex', gap: 12, paddingTop: 4,
          justifyContent: 'space-between', alignItems: 'center',
          fontSize: 11, color: 'var(--text-secondary)',
        }}>
          <span>Revenue: <strong style={{ color: 'var(--nova-success)' }}>${telemetry.revenue.toLocaleString()}</strong></span>
          <span>Cost: <strong style={{ color: 'var(--nova-danger)' }}>${telemetry.cost.toFixed(2)}</strong></span>
          <span>Agents: <strong style={{ color: 'var(--text-primary)' }}>{telemetry.agentsWorking}/{telemetry.agentsTotal}</strong></span>
        </div>
      </div>

      {/* ── Right: Services + Agents ── */}
      <div className={styles.novaServiceRail} style={{ position: 'relative', zIndex: 1 }}>
        {activePanel === 'openclaw' ? (
          <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className='nova-panel-header'>
              <span className='nova-panel-title'>OpenClaw Gateway</span>
              <span className='nova-panel-badge'>:18791</span>
            </div>
            <div className='nova-iframe-container' style={{ flex: 1 }}>
              <iframe src="http://localhost:18791/" title="OpenClaw" />
            </div>
          </div>
        ) : activePanel === 'spaceagent' ? (
          <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className='nova-panel-header'>
              <span className='nova-panel-title'>Space Agent</span>
              <span className='nova-panel-badge'>:3003</span>
            </div>
            <div className='nova-iframe-container' style={{ flex: 1 }}>
              <iframe src="http://localhost:3003/" title="Space Agent" />
            </div>
          </div>
        ) : (
          <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className='nova-panel-header'>
              <span className='nova-panel-title'>Empire Services</span>
              <span className='nova-live-indicator'>LIVE</span>
            </div>

            {/* Services list */}
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {priorityServices.map((svc) => (
                <ServiceChip
                  key={svc.id}
                  service={svc}
                  onClick={() => handleLaunch(svc)}
                  loading={launchingIds.has(svc.id)}
                  receipt={receipts[svc.id]}
                />
              ))}
            </div>

            {/* Agents section */}
            {(stack?.agents?.length ?? 0) > 0 && (
              <>
                <div className='nova-panel-header'>
                  <span className='nova-panel-title'>Agents</span>
                  <span className='nova-panel-badge'>
                    {stack!.agents.filter(a => a.status !== 'offline').length} total · {stack!.agents.filter(a => a.status === 'working').length} working
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflow: 'auto' }}>
                  {stack!.agents.filter(a => a.status !== 'offline').map((agent) => (
                    <AgentChip key={agent.id} agent={agent} />
                  ))}
                </div>
              </>
            )}

            {/* Hermes status */}
            <div style={{
              marginTop: 'auto', padding: '10px 0 0',
              borderTop: '1px solid rgba(217,164,49,0.12)',
              display: 'flex', justifyContent: 'space-between',
              fontSize: 11, color: 'var(--text-secondary)',
            }}>
              <span>Hermes v0.13.0 · Autopilot: {stack?.autopilot || 'manual'}</span>
              <span>{stack?.updatedAt ? new Date(stack.updatedAt).toLocaleTimeString() : '--:--:--'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NovaMissionControl;
