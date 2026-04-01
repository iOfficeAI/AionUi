/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

import { usePetState } from './usePetState';
import type { PetState } from './usePetState';
import {
  IdlePet,
  ThinkingPet,
  WorkingPet,
  HappyPet,
  SleepingPet,
  ErrorPet,
  NotificationPet,
  WakingPet,
  SweepingPet,
  BuildingPet,
  JugglingPet,
} from './states';

const STATE_COMPONENTS: Record<PetState, React.FC> = {
  idle: IdlePet,
  thinking: ThinkingPet,
  working: WorkingPet,
  happy: HappyPet,
  sleeping: SleepingPet,
  error: ErrorPet,
  notification: NotificationPet,
  waking: WakingPet,
  sweeping: SweepingPet,
  building: BuildingPet,
  juggling: JugglingPet,
};

const PET_SIZE = 80;

/**
 * Floating desktop pet widget.
 *
 * Renders at a fixed position in the bottom-right corner of the viewport.
 * The pet's animation state is driven by `pet.state` events from the emitter.
 */

const PetWidget: React.FC = () => {
  const { state } = usePetState();
  const Component = STATE_COMPONENTS[state];

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        width: PET_SIZE,
        height: PET_SIZE,
        zIndex: 999,
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <Component />
    </div>
  );
};

export default PetWidget;
