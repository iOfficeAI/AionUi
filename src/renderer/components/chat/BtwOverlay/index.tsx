import MarkdownView from '@/renderer/components/Markdown';
import { Spin } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import styles from './BtwOverlay.module.css';

type BtwOverlayProps = {
  answer: string;
  anchorEl?: HTMLElement | null;
  isLoading: boolean;
  isOpen: boolean;
  onDismiss: () => void;
  parentTaskRunning?: boolean;
  question: string;
};

const DISMISS_KEYS = new Set(['Escape', 'Enter', ' ']);
const DISMISS_BIND_DELAY_MS = 200;
const VIEWPORT_MARGIN_PX = 16;
const OVERLAY_GAP_PX = 8;
const MIN_OVERLAY_WIDTH_PX = 320;
const MAX_OVERLAY_WIDTH_PX = 760;
const MIN_OVERLAY_HEIGHT_PX = 180;
const CHROME_RESERVE_HEIGHT_PX = 168;

const BtwOverlay: React.FC<BtwOverlayProps> = ({
  answer,
  anchorEl,
  isLoading,
  isOpen,
  onDismiss,
  parentTaskRunning = false,
  question,
}) => {
  const { t } = useTranslation();
  const [position, setPosition] = useState({
    left: VIEWPORT_MARGIN_PX,
    maxHeight: Math.max(MIN_OVERLAY_HEIGHT_PX, window.innerHeight - VIEWPORT_MARGIN_PX * 2),
    top: VIEWPORT_MARGIN_PX,
    width: Math.min(MAX_OVERLAY_WIDTH_PX, window.innerWidth - VIEWPORT_MARGIN_PX * 2),
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const updatePosition = () => {
      const viewportWidth = window.innerWidth;
      const header = document.querySelector('.chat-layout-header');
      const headerBottom = header ? header.getBoundingClientRect().bottom : 60;
      const anchorRect = anchorEl?.getBoundingClientRect();

      const width = Math.max(
        MIN_OVERLAY_WIDTH_PX,
        Math.min(
          MAX_OVERLAY_WIDTH_PX,
          anchorRect ? anchorRect.width : viewportWidth - VIEWPORT_MARGIN_PX * 2,
          viewportWidth - VIEWPORT_MARGIN_PX * 2
        )
      );

      let left: number;
      if (header) {
        const headerRect = header.getBoundingClientRect();
        left = headerRect.left + Math.round((headerRect.width - width) / 2);
      } else {
        left = Math.round((viewportWidth - width) / 2);
      }
      left = Math.max(VIEWPORT_MARGIN_PX, Math.min(left, viewportWidth - width - VIEWPORT_MARGIN_PX));

      const top = headerBottom + OVERLAY_GAP_PX;
      const bottomBound = anchorRect ? anchorRect.top - OVERLAY_GAP_PX : window.innerHeight - VIEWPORT_MARGIN_PX;
      const maxHeight = Math.max(MIN_OVERLAY_HEIGHT_PX, bottomBound - top);

      setPosition({ left, maxHeight, top, width });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorEl, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!DISMISS_KEYS.has(event.key)) {
        return;
      }
      event.preventDefault();
      onDismiss();
    };

    // Delay keyboard dismissal binding so the Enter press used to submit `/btw`
    // cannot immediately close the overlay before the response is shown.
    const bindTimer = window.setTimeout(() => {
      window.addEventListener('keydown', onKeyDown);
    }, DISMISS_BIND_DELAY_MS);

    return () => {
      window.clearTimeout(bindTimer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onDismiss]);

  if (!isOpen) {
    return null;
  }

  const answerMaxHeight = Math.max(120, position.maxHeight - CHROME_RESERVE_HEIGHT_PX);
  const overlayStyle: React.CSSProperties = {
    left: `${position.left}px`,
    maxHeight: `${position.maxHeight}px`,
    top: `${position.top}px`,
    width: `${position.width}px`,
  };

  return ReactDOM.createPortal(
    <div className={styles.portalRoot}>
      <div className={styles.backdrop} onClick={onDismiss} />
      <div className={styles.panelWrap}>
        <div className={`rd-16px p-16px ${styles.overlay}`} style={overlayStyle}>
          <div className='flex flex-col gap-12px'>
            <div className='flex flex-col gap-4px'>
              <div className='text-12px text-t-secondary uppercase tracking-[0.08em]'>
                {t('conversation.sideQuestion.title')}
              </div>
              {parentTaskRunning && (
                <div className='text-12px text-t-secondary'>{t('conversation.sideQuestion.parentTaskRunning')}</div>
              )}
            </div>

            <div className='flex justify-end'>
              <div
                className={`${styles.questionBubble} max-w-[85%] rd-14px px-14px py-10px text-14px whitespace-pre-wrap break-words`}
              >
                {question}
              </div>
            </div>

            <div className='flex justify-start'>
              <div
                className={`${styles.answerBubble} ${styles.answer} min-h-48px max-w-[85%] rd-14px px-14px py-10px text-14px text-t-primary`}
                style={{ maxHeight: `${answerMaxHeight}px` }}
              >
                {isLoading ? (
                  <div className='flex items-center gap-8px text-t-secondary'>
                    <Spin size={16} />
                    <span>{t('conversation.sideQuestion.loading')}</span>
                  </div>
                ) : (
                  <MarkdownView className='text-14px'>{answer}</MarkdownView>
                )}
              </div>
            </div>

            <div className='text-12px text-t-secondary'>{t('conversation.sideQuestion.dismissHint')}</div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default BtwOverlay;
