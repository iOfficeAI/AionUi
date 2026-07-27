/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * The three onboarding pages (scan / derive / memory). Each is a presentational
 * component driven by props; the parent OpeningGuide owns timing and data.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OnboardingAssistant, ScannedTool } from '../hooks/useOnboardingData';
import { CheckGlyph, SwapGlyph } from './Icons';
import { AssistantAvatar, ToolLogo } from './Media';
import styles from '../index.module.css';

const cx = (...cls: Array<string | false | undefined>) => cls.filter(Boolean).join(' ');

/* ============================ Page 1: Scan ============================ */

export const ScanStep: React.FC<{ tools: ScannedTool[]; hasExternalTools: boolean }> = ({
  tools,
  hasExternalTools,
}) => {
  const { t } = useTranslation();
  const externals = tools.filter((tool) => !tool.builtin);
  const builtin = tools.find((tool) => tool.builtin);
  const [visibleCount, setVisibleCount] = useState(0);
  const [done, setDone] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleCount(0);
    setDone(false);
    // Adaptive cadence: keep the whole reveal within ~3.5s regardless of how
    // many tools are installed (a heavy machine can have 15+).
    const step = Math.max(120, Math.min(480, Math.round(3200 / Math.max(externals.length, 1))));
    const timers: ReturnType<typeof setTimeout>[] = [];
    externals.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleCount(i + 1), 420 + i * step));
    });
    timers.push(setTimeout(() => setDone(true), 420 + externals.length * step + 300));
    return () => timers.forEach(clearTimeout);
  }, [tools.length, hasExternalTools]);

  // Stay anchored at the top: rows reveal first-to-last in reading order and
  // the scrollbar is the affordance for the overflow (no auto-follow).
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = 0;
  }, [tools.length]);

  const title = !hasExternalTools
    ? t('onboarding.scan.titleEmpty', { defaultValue: '没装别的工具？照样开箱即用' })
    : done
      ? t('onboarding.scan.titleDone', { defaultValue: '你装的 AI 工具，它都认识' })
      : t('onboarding.scan.title', { defaultValue: '正在扫描你的本地工具…' });
  const desc = !hasExternalTools
    ? t('onboarding.scan.descEmpty', {
        defaultValue:
          'AionUi 自带一个 AionCLI，开箱即用。以后你装了 Claude Code、Codex 之类的工具，也会随时被认出、接进来。',
      })
    : t('onboarding.scan.desc', { defaultValue: '已装的工具不用重新配置，直接接管——加上内置 AionCLI，开箱即用。' });

  return (
    <>
      <div className={styles.kick}>{t('onboarding.scan.kick', { defaultValue: '正在认识你的电脑' })}</div>
      <div className={styles.scanwrap}>
        <span className={styles.scanpulse} />
        <span className={cx(styles.scanpulse, styles.scanpulse2)} />
        <span className={cx(styles.scanpulse, styles.scanpulse3)} />
        <div className={styles.scanbox}>
          <div className={styles.scanhd}>
            {hasExternalTools && !done ? <span className={styles.radar} /> : null}
            <span>
              {hasExternalTools
                ? done
                  ? t('onboarding.scan.finished', { defaultValue: '扫描完成' })
                  : t('onboarding.scan.scanning', { defaultValue: '正在扫描本地的 AI 工具…' })
                : t('onboarding.scan.none', { defaultValue: '没有找到其它 AI 工具' })}
            </span>
          </div>

          <div ref={listRef} className={styles.scanlist}>
            {builtin ? (
              <div className={cx(styles.clirow, styles.clirowBuiltin, styles.clirowIn)}>
                <ToolLogo src={builtin.logo} />
                <span className={styles.nm}>
                  {builtin.name}
                  <span className={styles.ver}>{t('onboarding.scan.builtinTag', { defaultValue: '内置引擎' })}</span>
                </span>
                <span className={styles.role}>{t('onboarding.scan.bundled', { defaultValue: '自带' })}</span>
              </div>
            ) : null}

            {externals.map((tool, i) => (
              <div key={tool.backend} className={cx(styles.clirow, i < visibleCount && styles.clirowIn)}>
                <ToolLogo src={tool.logo} />
                <span className={styles.nm}>
                  {tool.name}
                  {tool.version ? <span className={styles.ver}>{tool.version}</span> : null}
                </span>
                <span className={styles.chk}>
                  <CheckGlyph />
                </span>
              </div>
            ))}
          </div>

          <div className={cx(styles.scanCount, (done || !hasExternalTools) && styles.scanCountIn)}>
            <span className={styles.dotok} />
            <span>
              {hasExternalTools
                ? t('onboarding.scan.count', {
                    count: tools.length,
                    defaultValue: `共 ${tools.length} 个已就位（含内置 AionCLI）`,
                  })
                : t('onboarding.scan.countEmpty', { defaultValue: '内置 AionCLI 已就位，随时可用' })}
            </span>
          </div>
        </div>
      </div>
      <h2 className={styles.ttl}>{title}</h2>
      <p className={styles.sub}>{desc}</p>
    </>
  );
};

/* ============================ Page 2: Derive ============================ */

type DeriveProps = {
  starTool: ScannedTool | undefined;
  starLogo: string | null;
  seedAssistant: OnboardingAssistant | undefined;
  buddies: OnboardingAssistant[];
};

// Fixed layout positions (relative to the 580x290 swarm box) for up to 6 buddies.
// Responsive scene: wide windows read left-to-right (tool → assistant card),
// narrow/mobile windows read top-to-bottom (tool pulls a wire DOWN to the
// assistant, specialists fan out below). Both share the same DOM; a matchMedia
// hook picks the coordinate set.
type SwarmLayout = {
  width: number;
  height: number;
  /** Where the main tool→assistant wire lands on the seed card. */
  seedAnchor: { x: number; y: number };
  /** Where buddy wires radiate from on the seed card. */
  buddyOrigin: { x: number; y: number };
  buddies: Array<{ x: number; y: number }>;
  /** Main wire path from the tool logo edge to the seed anchor. */
  mainWire: (x1: number, y1: number) => string;
  /** Which edge of the tool logo the main wire starts from. */
  wireStart: (rect: DOMRect, swarm: DOMRect) => { x: number; y: number };
};

const LAYOUT_H: SwarmLayout = {
  width: 580,
  height: 300,
  seedAnchor: { x: 374, y: 150 },
  buddyOrigin: { x: 400, y: 142 },
  buddies: [
    { x: 300, y: 44 },
    { x: 500, y: 36 },
    { x: 250, y: 254 },
    { x: 400, y: 268 },
    { x: 545, y: 250 },
  ],
  mainWire: (x1, y1) => `M ${x1} ${y1} C ${(x1 + 374) / 2} ${y1}, ${(x1 + 374) / 2} 150, 374 150`,
  wireStart: (rect, swarm) => ({ x: rect.right - swarm.left, y: rect.top + rect.height / 2 - swarm.top }),
};

const LAYOUT_V: SwarmLayout = {
  width: 560,
  height: 400,
  seedAnchor: { x: 280, y: 168 },
  buddyOrigin: { x: 280, y: 272 },
  buddies: [
    { x: 80, y: 216 },
    { x: 480, y: 216 },
    { x: 150, y: 340 },
    { x: 280, y: 358 },
    { x: 410, y: 340 },
  ],
  mainWire: (x1, y1) => `M ${x1} ${y1} C ${x1} ${(y1 + 168) / 2}, 280 ${(y1 + 168) / 2}, 280 168`,
  wireStart: (rect, swarm) => ({ x: rect.left + rect.width / 2 - swarm.left, y: rect.bottom - swarm.top }),
};

const VERTICAL_MQ = '(max-width: 760px)';

const useVerticalLayout = (): boolean => {
  // matchMedia may be absent in non-browser environments (e.g. jsdom tests).
  const canMatch = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [vertical, setVertical] = useState(() => (canMatch ? window.matchMedia(VERTICAL_MQ).matches : false));
  useEffect(() => {
    if (!canMatch) return;
    const mq = window.matchMedia(VERTICAL_MQ);
    const onChange = (e: MediaQueryListEvent) => setVertical(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [canMatch]);
  return vertical;
};

/** Quadratic curve from the seed card to a buddy, with a slight bow. */
const buddyWireD = (layout: SwarmLayout, x: number, y: number, i: number, vertical: boolean) => {
  const ox = layout.buddyOrigin.x;
  const oy = layout.buddyOrigin.y;
  const midx = (ox + x) / 2 + (vertical ? (i % 2 ? 14 : -14) : 0);
  const midy = (oy + y) / 2 + (vertical ? 0 : i % 2 ? 18 : -18);
  return `M ${ox} ${oy} Q ${midx} ${midy} ${x} ${y}`;
};

export const DeriveStep: React.FC<DeriveProps> = ({ starTool, starLogo, seedAssistant, buddies }) => {
  const { t } = useTranslation();
  const vertical = useVerticalLayout();
  const layout = vertical ? LAYOUT_V : LAYOUT_H;
  const swarmRef = useRef<HTMLDivElement>(null);
  const srcRef = useRef<HTMLDivElement>(null);
  const [wireD, setWireD] = useState('');
  const [wireLen, setWireLen] = useState(0);
  const [drawn, setDrawn] = useState(false);
  const [grown, setGrown] = useState(false);
  const [buddyIn, setBuddyIn] = useState<number>(0);
  const pathRef = useRef<SVGPathElement>(null);

  const shown = buddies.slice(0, layout.buddies.length);

  // Compute the main wire (tool -> assistant) from real layout, with a
  // 0-width retry guard per project animation guidance.
  useLayoutEffect(() => {
    let raf = 0;
    const compute = () => {
      const swarm = swarmRef.current;
      const src = srcRef.current?.querySelector(`.${styles.toollogo}`) as HTMLElement | null;
      if (!swarm || !src) return;
      const sw = swarm.getBoundingClientRect();
      if (sw.width === 0) {
        raf = requestAnimationFrame(compute);
        return;
      }
      const start = layout.wireStart(src.getBoundingClientRect(), sw);
      setWireD(layout.mainWire(start.x, start.y));
    };
    compute();
    return () => cancelAnimationFrame(raf);
  }, [starTool?.backend, layout]);

  useEffect(() => {
    // getTotalLength is missing on jsdom's SVGPathElement; guard defensively.
    const path = pathRef.current;
    if (path && typeof path.getTotalLength === 'function') setWireLen(path.getTotalLength());
  }, [wireD]);

  useEffect(() => {
    setDrawn(false);
    setGrown(false);
    setBuddyIn(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setDrawn(true), 260));
    timers.push(setTimeout(() => setGrown(true), 880));
    shown.forEach((_, i) => timers.push(setTimeout(() => setBuddyIn((n) => Math.max(n, i + 1)), 1260 + i * 140)));
    return () => timers.forEach(clearTimeout);
  }, [starTool?.backend, shown.length, layout]);

  return (
    <>
      <div className={styles.kick}>{t('onboarding.derive.kick', { defaultValue: '它们不只是工具' })}</div>
      <div
        ref={swarmRef}
        className={cx(styles.swarm, vertical && styles.swarmV)}
        style={{ width: layout.width, height: layout.height }}
      >
        <svg className={cx(styles.wire, drawn && styles.wireDraw)}>
          <path ref={pathRef} d={wireD} style={{ strokeDasharray: wireLen, strokeDashoffset: drawn ? 0 : wireLen }} />
          {shown.map((buddy, i) => (
            // pathLength=1 normalizes dash units so no length measuring is needed.
            <path
              key={buddy.id}
              className={styles.buddyWire}
              d={buddyWireD(layout, layout.buddies[i].x, layout.buddies[i].y, i, vertical)}
              pathLength={1}
              style={{
                strokeDasharray: 1,
                strokeDashoffset: grown && i < buddyIn ? 0 : 1,
                transitionDelay: `${i * 0.08}s`,
              }}
            />
          ))}
        </svg>
        {wireD ? (
          <span className={cx(styles.flow, drawn && styles.flowRun)} style={{ offsetPath: `path('${wireD}')` }} />
        ) : null}

        <div ref={srcRef} className={styles.src}>
          <ToolLogo src={starLogo} />
          <div className={styles.srcName}>{starTool?.name ?? 'AionCLI'}</div>
          <div className={styles.srcSub}>{t('onboarding.derive.starSub', { defaultValue: '你的命令行工具' })}</div>
        </div>

        <div className={cx(styles.seed, grown && styles.seedGrown)}>
          <div className={styles.seedR1}>
            {seedAssistant ? <AssistantAvatar avatar={seedAssistant.avatar} /> : null}
            <div>
              <div className={styles.seedNm}>
                {seedAssistant?.name ?? t('onboarding.derive.yourAssistant', { defaultValue: '你的助手' })}
              </div>
              <span className={styles.seedTag}>{t('onboarding.derive.tag', { defaultValue: '专属助手' })}</span>
            </div>
          </div>
          <div className={styles.seedK}>
            <SwapGlyph />
            {t('onboarding.derive.seedNote', { defaultValue: '为你干活的专家 · 随时切换工具' })}
          </div>
        </div>

        {shown.map((buddy, i) => (
          <div
            key={buddy.id}
            className={cx(styles.buddy, i < buddyIn && styles.buddyIn)}
            style={{ left: layout.buddies[i].x, top: layout.buddies[i].y }}
          >
            <AssistantAvatar avatar={buddy.avatar} />
            <div className={styles.buddyLbl}>{buddy.name}</div>
          </div>
        ))}
      </div>
      <h2 className={styles.ttl}>{t('onboarding.derive.title', { defaultValue: '不只是工具，还能是你的专属助手' })}</h2>
      <p className={styles.sub}>
        {t('onboarding.derive.desc', { defaultValue: '每个助手都是一位专家——研发、办公、设计、写作，各管一摊。' })}
      </p>
    </>
  );
};

/* ============================ Page 3: Memory ============================ */

type MemoryProps = {
  owner: OnboardingAssistant | undefined;
  engineCycle: Array<{ name: string; logo: string | null; pending: boolean }>;
};

export const MemoryStep: React.FC<MemoryProps> = ({ owner, engineCycle }) => {
  const { t } = useTranslation();
  const lines = [
    t('onboarding.memory.line1', { defaultValue: '擅长商务极简风演示' }),
    t('onboarding.memory.line2', { defaultValue: '配色跟随公司品牌色' }),
    t('onboarding.memory.line3', { defaultValue: '每页不超过三个要点' }),
  ];
  const [lineIn, setLineIn] = useState(0);
  const [engIdx, setEngIdx] = useState(0);
  const [flip, setFlip] = useState(false);

  useEffect(() => {
    setLineIn(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    lines.forEach((_, i) => timers.push(setTimeout(() => setLineIn((n) => Math.max(n, i + 1)), 400 + i * 220)));
    return () => timers.forEach(clearTimeout);
  }, [owner?.id]);

  useEffect(() => {
    if (engineCycle.length <= 1) return;
    let idx = 0;
    const interval = setInterval(() => {
      setFlip(true);
      setTimeout(() => {
        idx = (idx + 1) % engineCycle.length;
        setEngIdx(idx);
        setFlip(false);
      }, 280);
    }, 1700);
    return () => clearInterval(interval);
  }, [engineCycle.length]);

  const eng = engineCycle[engIdx] ?? engineCycle[0];

  return (
    <>
      <div className={styles.kick}>{t('onboarding.memory.kick', { defaultValue: '你的专属助手' })}</div>
      <div className={styles.nb}>
        <div className={styles.nbBook}>
          <div className={styles.nbOwner}>
            {owner ? <AssistantAvatar avatar={owner.avatar} /> : null}
            <div>
              <div className={styles.nbName}>
                {owner?.name ?? t('onboarding.memory.ownerFallback', { defaultValue: '你的助手' })}
              </div>
              <div className={styles.nbRole}>{t('onboarding.memory.ownerRole', { defaultValue: '它的能力设定' })}</div>
            </div>
          </div>
          {lines.map((line, i) => (
            <div key={line} className={cx(styles.nbLine, i < lineIn && styles.nbLineIn)}>
              <span className={styles.pen}>
                <CheckGlyph />
              </span>
              {line}
            </div>
          ))}
          <div className={styles.nbEngine}>
            <span className={styles.nbEngineLabel}>
              {t('onboarding.memory.currentTool', { defaultValue: '当前工具' })}
            </span>
            {eng ? (
              <span className={cx(styles.nbEngineChip, flip && styles.nbEngineChipFlip)}>
                <ToolLogo src={eng.logo} />
                {eng.name}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <h2 className={styles.ttl}>{t('onboarding.memory.title', { defaultValue: '助手的效果，换个工具也不丢' })}</h2>
      <p className={styles.sub}>
        {t('onboarding.memory.desc', { defaultValue: '助手的设定和风格始终跟着你，底层工具随时切换，效果不受影响。' })}
      </p>
    </>
  );
};
