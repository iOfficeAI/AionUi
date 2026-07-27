/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Opening guide (F-OPEN): a self-contained three-page onboarding animation,
 * backed entirely by real data (scanned local tools, real assistant avatars,
 * real tool logos). Pure renderer layer — no aionCore changes.
 *
 * Reusable by design — the component only plays the animation and calls
 * `onFinish` when the user finishes or skips. It does NOT decide whether it
 * should be shown, nor persist any "seen" flag; callers own that:
 *   - First launch: `main.tsx` gates on the `onboarding.openingGuideSeen_v1`
 *     flag, renders <OpeningGuide>, and writes the flag in `onFinish`.
 *   - Replay from Settings: render <OpeningGuideOverlay visible> and just
 *     close it in `onClose` — no flag writes, no effect on first-launch logic.
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScanStep, DeriveStep, MemoryStep } from './components/Steps';
import { useOnboardingData } from './hooks/useOnboardingData';
import styles from './index.module.css';

const cx = (...cls: Array<string | false | undefined>) => cls.filter(Boolean).join(' ');
const TOTAL = 3;

export type OpeningGuideProps = {
  /** Called when the user finishes the last page or taps "skip". */
  onFinish: () => void;
};

const OpeningGuide: React.FC<OpeningGuideProps> = ({ onFinish }) => {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const { tools, hasExternalTools, assistants, resolveLogo } = useOnboardingData();

  // Star tool = first external tool if any, else built-in AionCLI.
  const starTool = useMemo(() => tools.find((tool) => !tool.builtin) ?? tools.find((tool) => tool.builtin), [tools]);
  const starLogo = useMemo(() => (starTool ? resolveLogo(starTool.backend) : null), [starTool, resolveLogo]);

  // Assistants with real image avatars first, so faces (not emoji) lead the scene.
  const orderedAssistants = useMemo(
    () => assistants.toSorted((a, b) => Number(b.avatar.kind === 'image') - Number(a.avatar.kind === 'image')),
    [assistants]
  );
  const seedAssistant = orderedAssistants[0];
  const buddies = orderedAssistants.slice(1, 7);

  // Engine cycle for page 3: installed tools shown as current; not-yet-installed
  // ones (when the user has none) shown as "pending".
  const engineCycle = useMemo(() => {
    if (tools.length > 0)
      return tools.map((tool) => ({ name: tool.name, logo: resolveLogo(tool.backend), pending: false }));
    return [{ name: 'AionCLI', logo: null, pending: false }];
  }, [tools, resolveLogo]);

  const next = () => {
    if (page < TOTAL - 1) setPage(page + 1);
    else onFinish();
  };

  return (
    <div className={styles.root}>
      <button className={styles.skip} onClick={onFinish}>
        {t('onboarding.skip', { defaultValue: '跳过' })}
      </button>

      <div className={styles.stage}>
        <div className={styles.pages}>
          <div className={cx(styles.page, page === 0 && styles.pageOn)}>
            {page === 0 ? <ScanStep tools={tools} hasExternalTools={hasExternalTools} /> : null}
          </div>
          <div className={cx(styles.page, page === 1 && styles.pageOn)}>
            {page === 1 ? (
              <DeriveStep starTool={starTool} starLogo={starLogo} seedAssistant={seedAssistant} buddies={buddies} />
            ) : null}
          </div>
          <div className={cx(styles.page, page === 2 && styles.pageOn)}>
            {page === 2 ? <MemoryStep owner={seedAssistant} engineCycle={engineCycle} /> : null}
          </div>
        </div>
      </div>

      <div className={styles.foot}>
        <div className={styles.dots}>
          {Array.from({ length: TOTAL }, (_, i) => (
            <i key={i} className={cx(page === i && styles.dotOn)} onClick={() => setPage(i)} />
          ))}
        </div>
        <button className={styles.btn} onClick={next}>
          {page >= TOTAL - 1
            ? t('onboarding.start', { defaultValue: '开始使用' })
            : t('onboarding.next', { defaultValue: '下一步' })}
        </button>
      </div>
    </div>
  );
};

export default OpeningGuide;
