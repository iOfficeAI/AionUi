/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tooltip, Message } from '@arco-design/web-react';
import { Attention, Brain, Check, CheckOne, Compass, Copy, Down, FileText, PlayOne, Up } from '@icon-park/react';
import classNames from 'classnames';
import MarkdownView from '@renderer/components/Markdown';
import { copyText } from '@/renderer/utils/ui/clipboard';
import type { WalkthroughData, WalkthroughSectionType } from './types';
import styles from './WalkthroughCard.module.css';

const CODE_STYLE = { marginTop: 4, marginBlock: 4 };

interface WalkthroughCardProps {
  walkthrough: WalkthroughData;
  onLocalFileLink?: (path: string) => void;
}

const renderSectionIcon = (type: WalkthroughSectionType) => {
  switch (type) {
    case 'delivered':
      return <CheckOne size={15} theme='filled' fill='var(--color-success-6)' />;
    case 'howItWorks':
      return <Brain size={15} theme='outline' fill='var(--color-primary-6)' />;
    case 'usage':
      return <PlayOne size={15} theme='filled' fill='var(--color-warning-6)' />;
    case 'notes':
      return <Attention size={15} theme='filled' fill='var(--color-danger-6)' />;
    default:
      return <FileText size={15} theme='outline' fill='var(--color-text-2)' />;
  }
};

export const WalkthroughCard: React.FC<WalkthroughCardProps> = ({ walkthrough, onLocalFileLink }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  const displayTitle = walkthrough.title || t('messages.walkthrough.title', { defaultValue: 'Execution Walkthrough' });

  const handleCopy = useCallback(
    async (e?: { stopPropagation?: () => void }) => {
      e?.stopPropagation?.();
      try {
        await copyText(walkthrough.rawContent);
        setCopied(true);
        Message.success(t('messages.walkthrough.copySuccess', { defaultValue: 'Walkthrough copied to clipboard' }));
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        Message.error(t('messages.walkthrough.copyFailed', { defaultValue: 'Failed to copy walkthrough' }));
        console.error('[WalkthroughCard] Failed to copy:', err);
      }
    },
    [t, walkthrough.rawContent]
  );

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }, []);

  return (
    <div className={styles.card} data-testid='walkthrough-card'>
      {/* Header */}
      <div
        className={classNames(styles.header, { [styles.headerExpanded]: isExpanded })}
        onClick={() => setIsExpanded(!isExpanded)}
        role='button'
        tabIndex={0}
        aria-expanded={isExpanded}
      >
        <div className={styles.headerLeft}>
          <div className={styles.iconBox}>
            <Compass size={16} theme='filled' />
          </div>
          <span className={styles.title} title={displayTitle}>
            {displayTitle}
          </span>
          <span className={styles.badge}>{t('messages.walkthrough.badge', { defaultValue: 'Walkthrough' })}</span>
        </div>

        <div className={styles.headerRight}>
          {!isExpanded && (
            <span className={styles.counterBadge}>
              {t('messages.walkthrough.sectionsCount', {
                count: walkthrough.sections.length,
                defaultValue: `${walkthrough.sections.length} sections`,
              })}
            </span>
          )}

          <Tooltip content={t('messages.walkthrough.copy', { defaultValue: 'Copy Walkthrough' })} position='top'>
            <Button
              type='text'
              size='mini'
              className={styles.actionButton}
              onClick={(e) => {
                void handleCopy(e);
              }}
              aria-label={t('messages.walkthrough.copy', { defaultValue: 'Copy Walkthrough' })}
            >
              {copied ? (
                <Check size={14} fill='var(--color-success-6)' />
              ) : (
                <Copy size={14} fill='var(--color-text-2)' />
              )}
            </Button>
          </Tooltip>

          <Tooltip
            content={
              isExpanded
                ? t('messages.walkthrough.collapse', { defaultValue: 'Collapse' })
                : t('messages.walkthrough.expand', { defaultValue: 'Expand' })
            }
            position='top'
          >
            <Button
              type='text'
              size='mini'
              className={styles.actionButton}
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <Up size={14} /> : <Down size={14} />}
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Expanded Body */}
      {isExpanded && (
        <div className={styles.body}>
          {walkthrough.summary && (
            <div className={styles.summaryBox}>
              <MarkdownView codeStyle={CODE_STYLE} onLocalFileLink={onLocalFileLink}>
                {walkthrough.summary}
              </MarkdownView>
            </div>
          )}

          {walkthrough.sections.map((section) => {
            const isSectionCollapsed = Boolean(collapsedSections[section.id]);
            return (
              <div key={section.id} className={styles.section} data-testid={`walkthrough-section-${section.type}`}>
                <div
                  className={styles.sectionHeader}
                  onClick={() => toggleSection(section.id)}
                  role='button'
                  tabIndex={0}
                  aria-expanded={!isSectionCollapsed}
                >
                  <div className={styles.sectionHeaderLeft}>
                    {renderSectionIcon(section.type)}
                    <span className={styles.sectionTitle}>{section.title}</span>
                  </div>
                  <Button
                    type='text'
                    size='mini'
                    className={styles.actionButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSection(section.id);
                    }}
                    aria-label={isSectionCollapsed ? 'Expand section' : 'Collapse section'}
                  >
                    {isSectionCollapsed ? <Down size={12} /> : <Up size={12} />}
                  </Button>
                </div>

                {!isSectionCollapsed && (
                  <div className={styles.sectionContent}>
                    <MarkdownView codeStyle={CODE_STYLE} onLocalFileLink={onLocalFileLink}>
                      {section.content}
                    </MarkdownView>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default WalkthroughCard;
