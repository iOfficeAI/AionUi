/**
 * NovaMaster 3D Office — Immersive command center with live dashboard
 * Renders Three.js scene with agent avatars, service nodes, and real-time telemetry.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import SpaceAgentPanel from '../guid/components/SpaceAgentPanel';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentData {
  id: string;
  name: string;
  status: 'idle' | 'working' | 'error' | 'offline' | 'paused';
  model?: string;
  task?: string;
  cost_today?: number;
  revenue_impact?: number;
  room?: string;
  progress?: number;
}

interface ServiceData {
  id?: string;
  name: string;
  port: number;
  status: 'healthy' | 'degraded' | 'down' | 'disabled';
  category?: string;
  optional?: boolean;
  note?: string;
}

interface SkillData {
  id: string;
  name: string;
  type?: string;
  assistant?: string;
  description?: string;
  installed?: boolean;
  status?: 'installed' | 'missing' | string;
}

interface RoomAction {
  id: string;
  label: string;
  command: string;
}

interface RoomData {
  id: string;
  name: string;
  type: string;
  position?: number[];
  color: string;
  focus?: string;
  agents?: AgentData[];
  services?: ServiceData[];
  skills?: SkillData[];
  actions?: RoomAction[];
  health?: {
    status?: string;
    healthy?: boolean;
    active_agents?: number;
    agents?: number;
    services?: number;
    down_services?: number;
    skills?: number;
    missing_skills?: number;
  };
}

interface DashboardSnapshot {
  stats: {
    cpu_percent: number;
    memory_percent: number;
    disk_percent: number;
    uptime_hours: number;
  };
  services: Record<string, ServiceData>;
  agents?: Record<string, AgentData> | AgentData[];
  rooms?: Record<string, RoomData> | RoomData[];
  skills?: Record<string, SkillData>;
  autopilot?: { mode: string };
  revenue?: number;
}

const BACKEND_URL = 'http://127.0.0.1:8095';
const DEFAULT_ROOM_ID = 'command_center';

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

const hexToNumber = (hex?: string, fallback = COLORS.accent) => {
  if (!hex) return fallback;
  const parsed = Number.parseInt(hex.replace('#', ''), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const deterministicUnit = (seed: number) => {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
};

const serviceStatusColor = (status?: ServiceData['status']) => {
  if (status === 'healthy') return '#00ff88';
  if (status === 'degraded') return '#ffaa00';
  if (status === 'disabled') return '#777777';
  return '#ff3355';
};

const serviceSubtitle = (service: ServiceData) => {
  if (service.status === 'disabled') return service.note || 'disabled';
  return service.port ? `:${service.port}` : service.status;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

const asNumber = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);

// ─── 3D Scene ────────────────────────────────────────────────────────────────

const useThreeScene = (
  mountRef: React.RefObject<HTMLDivElement | null>,
  agents: AgentData[],
  services: Record<string, ServiceData>,
  rooms: RoomData[],
  selectedRoomId: string
) => {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const agentsGroupRef = useRef<THREE.Group | null>(null);
  const servicesGroupRef = useRef<THREE.Group | null>(null);
  const roomsGroupRef = useRef<THREE.Group | null>(null);
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
      const radius = 1.4 + deterministicUnit(i + 1) * 0.3;
      const y = 1 + deterministicUnit(i + 81) * 2.5;
      const p = new THREE.Mesh(particleGeom, particleMat);
      p.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      particlesGroup.add(p);
    }
    scene.add(particlesGroup);

    // Dynamic HUD groups
    const roomsGroup = new THREE.Group();
    scene.add(roomsGroup);
    roomsGroupRef.current = roomsGroup;

    const servicesGroup = new THREE.Group();
    scene.add(servicesGroup);
    servicesGroupRef.current = servicesGroup;

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

  // Update rooms
  useEffect(() => {
    const group = roomsGroupRef.current;
    if (!group) return;

    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    const compactRooms = rooms.length ? rooms : [{
      id: DEFAULT_ROOM_ID,
      name: 'Command Center',
      type: 'core',
      color: '#FFD700',
      position: [0, 0, 0],
    }];

    compactRooms.forEach((room, i) => {
      const rawPosition = room.position || [i * 10, 0, 0];
      const fallbackAngle = (i / Math.max(compactRooms.length, 1)) * Math.PI * 2;
      const x = rawPosition.length >= 3 ? (rawPosition[0] - 22.5) * 0.48 : Math.cos(fallbackAngle) * 10;
      const z = rawPosition.length >= 3 ? rawPosition[2] * 0.52 : Math.sin(fallbackAngle) * 10;
      const isSelected = room.id === selectedRoomId;
      const hasAttention = (room.health?.down_services || 0) > 0 || (room.health?.missing_skills || 0) > 0;
      const roomColor = hasAttention ? COLORS.amber : hexToNumber(room.color, COLORS.gold);

      const roomGroup = new THREE.Group();
      roomGroup.name = `room_${room.id}`;
      roomGroup.position.set(x, 0.05, z);

      const padGeom = new THREE.CylinderGeometry(isSelected ? 1.55 : 1.2, isSelected ? 1.55 : 1.2, 0.08, 6);
      const padMat = new THREE.MeshStandardMaterial({
        color: roomColor,
        emissive: roomColor,
        emissiveIntensity: isSelected ? 0.65 : 0.25,
        roughness: 0.28,
        metalness: 0.7,
        transparent: true,
        opacity: isSelected ? 0.72 : 0.4,
      });
      const pad = new THREE.Mesh(padGeom, padMat);
      pad.receiveShadow = true;
      roomGroup.add(pad);

      const ringGeom = new THREE.TorusGeometry(isSelected ? 1.75 : 1.35, 0.035, 8, 48);
      const ringMat = new THREE.MeshBasicMaterial({ color: roomColor, transparent: true, opacity: isSelected ? 0.9 : 0.45 });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.09;
      roomGroup.add(ring);

      const beaconGeom = new THREE.ConeGeometry(0.26, 0.72, 6);
      const beaconMat = new THREE.MeshStandardMaterial({
        color: roomColor,
        emissive: roomColor,
        emissiveIntensity: isSelected ? 0.8 : 0.35,
        roughness: 0.18,
        metalness: 0.75,
      });
      const beacon = new THREE.Mesh(beaconGeom, beaconMat);
      beacon.position.y = 0.58;
      beacon.castShadow = true;
      roomGroup.add(beacon);

      group.add(roomGroup);
    });
  }, [rooms, selectedRoomId]);

  // Update services
  useEffect(() => {
    const group = servicesGroupRef.current;
    if (!group || !services) return;

    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

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

const normalizeAgentStatus = (status?: string): AgentData['status'] => {
  if (status === 'active' || status === 'working') return 'working';
  if (status === 'paused') return 'paused';
  if (status === 'error' || status === 'offline' || status === 'idle') return status;
  return 'idle';
};

const normalizeAgents = (raw: unknown): AgentData[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((entry, index) => {
        const agent = asRecord(entry);
        if (!agent) {
          return null;
        }
        return {
          id:
            asString(agent.id) || asString(agent.name)?.toLowerCase()?.replace(/\s+/g, '_') || `agent_${index}`,
          name: asString(agent.name) || `Agent ${index + 1}`,
          status: normalizeAgentStatus(asString(agent.status)),
          model: asString(agent.model),
          task: asString(agent.task),
          cost_today: Number(asNumber(agent.cost_today) || 0),
          revenue_impact: Number(asNumber(agent.revenue_impact) || 0),
          room: asString(agent.room),
          progress: asNumber(agent.progress),
        };
      })
      .filter((agent): agent is AgentData => !!agent);
  }

  const mapRaw = asRecord(raw);
  if (mapRaw) {
    return Object.entries(mapRaw).map(([id, agentEntry], index) => {
      const agent = asRecord(agentEntry);
      return {
        id: asString(agent?.id) || id || `agent_${index}`,
        name: asString(agent?.name) || id || `Agent ${index + 1}`,
        status: normalizeAgentStatus(asString(agent?.status)),
        model: asString(agent?.model),
        task: asString(agent?.task),
        cost_today: Number(asNumber(agent?.cost_today) || 0),
        revenue_impact: Number(asNumber(agent?.revenue_impact) || 0),
        room: asString(agent?.room),
        progress: asNumber(agent?.progress),
      };
    });
  }

  return [];
};

const normalizeRooms = (raw: unknown): RoomData[] => {
  if (!raw) return [];
  const list = Array.isArray(raw)
    ? raw
    : Object.entries(asRecord(raw) ?? {}).map(([id, room]) => {
        const roomRecord = asRecord(room) ?? {};
        roomRecord.id = id;
        return roomRecord;
      });

  return list.map((entry, index) => {
    const room = asRecord(entry);
    if (!room) {
      return {
        id: `room_${index}`,
        name: `Room ${index + 1}`,
        type: 'ops',
        color: '#00ccff',
      };
    }

    return {
      id: asString(room.id) || `room_${index}`,
      name: asString(room.name) || `Room ${index + 1}`,
      type: asString(room.type) || 'ops',
      position: Array.isArray(room.position) ? room.position : undefined,
      color: asString(room.color) || '#00ccff',
      focus: asString(room.focus),
      agents: normalizeAgents(room.agents),
      services: Array.isArray(room.services) ? room.services : [],
      skills: Array.isArray(room.skills) ? room.skills : [],
      actions: Array.isArray(room.actions)
        ? room.actions
        : [],
      health: asRecord(room.health),
    };
  });
};

// ─── Component ───────────────────────────────────────────────────────────────

const OfficePage: React.FC = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [autopilot, setAutopilot] = useState<string>('safe');
  const [selectedRoomId, setSelectedRoomId] = useState<string>(DEFAULT_ROOM_ID);
  const [actionReceipt, setActionReceipt] = useState<string>('');
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  const [sseStatus, setSseStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  // Fetch dashboard
  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/dashboard`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DashboardSnapshot = await res.json();
      setSnapshot(data);
      setAgents(normalizeAgents(data.agents));
      setAutopilot(data.autopilot?.mode || 'safe');
      setLastUpdate(Date.now());
    } catch {
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
        setAgents(normalizeAgents(raw));
      }
    } catch {}
  }, []);

  // SSE stream
  useEffect(() => {
    fetchDashboard();
    fetchAgents();

    const evtSource = new EventSource(`${BACKEND_URL}/events/stream`);
    evtSource.addEventListener('open', () => setSseStatus('connected'));
    evtSource.addEventListener('message', (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'snapshot') {
          setSnapshot(payload);
          setAgents(normalizeAgents(payload.agents));
          setAutopilot(payload.autopilot?.mode || 'safe');
        }
        if (payload.type === 'dashboard') {
          const data = payload.data || payload;
          setSnapshot(data);
          setAgents(normalizeAgents(data.agents));
          setAutopilot(data.autopilot?.mode || 'safe');
        }
        if (payload.type === 'agents') setAgents(normalizeAgents(payload.data || []));
        if (payload.type === 'autopilot') setAutopilot(payload.data?.mode || 'safe');
        setLastUpdate(Date.now());
      } catch {
        // ignore malformed SSE payloads
      }
    });
    evtSource.addEventListener('error', () => {
      setSseStatus('disconnected');
      evtSource.close();
    });

    // Poll fallback every 5s
    const poll = setInterval(() => {
      if (evtSource.readyState !== EventSource.OPEN) {
        fetchDashboard();
        fetchAgents();
      }
    }, 5000);

    return () => {
      evtSource.close();
      clearInterval(poll);
    };
  }, [fetchAgents, fetchDashboard]);

  const rooms = useMemo(() => normalizeRooms(snapshot?.rooms), [snapshot?.rooms]);

  useEffect(() => {
    if (!rooms.length) return;
    if (!rooms.some((room) => room.id === selectedRoomId)) {
      setSelectedRoomId(rooms[0].id);
    }
  }, [rooms, selectedRoomId]);

  // Three scene
  useThreeScene(
    mountRef,
    agents,
    snapshot?.services || {},
    rooms,
    selectedRoomId
  );

  // Derived
  const onlineAgents = agents.filter((a) => a.status !== 'offline').length;
  const workingAgents = agents.filter((a) => a.status === 'working').length;
  const totalCost = agents.reduce((sum, a) => sum + (a.cost_today || 0), 0);
  const totalRevenue = agents.reduce((sum, a) => sum + (a.revenue_impact || 0), 0);

  const serviceCounts = useMemo(() => {
    const svcs = snapshot?.services || {};
    let healthy = 0, degraded = 0, down = 0, disabled = 0;
    Object.values(svcs).forEach((s) => {
      if (s.status === 'healthy') healthy++;
      else if (s.status === 'degraded') degraded++;
      else if (s.status === 'disabled') disabled++;
      else down++;
    });
    return { healthy, degraded, down, disabled };
  }, [snapshot]);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) || rooms[0],
    [rooms, selectedRoomId]
  );

  const roomAgents = selectedRoom?.agents?.length
    ? selectedRoom.agents
    : agents.filter((agent) => agent.room === selectedRoom?.id);
  const roomServices = selectedRoom?.services || [];
  const roomSkills = selectedRoom?.skills || [];

  const handleAutopilot = useCallback(async (mode: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/autopilot/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAutopilot(mode);
      setActionReceipt(`Autopilot mode: ${mode}`);
    } catch {}
  }, []);

  const handleEmergencyStop = useCallback(async () => {
    try {
      await fetch(`${BACKEND_URL}/emergency-stop`, { method: 'POST' });
      setAutopilot('off');
      setActionReceipt('Emergency stop sent');
    } catch {}
  }, []);

  const handleRoomAction = useCallback(async (action: RoomAction) => {
    if (!selectedRoom) return;

    try {
      if (action.command === 'sync') {
        const res = await fetch(`${BACKEND_URL}/sync`, { method: 'POST' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await fetchDashboard();
        await fetchAgents();
        setActionReceipt(`${selectedRoom.name}: sync complete`);
        return;
      }

      if (action.command === 'autopilot_safe') {
        await handleAutopilot('safe');
        return;
      }

      if (action.command === 'autopilot_aggressive') {
        await handleAutopilot('aggressive');
        return;
      }

      const res = await fetch(`${BACKEND_URL}/agent/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: selectedRoom.id,
          command: action.command,
          payload: {
            room_id: selectedRoom.id,
            skills: roomSkills.map((skill) => skill.id),
            services: roomServices.map((service) => service.id || service.name),
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActionReceipt(`${selectedRoom.name}: ${action.label} queued`);
    } catch {
      setActionReceipt(`${selectedRoom.name}: action failed`);
    }
  }, [fetchAgents, fetchDashboard, handleAutopilot, roomServices, roomSkills, selectedRoom]);

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

          <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {['safe', 'approval', 'aggressive', 'off'].map((mode) => (
              <button
                key={mode}
                onClick={() => handleAutopilot(mode)}
                style={{
                  background: autopilot === mode ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${autopilot === mode ? '#00ff88' : '#333'}`,
                  color: autopilot === mode ? '#00ff88' : '#aaa',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  backdropFilter: 'blur(8px)',
                  textTransform: 'uppercase',
                }}
              >
                {mode}
              </button>
            ))}
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
          <DashboardCard label="Services" value={`${serviceCounts.healthy}/${serviceCounts.healthy + serviceCounts.degraded + serviceCounts.down}`} color="#00ff88" sub={serviceCounts.disabled ? `${serviceCounts.disabled} disabled` : undefined} />
          <DashboardCard label="Agents" value={`${onlineAgents}`} color="#00ccff" sub={`${workingAgents} active`} />
          <DashboardCard label="Cost Today" value={`$${totalCost.toFixed(2)}`} color="#ffaa00" />
          <DashboardCard label="Revenue" value={`$${totalRevenue.toLocaleString()}`} color="#00ff88" />
          <DashboardCard label="Uptime" value={`${snapshot?.stats?.uptime_hours?.toFixed(1) || '0'}h`} color="#888" />
        </div>

        {/* Room command layer + Space Agent */}
        <div style={{ pointerEvents: 'auto', marginTop: 20, display: 'flex', gap: 16, width: '100%', maxWidth: 1460, alignSelf: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          <RoomCommandPanel
            rooms={rooms}
            selectedRoomId={selectedRoomId}
            onSelectRoom={setSelectedRoomId}
            selectedRoom={selectedRoom}
            roomAgents={roomAgents}
            roomServices={roomServices}
            roomSkills={roomSkills}
            actionReceipt={actionReceipt}
            onAction={handleRoomAction}
            lastUpdate={lastUpdate}
          />
          <div style={{ flex: '0 1 430px', minWidth: 320, maxWidth: 450 }}>
            <SpaceAgentPanel port={3003} height={600} />
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Room command panel ─────────────────────────────────────────────────────

interface RoomCommandPanelProps {
  rooms: RoomData[];
  selectedRoomId: string;
  onSelectRoom: (roomId: string) => void;
  selectedRoom?: RoomData;
  roomAgents: AgentData[];
  roomServices: ServiceData[];
  roomSkills: SkillData[];
  actionReceipt: string;
  onAction: (action: RoomAction) => void;
  lastUpdate: number;
}

const RoomCommandPanel: React.FC<RoomCommandPanelProps> = ({
  rooms,
  selectedRoomId,
  onSelectRoom,
  selectedRoom,
  roomAgents,
  roomServices,
  roomSkills,
  actionReceipt,
  onAction,
  lastUpdate,
}) => {
  const displayRooms = rooms.length ? rooms : [{
    id: DEFAULT_ROOM_ID,
    name: 'Command Center',
    type: 'core',
    color: '#FFD700',
    focus: 'Waiting for Claw3D snapshot',
  }];
  const actions = selectedRoom?.actions?.length
    ? selectedRoom.actions
    : [{ id: 'brief', label: 'Room Brief', command: 'room_brief' }];
  const downServices = roomServices.filter((service) => service.status === 'down').length;
  const missingSkills = roomSkills.filter((skill) => skill.installed === false).length;

  return (
    <div style={{
      flex: '1 1 780px',
      minWidth: 360,
      maxWidth: 980,
      minHeight: 600,
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      gap: 12,
      background: 'linear-gradient(145deg, rgba(8,10,18,0.9), rgba(20,16,9,0.82))',
      border: '1px solid rgba(217,164,49,0.24)',
      borderRadius: 12,
      padding: 12,
      boxShadow: '0 18px 80px rgba(0,0,0,0.45), inset 0 0 40px rgba(217,164,49,0.04)',
      backdropFilter: 'blur(18px)',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div>
            <div style={{ color: '#d9a431', fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>Claw3D Rooms</div>
            <div style={{ color: '#666', fontSize: 10 }}>Live backend 8095</div>
          </div>
          <div style={{ color: '#777', fontSize: 10 }}>
            {Math.max(0, Math.round((Date.now() - lastUpdate) / 1000))}s
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))',
          gap: 8,
          overflowY: 'auto',
          paddingRight: 2,
        }}>
          {displayRooms.map((room) => (
            <button
              key={room.id}
              onClick={() => onSelectRoom(room.id)}
              style={{
                textAlign: 'left',
                background: room.id === selectedRoomId ? `${room.color}24` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${room.id === selectedRoomId ? room.color : 'rgba(255,255,255,0.08)'}`,
                color: '#e9e1c8',
                borderRadius: 8,
                padding: '9px 10px',
                cursor: 'pointer',
                minHeight: 74,
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 800, lineHeight: 1.2 }}>{room.name}</span>
              <span style={{ color: room.color, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>{room.type}</span>
              <span style={{ color: room.health?.healthy === false ? '#ffaa00' : '#777', fontSize: 10 }}>
                {room.health?.active_agents || 0} agents / {room.health?.skills || room.skills?.length || 0} skills
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minWidth: 0,
      }}>
        <div style={{
          background: 'rgba(0,0,0,0.28)',
          border: `1px solid ${selectedRoom?.color || '#d9a431'}44`,
          borderRadius: 10,
          padding: 14,
          minHeight: 126,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div>
              <div style={{ color: selectedRoom?.color || '#d9a431', fontSize: 20, fontWeight: 900, lineHeight: 1.15 }}>
                {selectedRoom?.name || 'Command Center'}
              </div>
              <div style={{ color: '#9d9275', fontSize: 12, marginTop: 4 }}>
                {selectedRoom?.focus || 'Room snapshot is loading'}
              </div>
            </div>
            <div style={{
              border: `1px solid ${(downServices || missingSkills) ? '#ffaa00' : '#00ff88'}66`,
              color: (downServices || missingSkills) ? '#ffaa00' : '#00ff88',
              borderRadius: 999,
              padding: '5px 9px',
              fontSize: 10,
              fontWeight: 800,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}>
              {(downServices || missingSkills) ? 'attention' : 'healthy'}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 14 }}>
            <MiniMetric label="Agents" value={`${roomAgents.length}`} color="#00ccff" />
            <MiniMetric label="Services" value={`${roomServices.length}`} color="#00ff88" />
            <MiniMetric label="Skills" value={`${roomSkills.length}`} color="#d9a431" />
            <MiniMetric label="Issues" value={`${downServices + missingSkills}`} color={downServices + missingSkills ? '#ffaa00' : '#777'} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, minHeight: 210 }}>
          <InfoColumn title="Agents">
            {(roomAgents.length ? roomAgents : [{ id: 'none', name: 'No room agents', status: 'idle' as const }]).slice(0, 5).map((agent) => (
              <InfoPill key={agent.id} title={agent.name} subtitle={agent.task || agent.model || agent.status} color={agent.status === 'working' ? '#00ff88' : agent.status === 'paused' ? '#ffaa00' : '#00ccff'} />
            ))}
          </InfoColumn>

          <InfoColumn title="Services">
            {(roomServices.length ? roomServices : [{ name: 'No mapped services', port: 0, status: 'down' as const }]).slice(0, 5).map((service) => (
              <InfoPill key={`${service.name}-${service.port}`} title={service.name} subtitle={serviceSubtitle(service)} color={serviceStatusColor(service.status)} />
            ))}
          </InfoColumn>

          <InfoColumn title="Skills">
            {(roomSkills.length ? roomSkills : [{ id: 'none', name: 'No skills mapped', installed: false }]).slice(0, 6).map((skill) => (
              <InfoPill key={skill.id} title={skill.name} subtitle={skill.assistant || skill.type || skill.status || 'skill'} color={skill.installed === false ? '#ffaa00' : '#d9a431'} />
            ))}
          </InfoColumn>
        </div>

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          paddingTop: 10,
        }}>
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => onAction(action)}
              style={{
                background: 'rgba(217,164,49,0.12)',
                border: '1px solid rgba(217,164,49,0.4)',
                color: '#f5d483',
                borderRadius: 8,
                padding: '8px 11px',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              {action.label}
            </button>
          ))}
          {actionReceipt && (
            <span style={{ color: '#888', fontSize: 11, marginLeft: 'auto' }}>{actionReceipt}</span>
          )}
        </div>
      </div>
    </div>
  );
};

const MiniMetric: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div style={{
    background: 'rgba(255,255,255,0.04)',
    border: `1px solid ${color}33`,
    borderRadius: 8,
    padding: '8px 9px',
  }}>
    <div style={{ color: '#666', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</div>
    <div style={{ color, fontSize: 18, fontWeight: 900 }}>{value}</div>
  </div>
);

const InfoColumn: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{
    background: 'rgba(255,255,255,0.035)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: 10,
    minWidth: 0,
  }}>
    <div style={{ color: '#91896f', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 8 }}>{title}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>{children}</div>
  </div>
);

const InfoPill: React.FC<{ title: string; subtitle?: string; color: string }> = ({ title, subtitle, color }) => (
  <div style={{
    borderLeft: `3px solid ${color}`,
    background: 'rgba(0,0,0,0.24)',
    borderRadius: 7,
    padding: '7px 8px',
    minWidth: 0,
  }}>
    <div style={{ color: '#e5dcc1', fontSize: 11, fontWeight: 750, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
    {subtitle && (
      <div style={{ color: '#6f6a5c', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{subtitle}</div>
    )}
  </div>
);

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
