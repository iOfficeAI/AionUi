/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { OFFICE_SCENES, type OfficeSceneDefinition } from '../config/officeScenes';
import OfficeSceneIcon from './OfficeSceneIcon';
import styles from '../index.module.css';

type OfficeSceneGridProps = {
  onSelectScene: (scene: OfficeSceneDefinition) => void;
  onShowMoreAssistants: () => void;
};

const OfficeSceneGrid: React.FC<OfficeSceneGridProps> = ({ onSelectScene, onShowMoreAssistants }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleSceneClick = (scene: OfficeSceneDefinition) => {
    if (scene.kind === 'navigate' && scene.path) {
      navigate(scene.path);
      return;
    }
    onSelectScene(scene);
  };

  return (
    <div className={styles.officeSceneSection} data-testid='office-scene-grid'>
      <p className={styles.officeSceneHint}>{t('guid.office.sceneHint')}</p>
      <div className={styles.officeSceneGrid}>
        {OFFICE_SCENES.map((scene) => (
          <button
            key={scene.id}
            type='button'
            className={styles.officeSceneCard}
            data-testid={`office-scene-card-${scene.id}`}
            onClick={() => handleSceneClick(scene)}
          >
            <OfficeSceneIcon sceneId={scene.id} />
            <span className={styles.officeSceneTitle}>{t(`guid.office.scenes.${scene.id}.title`)}</span>
            <span className={styles.officeSceneDesc}>{t(`guid.office.scenes.${scene.id}.description`)}</span>
          </button>
        ))}
      </div>
      <button type='button' className={styles.officeMoreAssistantsLink} onClick={onShowMoreAssistants}>
        {t('guid.office.moreAssistants')}
      </button>
    </div>
  );
};

export default OfficeSceneGrid;
