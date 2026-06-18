/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * "Dein Team" — read-only surface for the curated A-roster.
 *
 * HONEST-A: this presents a FIXED, curated team straight — it is NOT an
 * assemble-your-own-company builder. There is no add/remove, no per-role
 * configuration, no marketplace. It simply lists who is on your EVE team, what
 * each role owns (outcome), the level it works at, and the skills it leans on.
 *
 * The roster is pure DATA from {@link EVE_TEAM_ROSTER}; this component only
 * renders it. Governance seats (CEO, Chief of Staff) are shown first because
 * they own the company; the operators follow. Spend an operator drives is
 * attributed to its stable `agent_id` by the existing delegate_task path — see
 * eveTeamRoster.resolveAttributionAgentId.
 */

import { EVE_TEAM_ROSTER, type EveTeamRole, type EveTeamRoleTier } from '@/common/config/eveTeamRoster';
import { Card, Tag } from '@arco-design/web-react';
import React, { useMemo } from 'react';

/** German level label for an EVE tier (the user never sees a raw model id). */
const TIER_LABEL_DE: Record<EveTeamRoleTier, string> = {
  standard: 'Standard',
  high: 'Hoch',
  max: 'Max',
  maximum: 'Maximum',
};

/** Paid levels carry a subtle credit marker (mirrors the inference picker). */
const TIER_CONSUMES_CREDITS: Record<EveTeamRoleTier, boolean> = {
  standard: false,
  high: false,
  max: true,
  maximum: true,
};

const RoleCard: React.FC<{ role: EveTeamRole }> = ({ role }) => {
  const consumesCredits = TIER_CONSUMES_CREDITS[role.tier];
  return (
    <Card className='w-full mb-2' size='small' bordered data-agent-id={role.agent_id}>
      <div className='flex items-start gap-3'>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2 mb-1 flex-wrap'>
            <span className='font-medium text-t-primary'>{role.displayName}</span>
            <span className='text-xs text-t-secondary'>{role.title}</span>
            {role.kind === 'governance' ? (
              <Tag color='arcoblue' size='small'>
                Führung
              </Tag>
            ) : null}
            <Tag size='small' color={consumesCredits ? 'orange' : 'gray'}>
              {TIER_LABEL_DE[role.tier]}
              {consumesCredits ? ' · verbraucht Credits' : ''}
            </Tag>
          </div>
          <div className='text-sm text-t-primary mb-2'>{role.outcome}</div>
          <div className='flex items-center gap-1 flex-wrap'>
            {role.skills.map((skill) => (
              <Tag key={skill} size='small' bordered>
                {skill}
              </Tag>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};

/**
 * Read-only Dein-Team panel. Lists the curated roster — governance seats first,
 * then operators (presentation order is the roster order).
 */
const DeinTeamPanel: React.FC = () => {
  // The roster is a stable constant; memoize the split so re-renders are cheap.
  const { governance, operators } = useMemo(() => {
    const governance: EveTeamRole[] = [];
    const operators: EveTeamRole[] = [];
    for (const role of EVE_TEAM_ROSTER) {
      (role.kind === 'governance' ? governance : operators).push(role);
    }
    return { governance, operators };
  }, []);

  return (
    <div className='w-full'>
      <div className='mb-3'>
        <div className='text-base font-medium text-t-primary'>Dein Team</div>
        <div className='text-sm text-t-secondary'>
          Ein festes, kuratiertes Team. EVE verteilt die Arbeit an die passende Rolle.
        </div>
      </div>
      {governance.length > 0 ? (
        <div className='mb-3'>
          <div className='text-xs uppercase tracking-wide text-t-secondary mb-1'>Führung</div>
          {governance.map((role) => (
            <RoleCard key={role.agent_id} role={role} />
          ))}
        </div>
      ) : null}
      {operators.length > 0 ? (
        <div>
          <div className='text-xs uppercase tracking-wide text-t-secondary mb-1'>Rollen</div>
          {operators.map((role) => (
            <RoleCard key={role.agent_id} role={role} />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default DeinTeamPanel;
