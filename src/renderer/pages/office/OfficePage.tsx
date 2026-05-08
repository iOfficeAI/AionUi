/**
 * NovaMaster 3D Office — Immersive command center with live dashboard
 * Renders Three.js scene with agent avatars, service nodes, and real-time telemetry.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import Claw3dEmbed from './components/Claw3dEmbed';
import SpaceAgentPanel from '../guid/components/SpaceAgentPanel';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentData {
  id: string;
  name: string;
  status: 'idle' | 'working' | 'error' | 'offline';
  model?: string;
  task?: string;
  cost_today?: number;
  revenue_impact?: number;
  room?: string;
  progress?: number;
}

interface ServiceData {
  name: string;
  port: number;
  status: 'healthy' | 'degraded' | 'down';
}

interface DashboardSnapshot {
  stats: {
    cpu_percent: number;
    memory_percent: number;
    disk_percent: number;
    uptime_hours: number;
  };
  services: Record<string, ServiceData>;
  agents?: AgentData[];
  autopilot?: { mode: string };
  revenue?: number;
}

const BACKEND_URL = 'http://127.0.0.1:8095';

// ─── Color palette ───────────────────────────────────────────────────────────

const COLORS = {
  bg: 0x0a0a0f,
  grid: 0x1a1a2e,
  accent: 0x00ccff,
  accentAlt: 0xff6b35,
  gold: 0xd9a431,
  green: 0x00ff88,
  red: 0xff3355,
  amber: 0xffaa00,
  white: 0xffffff,
  dim: 0x444466,
};

// ─── 3D Scene ────────────────────────────────────────────────────────────────

const useThreeScene = (
  mountRef: React.RefObject<HTMLDivElement | null>,
  agents: AgentData[],
  services: Record<string, ServiceData>,
  stats: DashboardSnapshot['stats'] | null
) => {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const agentsGroupRef = useRef<THREE.Group | null>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.bg);
    scene.fog = new THREE.FogExp2(COLORS.bg, 0.00015);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(60, el.clientWidth / el.clientHeight, 1, 200);
    camera.position.set(20, 14, 22);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    el.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambient = new THREE.AmbientLight(0x222244, 2.5);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 3);
    key.position.set(15, 25, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 100;
    key.shadow.camera.left = -30;
    key.shadow.camera.right = 30;
    key.shadow.camera.top = 30;
    key.shadow.camera.bottom = -30;
    scene.add(key);

    const rim = new THREE.DirectionalLight(COLORS.accent, 1.5);
    rim.position.set(-10, 5, -8);
    scene.add(rim);

    // Floor grid
    const gridHelper = new THREE.PolarGridHelper(18, 64, 32, 128, COLORS.grid, COLORS.grid);
    scene.add(gridHelper);

    // Circular floor disc
    const discGeom = new THREE.CylinderGeometry(16, 16, 0.05, 64);
    const discMat = new THREE.MeshStandardMaterial({
      color: COLORS.grid,
      roughness: 0.9,
      metalness: 0.3,
    });
    const disc = new THREE.Mesh(discGeom, discMat);
    disc.position.y = -0.05;
    disc.receiveShadow = true;
    scene.add(disc);

    // Outer ring
    const ringGeom = new THREE.TorusGeometry(16.5, 0.08, 16, 128);
    const ringMat = new THREE.MeshStandardMaterial({ color: COLORS.accent, emissive: COLORS.accent, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.8 });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    scene.add(ring);

    // Inner accent ring
    const innerRingGeom = new THREE.TorusGeometry(14, 0.04, 16, 96);
    const innerRing = new THREE.Mesh(innerRingGeom, ringMat.clone());
    innerRing.material = new THREE.MeshStandardMaterial({ color: COLORS.gold, emissive: COLORS.gold, emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.9 });
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.02;
    scene.add(innerRing);

    // Center pillar / core
    const coreGeom = new THREE.CylinderGeometry(0.6, 0.8, 4, 32);
    const coreMat = new THREE.MeshStandardMaterial({
      color: COLORS.accent,
      emissive: COLORS.accent,
      emissiveIntensity: 0.8,
      roughness: 0.1,
      metalness: 0.9,
    });
    const core = new THREE.Mesh(coreGeom, coreMat);
    core.position.y = 2;
    core.castShadow = true;
    core.receiveShadow = true;
    scene.add(core);

    // Core top glow sphere
    const glowGeom = new THREE.SphereGeometry(0.7, 32, 32);
    const glowMat = new THREE.MeshBasicMaterial({ color: COLORS.accent, transparent: true, opacity: 0.3 });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    glow.position.y = 4.2;
    scene.add(glow);

    // Particle ring around core
    const particlesGroup = new THREE.Group();
    const particleGeom = new THREE.SphereGeometry(0.06, 8, 8);
    const particleMat = new THREE.MeshBasicMaterial({ color: COLORS.accent });
    for (let i = 0; i < 80; i++) {
      const angle = (i / 80) * Math.PI * 2;
      const radius = 1.4 + Math.random() * 0.3;
      const y = 1 + Math.random() * 2.5;
      const p = new THREE.Mesh(particleGeom, particleMat);
      p.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      particlesGroup.add(p);
    }
    scene.add(particlesGroup);

    // Agent pedestals group
    const agentsGroup = new THREE.Group();
    scene.add(agentsGroup);
    agentsGroupRef.current = agentsGroup;

    // Animate
    const clock = new THREE.Clock();
    const animate = () => {
      const t = clock.getElapsedTime();

      // Gentle camera orbit
      camera.position.x = Math.cos(t * 0.08) * 22;
      camera.position.z = Math.sin(t * 0.08) * 22;
      camera.position.y = 13 + Math.sin(t * 0.15) * 2;
      camera.lookAt(0, 1.5, 0);

      // Rotate particles
      particlesGroup.rotation.y += 0.005;

      // Pulsate glow
      const pulse = 1 + Math.sin(t * 2) * 0.2;
      glow.scale.setScalar(pulse);
      glow.material.opacity = 0.2 + Math.sin(t * 2) * 0.1;

      // Pulsate rings
      ring.scale.setScalar(1 + Math.sin(t * 1.5) * 0.005);
      innerRing.scale.setScalar(1 + Math.cos(t * 1.8) * 0.008);

      core.material.emissiveIntensity = 0.6 + Math.sin(t * 3) * 0.3;

      renderer.render(scene, camera);
      animRef.current = requestAnimationFrame(animate);
    };

    animate();

    // Resize
    const handleResize = () => {
      if (!el || !camera || !renderer) return;
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (el.contains(renderer.domElement)) {
        el.removeChild(renderer.domElement);
      }
    };
  }, [mountRef]);

  // Update agents
  useEffect(() => {
    const group = agentsGroupRef.current;
    if (!group) return;

    // Clear old
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    const activeAgents = agents.filter((a) => a.status !== 'offline');
    const radius = 12;
    const count = activeAgents.length || 1;

    activeAgents.forEach((agent, i) => {
      const angle = (i / count) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      // Pedestal
      const pedestalGeom = new THREE.CylinderGeometry(0.3, 0.35, 0.5, 32);
      const colorMap: Record<string, number> = {
        working: COLORS.green,
        idle: COLORS.accent,
        error: COLORS.red,
      };
      const pedColor = colorMap[agent.status] || COLORS.dim;
      const pedMat = new THREE.MeshStandardMaterial({
        color: pedColor,
        emissive: pedColor,
        emissiveIntensity: 0.5,
        roughness: 0.2,
        metalness: 0.8,
      });
      const pedestal = new THREE.Mesh(pedestalGeom, pedMat);
      pedestal.position.set(x, 0.25, z);
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;
      pedestal.name = agent.id;
      group.add(pedestal);

      // Agent body (capsule-ish)
      const bodyGroup = new THREE.Group();
      const torsoGeom = new THREE.CapsuleGeometry(0.22, 0.8, 8, 16);
      const torsoMat = new THREE.MeshStandardMaterial({
        color: pedColor,
        roughness: 0.3,
        metalness: 0.6,
        emissive: pedColor,
        emissiveIntensity: 0.2,
      });
      const torso = new THREE.Mesh(torsoGeom, torsoMat);
      torso.position.y = 0.9;
      torso.castShadow = true;
      bodyGroup.add(torso);

      // Head
      const headGeom = new THREE.SphereGeometry(0.18, 16, 16);
      const headMat = new THREE.MeshStandardMaterial({
        color: COLORS.white,
        roughness: 0.1,
        metalness: 0.3,
        emissive: pedColor,
        emissiveIntensity: 0.1,
      });
      const head = new THREE.Mesh(headGeom, headMat);
      head.position.y = 1.55;
      head.castShadow = true;
      bodyGroup.add(head);

      // Eye glow
      const eyeGeom = new THREE.SphereGeometry(0.04, 8, 8);
      const eyeMat = new THREE.MeshBasicMaterial({ color: pedColor });
      const eye = new THREE.Mesh(eyeGeom, eyeMat);
      eye.position.set(0, 1.58, 0.17);
      bodyGroup.add(eye);
      const eye2 = eye.clone();
      eye2.position.x = -0.06;
      eye2.position.z = 0.17;
      bodyGroup.add(eye2);
      // right eye (from our perspective = agent's left)
      const eyeR = eye.clone();
      eyeR.position.x = 0.06;
      eyeR.position.z = 0.17;
      bodyGroup.add(eyeR);

      // Progress ring if working
      if (agent.status === 'working' && agent.progress != null) {
        const progGeom = new THREE.TorusGeometry(0.4, 0.03, 8, 32, agent.progress / 100 * Math.PI * 2);
        const progMat = new THREE.MeshBasicMaterial({ color: COLORS.green });
        const progRing = new THREE.Mesh(progGeom, progMat);
        progRing.rotation.x = -Math.PI / 2;
        progRing.position.y = 0.01;
        bodyGroup.add(progRing);
      }

      bodyGroup.position.set(x, 0.5, z);
      group.add(bodyGroup);

      // Floating label dot
      const dotGeom = new THREE.RingGeometry(0.04, 0.07, 32);
      const dotMat = new THREE.MeshBasicMaterial({ color: pedColor, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
      const dot = new THREE.Mesh(dotGeom, dotMat);
      dot.position.set(x, 2.2, z);
      dot.name = `label_${agent.id}`;
      group.add(dot);
    });
  }, [agents]);

  // Update services
  useEffect(() => {
    const group = agentsGroupRef.current;
    if (!group || !services) return;

    const serviceList = Object.entries(services).filter(
      ([, s]) => s.status === 'healthy' || s.status === 'degraded'
    );
    const outerRadius = 16;
    serviceList.forEach(([id, svc], i) => {
      const angle = (i / Math.max(serviceList.length, 1)) * Math.PI * 2 + 0.3;
      const x = Math.cos(angle) * outerRadius;
      const z = Math.sin(angle) * outerRadius;

      const sColor = svc.status === 'healthy' ? COLORS.accent : svc.status === 'degraded' ? COLORS.amber : COLORS.dim;
      const nodeGeom = new THREE.SphereGeometry(0.12, 16, 16);
      const nodeMat = new THREE.MeshStandardMaterial({
        color: sColor,
        emissive: sColor,
        emissiveIntensity: 0.6,
        roughness: 0.15,
        metalness: 0.85,
      });
      const node = new THREE.Mesh(nodeGeom, nodeMat);
      node.position.set(x, 0.15, z);
      node.name = `svc_${id}`;
      group.add(node);
    });
  }, [services]);
};

// ─── Component ───────────────────────────────────────────────────────────────

const OfficePage: React.FC = () => {
  const navigate = useNavigate();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [autopilot, setAutopilot] = useState<string>('manual');
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  const [sseStatus, setSseStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  // Fetch dashboard
  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/dashboard`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DashboardSnapshot = await res.json();
      setSnapshot(data);
      setLastUpdate(Date.now());
    } catch (e) {
      // SSE fallback — silent
    }
  }, []);

  // Fetch agents separately — backend returns {data: {agent_id: {...}}}
  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/agents`);
      if (res.ok) {
        const data = await res.json();
        const raw = data?.data || data?.agents || data;
        if (typeof raw === 'object' && !Array.isArray(raw)) {
          const list = Object.values(raw).map((a: any, i: number) => ({
            id: a.name?.toLowerCase() || `agent_${i}`,
            name: a.name || `Agent ${i + 1}`,
            status: a.status === 'active' ? 'working' : a.status || 'idle',
            model: a.model,
            task: a.task,
            cost_today: a.cost_today,
            revenue_impact: a.revenue_impact,
            room: a.room,
            progress: a.progress,
          }));
          setAgents(list);
        } else if (Array.isArray(raw)) {
          setAgents(raw);
        }
      }
    } catch {}
  }, []);

  // SSE stream
  useEffect(() => {
    fetchDashboard();
    fetchAgents();

    const evtSource = new EventSource(`${BACKEND_URL}/events/stream`);
    evtSource.onopen = () => setSseStatus('connected');
    evtSource.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.type === 'dashboard') setSnapshot(payload.data);
        if (payload.type === 'agents') setAgents(payload.data || []);
        if (payload.type === 'autopilot') setAutopilot(payload.data?.mode || 'manual');
        setLastUpdate(Date.now());
      } catch {}
    };
    evtSource.onerror = () => {
      setSseStatus('disconnected');
      evtSource.close();
    };

    // Poll fallback every 5s
    const poll = setInterval(() => {
      if (sseStatus !== 'connected') {
        fetchDashboard();
        fetchAgents();
      }
    }, 5000);

    return () => {
      evtSource.close();
      clearInterval(poll);
    };
  }, [fetchAgents, fetchDashboard, sseStatus]);

  // Three scene
  useThreeScene(
    mountRef,
    agents,
    snapshot?.services || {},
    snapshot?.stats || null
  );

  // Derived
  const onlineAgents = agents.filter((a) => a.status !== 'offline').length;
  const workingAgents = agents.filter((a) => a.status === 'working').length;
  const totalCost = agents.reduce((sum, a) => sum + (a.cost_today || 0), 0);
  const totalRevenue = agents.reduce((sum, a) => sum + (a.revenue_impact || 0), 0);

  const serviceCounts = useMemo(() => {
    const svcs = snapshot?.services || {};
    let healthy = 0, degraded = 0, down = 0;
    Object.values(svcs).forEach((s) => {
      if (s.status === 'healthy') healthy++;
      else if (s.status === 'degraded') degraded++;
      else down++;
    });
    return { healthy, degraded, down };
  }, [snapshot]);

  const handleAutopilot = useCallback(async (mode: string) => {
    try {
      await fetch(`${BACKEND_URL}/autopilot/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      setAutopilot(mode);
    } catch {}
  }, []);

  const handleEmergencyStop = useCallback(async () => {
    try {
      await fetch(`${BACKEND_URL}/emergency-stop`, { method: 'POST' });
      setAutopilot('stopped');
    } catch {}
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: '#0a0a0f' }}>
      {/* 3D Canvas */}
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />

      {/* HUD overlay */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '20px 24px',
      }}>
        {/* Top bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          pointerEvents: 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              fontSize: 22,
              fontWeight: 700,
              color: '#d9a431',
              textShadow: '0 0 20px rgba(217, 164, 49, 0.4)',
              letterSpacing: 1,
            }}>
              ▸ NovaMaster Office
            </span>
            <span style={{
              fontSize: 11,
              color: '#666',
              background: 'rgba(0,0,0,0.5)',
              borderRadius: 6,
              padding: '2px 8px',
              border: '1px solid #222',
            }}>
              SSE {sseStatus === 'connected' ? '🟢 LIVE' : sseStatus === 'connecting' ? '🟡 Connecting' : '🔴 Polling'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
            {autopilot !== 'stopped' && (
              <>
                <button
                  onClick={() => handleAutopilot(autopilot === 'auto' ? 'manual' : 'auto')}
                  style={{
                    background: autopilot === 'auto' ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${autopilot === 'auto' ? '#00ff88' : '#333'}`,
                    color: autopilot === 'auto' ? '#00ff88' : '#aaa',
                    borderRadius: 8,
                    padding: '6px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  {autopilot === 'auto' ? '⚡ AUTOPILOT ON' : 'AUTOPILOT'}
                </button>
                <button
                  onClick={handleEmergencyStop}
                  style={{
                    background: 'rgba(255,51,85,0.12)',
                    border: '1px solid #ff3355',
                    color: '#ff3355',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    backdropFilter: 'blur(8px)',
                    textTransform: 'uppercase',
                  }}
                >
                  STOP
                </button>
              </>
            )}
          </div>
        </div>

        {/* Bottom dashboard */}
        <div style={{
          display: 'flex',
          gap: 16,
          pointerEvents: 'auto',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}>
          {/* Stats cards */}
          <DashboardCard label="CPU" value={`${snapshot?.stats?.cpu_percent?.toFixed(0) || '--'}%`} color="#00ccff" />
          <DashboardCard label="RAM" value={`${snapshot?.stats?.memory_percent?.toFixed(0) || '--'}%`} color="#ff6b35" />
          <DashboardCard label="Disk" value={`${snapshot?.stats?.disk_percent?.toFixed(0) || '--'}%`} color="#d9a431" />
          <DashboardCard label="Services" value={`${serviceCounts.healthy}/${serviceCounts.healthy + serviceCounts.degraded + serviceCounts.down}`} color="#00ff88" />
          <DashboardCard label="Agents" value={`${onlineAgents}`} color="#00ccff" sub={`${workingAgents} active`} />
          <DashboardCard label="Cost Today" value={`$${totalCost.toFixed(2)}`} color="#ffaa00" />
          <DashboardCard label="Revenue" value={`$${totalRevenue.toLocaleString()}`} color="#00ff88" />
          <DashboardCard label="Uptime" value={`${snapshot?.stats?.uptime_hours?.toFixed(1) || '0'}h`} color="#888" />
        </div>

        {/* Claw3D + Space Agent embeds */}
        <div style={{ pointerEvents: 'auto', marginTop: 20, display: 'flex', gap: 16, width: '100%', maxWidth: 1400, alignSelf: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          <div style={{ flex: '1 1 500px', minWidth: 400, maxWidth: 900 }}>
            <Claw3dEmbed port={9120} />
          </div>
          <div style={{ flex: '1 1 350px', minWidth: 320, maxWidth: 450 }}>
            <SpaceAgentPanel port={3003} height={600} />
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Dashboard card ──────────────────────────────────────────────────────────

const DashboardCard: React.FC<{ label: string; value: string; color: string; sub?: string }> = ({
  label,
  value,
  color,
  sub,
}) => (
  <div style={{
    background: 'rgba(10,10,20,0.75)',
    backdropFilter: 'blur(16px)',
    border: `1px solid ${color}33`,
    borderRadius: 12,
    padding: '10px 16px',
    minWidth: 90,
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  }}>
    <span style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
    <span style={{ fontSize: 22, fontWeight: 700, color, textShadow: `0 0 12px ${color}44` }}>{value}</span>
    {sub && <span style={{ fontSize: 10, color: '#555' }}>{sub}</span>}
  </div>
);

export default OfficePage;
