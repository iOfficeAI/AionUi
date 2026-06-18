/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pre-visible PROJECTED-SPEND meter (P0 #1) — the live month-end budget bar for
 * "Dein Team".
 *
 * It sums the expected EUR/mo "salary" of every ACTIVE worker via the PURE
 * {@link projectMonthlySpend} and shows the running projected month-end total
 * against the included ~60€ base hull, so the user always SEES what the team
 * will cost BEFORE the bill — never a surprise. When the projection exceeds the
 * hull the bar turns to a warning and shows the overage.
 *
 * Pure data in → presentation out. The activate-time cap-and-ask confirm lives
 * in {@link DeinTeamPanel} (it uses {@link evaluateBudgetGate}); this component
 * is just the always-visible meter.
 */

import { type ProjectedSpend } from '@/common/config/eveTeamBudgetCore';
import { Progress, Tooltip } from '@arco-design/web-react';
import React from 'react';

export interface ProjectedSpendMeterProps {
  /** The pre-computed projection (from `projectMonthlySpend`). */
  projection: ProjectedSpend;
}

/** Format a EUR figure as a whole-euro string (no cents — these are salary bands). */
function eur(n: number): string {
  return `${Math.round(n)}€`;
}

const ProjectedSpendMeter: React.FC<ProjectedSpendMeterProps> = ({ projection }) => {
  const { totalEur, hullEur, fitsHull, remainingEur, overageEur, lines } = projection;
  const percent = hullEur > 0 ? Math.min(100, Math.round((totalEur / hullEur) * 100)) : 0;
  const activePaid = lines.filter((l) => l.active && l.salaryEur > 0);

  const tooltip = (
    <div>
      <div>
        Aktive Mitarbeiter (kostenpflichtig): {activePaid.length}
      </div>
      {activePaid.map((l) => (
        <div key={l.role.agent_id}>
          {l.role.displayName} · {eur(l.salaryEur)}/Mon.
        </div>
      ))}
      <div style={{ marginTop: 4 }}>
        {fitsHull
          ? `Noch ${eur(remainingEur)} im Basis-Budget frei`
          : `${eur(overageEur)} über dem Basis-Budget`}
      </div>
    </div>
  );

  return (
    <Tooltip content={tooltip} position='bottom'>
      <div
        className='w-full mb-3 p-2 rounded'
        data-testid='projected-spend-meter'
        data-fits-hull={fitsHull ? 'true' : 'false'}
        style={{ background: 'var(--color-fill-1)' }}
      >
        <div className='flex items-center justify-between mb-1'>
          <span className='text-sm font-medium text-t-primary'>Voraussichtliche Kosten / Monat</span>
          <span
            className='text-sm font-medium'
            data-testid='projected-spend-total'
            style={{ color: fitsHull ? 'var(--color-text-1)' : 'rgb(var(--danger-6))' }}
          >
            {eur(totalEur)} / {eur(hullEur)}
          </span>
        </div>
        <Progress
          percent={percent}
          showText={false}
          size='small'
          status={fitsHull ? 'normal' : 'error'}
        />
        <div className='text-xs text-t-secondary mt-1' data-testid='projected-spend-hint'>
          {fitsHull
            ? `Im enthaltenen Basis-Budget — noch ${eur(remainingEur)} frei.`
            : `Über dem Basis-Budget um ${eur(overageEur)} — zusätzliche Kosten fallen an.`}
        </div>
      </div>
    </Tooltip>
  );
};

export default ProjectedSpendMeter;
