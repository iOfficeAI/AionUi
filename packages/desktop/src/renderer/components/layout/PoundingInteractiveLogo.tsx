import React, { useEffect, useMemo, useRef, useState } from 'react';
import heartSolid from '@renderer/assets/logos/brand/pounding-heart-solid.png';
import eyesComponent from '@renderer/assets/logos/brand/eyes-component-transparent.png';
import noseDot from '@renderer/assets/logos/brand/pounding-nose-dot.png';

type PoundingInteractiveLogoProps = {
  className?: string;
  compact?: boolean;
};

const VIEWBOX_WIDTH = 1759;
const VIEWBOX_HEIGHT = 1765;
const EYES_X = 405;
const EYES_Y = 334;
const EYES_WIDTH = 949;
const EYES_HEIGHT = 726;
const EYES_CENTER_X = EYES_X + EYES_WIDTH / 2;
const EYES_CENTER_Y = EYES_Y + EYES_HEIGHT / 2;
const NOSE_X = 1319;
const NOSE_Y = 998;
const NOSE_SIZE = 63;

const BLINK_DURATION_MS = 160;
const BLINK_MIN_GAP_MS = 2600;
const BLINK_RANDOM_GAP_MS = 3200;

const PoundingInteractiveLogo: React.FC<PoundingInteractiveLogoProps> = ({ className = '', compact = false }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const blinkTimeoutRef = useRef<number | null>(null);
  const blinkResetTimeoutRef = useRef<number | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isBlinking, setIsBlinking] = useState(false);

  const maxX = compact ? 28 : 56;
  const maxY = compact ? 20 : 40;

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent | MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      const dx = Math.max(-1, Math.min(1, (px - 0.5) * 2));
      const dy = Math.max(-1, Math.min(1, (py - 0.5) * 2));

      setOffset({
        x: dx * maxX,
        y: dy * maxY,
      });
    };

    const resetEyes = () => {
      setOffset({ x: 0, y: 0 });
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('mousemove', handlePointerMove, { passive: true });
    window.addEventListener('mouseleave', resetEyes);
    window.addEventListener('blur', resetEyes);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseleave', resetEyes);
      window.removeEventListener('blur', resetEyes);
    };
  }, [maxX, maxY]);

  useEffect(() => {
    let disposed = false;

    const clearTimers = () => {
      if (blinkTimeoutRef.current !== null) {
        window.clearTimeout(blinkTimeoutRef.current);
        blinkTimeoutRef.current = null;
      }
      if (blinkResetTimeoutRef.current !== null) {
        window.clearTimeout(blinkResetTimeoutRef.current);
        blinkResetTimeoutRef.current = null;
      }
    };

    const blinkOnce = () => {
      setIsBlinking(true);
      if (blinkResetTimeoutRef.current !== null) {
        window.clearTimeout(blinkResetTimeoutRef.current);
      }
      blinkResetTimeoutRef.current = window.setTimeout(() => {
        setIsBlinking(false);
      }, BLINK_DURATION_MS);
    };

    const scheduleNextBlink = () => {
      if (disposed) {
        return;
      }
      const gap = BLINK_MIN_GAP_MS + Math.random() * BLINK_RANDOM_GAP_MS;
      blinkTimeoutRef.current = window.setTimeout(() => {
        blinkOnce();
        if (Math.random() < 0.18) {
          window.setTimeout(blinkOnce, 220);
        }
        scheduleNextBlink();
      }, gap);
    };

    scheduleNextBlink();

    return () => {
      disposed = true;
      clearTimers();
    };
  }, []);

  const eyesTranslate = useMemo(() => `translate(${offset.x} ${offset.y})`, [offset.x, offset.y]);
  const blinkTransform = useMemo(() => {
    const scaleY = isBlinking ? 0.06 : 1;
    return `translate(${EYES_CENTER_X} ${EYES_CENTER_Y}) scale(1 ${scaleY}) translate(${-EYES_CENTER_X} ${-EYES_CENTER_Y})`;
  }, [isBlinking]);

  return (
    <div ref={containerRef} className={className}>
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        aria-hidden='true'
        focusable='false'
        className='pounding-logo__svg'
        preserveAspectRatio='xMidYMid meet'
      >
        <image href={heartSolid} x='0' y='0' width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} preserveAspectRatio='none' />
        <g transform={eyesTranslate} className='pounding-logo__eyes-track'>
          <g transform={blinkTransform}>
            <image
              href={eyesComponent}
              x={EYES_X}
              y={EYES_Y}
              width={EYES_WIDTH}
              height={EYES_HEIGHT}
              preserveAspectRatio='none'
            />
          </g>
        </g>
        <image href={noseDot} x={NOSE_X} y={NOSE_Y} width={NOSE_SIZE} height={NOSE_SIZE} preserveAspectRatio='none' />
      </svg>
    </div>
  );
};

export default PoundingInteractiveLogo;
