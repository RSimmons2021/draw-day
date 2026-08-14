import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Decision, PreparedDraw } from '../engine';
import { ToneMark } from './icons';
import { money } from './format';

/** Horizontal travel, in px, that commits a swipe. */
const COMMIT_PX = 96;

/** Long enough to read as a gesture, short enough not to gate the next decision. */
const EXIT_MS = 245;

/** A short projection makes quick flicks commit without weakening deliberate drags. */
const MOMENTUM_MS = 120;

const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Props {
  draw: PreparedDraw;
  onDecide: (decision: Decision) => void;
}

export function DrawCard({ draw, onDecide }: Props) {
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startTilt: number;
    lastX: number;
    lastTime: number;
    velocityX: number;
  } | null>(null);
  const timerRef = useRef<number | null>(null);
  const tiltFrameRef = useRef<number | null>(null);
  const enterFrameRef = useRef<number | null>(null);
  const springFrameRef = useRef<number | null>(null);
  const pendingTiltRef = useRef(0);
  // One card, one decision. Swipe and button can otherwise both fire.
  const decidedRef = useRef(false);
  const [exit, setExit] = useState<Decision | null>(null);
  const [tilt, setTilt] = useState(0);
  const [entering, setEntering] = useState(() => !prefersReducedMotion());
  const [springing, setSpringing] = useState(false);

  useEffect(() => {
    decidedRef.current = false;
    setExit(null);
    setTilt(0);
    setSpringing(false);
    if (prefersReducedMotion()) {
      setEntering(false);
      return;
    }

    // Two frames guarantee the browser paints the card on the top of the desk
    // stack before it settles into its resting position.
    setEntering(true);
    enterFrameRef.current = requestAnimationFrame(() => {
      enterFrameRef.current = requestAnimationFrame(() => setEntering(false));
    });

    return () => {
      if (enterFrameRef.current !== null) cancelAnimationFrame(enterFrameRef.current);
    };
  }, [draw.spec.id, draw.spec.resubmits]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      if (tiltFrameRef.current !== null) cancelAnimationFrame(tiltFrameRef.current);
      if (enterFrameRef.current !== null) cancelAnimationFrame(enterFrameRef.current);
      if (springFrameRef.current !== null) cancelAnimationFrame(springFrameRef.current);
    },
    [],
  );

  // Pointer events can arrive faster than the display refreshes. Coalescing the
  // visual update into one animation frame avoids redundant React renders while
  // preserving 1:1 tracking on screen.
  const scheduleTilt = (nextTilt: number) => {
    pendingTiltRef.current = nextTilt;
    if (tiltFrameRef.current !== null) return;
    tiltFrameRef.current = requestAnimationFrame(() => {
      tiltFrameRef.current = null;
      setTilt(pendingTiltRef.current);
    });
  };

  /**
   * A gesture that does not commit returns with its release velocity. This tiny
   * damped spring stays interruptible and avoids the fixed-duration "snap back"
   * that made slow drags and fast flicks feel identical.
   */
  const springTiltToRest = (start: number, initialVelocity: number) => {
    if (tiltFrameRef.current !== null) {
      cancelAnimationFrame(tiltFrameRef.current);
      tiltFrameRef.current = null;
    }
    if (springFrameRef.current !== null) cancelAnimationFrame(springFrameRef.current);

    let position = start;
    let velocity = initialVelocity;
    let previousTime = performance.now();
    const stiffness = 460;
    const damping = 38;

    setTilt(start);
    setSpringing(true);

    const step = (now: number) => {
      const seconds = Math.min(0.032, Math.max(0.001, (now - previousTime) / 1000));
      previousTime = now;
      const acceleration = -stiffness * position - damping * velocity;
      velocity += acceleration * seconds;
      position += velocity * seconds;

      if (Math.abs(position) < 0.15 && Math.abs(velocity) < 4) {
        setTilt(0);
        // Keep transitions disabled for one final paint at exactly zero. Removing
        // the class in the same render would let CSS add a tiny sub-pixel tail.
        springFrameRef.current = requestAnimationFrame(() => {
          springFrameRef.current = null;
          setSpringing(false);
        });
        return;
      }

      setTilt(position);
      springFrameRef.current = requestAnimationFrame(step);
    };

    springFrameRef.current = requestAnimationFrame(step);
  };

  const commit = useCallback(
    (decision: Decision) => {
      if (decidedRef.current) return;
      decidedRef.current = true;
      if (prefersReducedMotion()) {
        onDecide(decision);
        return;
      }
      setExit(decision);
      timerRef.current = window.setTimeout(() => onDecide(decision), EXIT_MS);
    },
    [onDecide],
  );

  // Keyboard uses the same guarded transition as pointer and touch input. Keeping
  // one commit path prevents rapid key presses from deciding multiple cards and
  // gives every input mode the same visible feedback.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        commit('fund');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        commit('hold');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commit]);

  // Pointer capture routes every subsequent move and release to this element, so the
  // drag needs no window-level listeners and cannot leak one per card.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (decidedRef.current || e.button !== 0) return;
    if (springFrameRef.current !== null) {
      cancelAnimationFrame(springFrameRef.current);
      springFrameRef.current = null;
    }
    setSpringing(false);
    setEntering(false);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startTilt: tilt,
      lastX: e.clientX,
      lastTime: e.timeStamp,
      velocityX: 0,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const elapsed = Math.max(1, e.timeStamp - drag.lastTime);
    const instantaneousVelocity = ((e.clientX - drag.lastX) / elapsed) * 1000;
    // A little smoothing removes noisy touch samples without making the card lag.
    drag.velocityX = drag.velocityX * 0.62 + instantaneousVelocity * 0.38;
    drag.lastX = e.clientX;
    drag.lastTime = e.timeStamp;
    scheduleTilt(drag.startTilt + e.clientX - drag.startX);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const dx = drag.startTilt + e.clientX - drag.startX;
    const projectedX = dx + (drag.velocityX * MOMENTUM_MS) / 1000;
    if (dx > COMMIT_PX || (dx > 16 && projectedX > COMMIT_PX)) commit('fund');
    else if (dx < -COMMIT_PX || (dx < -16 && projectedX < -COMMIT_PX)) commit('hold');
    else springTiltToRest(dx, drag.velocityX);
  };

  const cancelDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    springTiltToRest(drag.startTilt + e.clientX - drag.startX, 0);
  };

  const dragging = dragRef.current !== null;
  const cardStyle = {
    '--card-x': `${tilt}px`,
    '--card-rotate': `${tilt / 30}deg`,
  } as CSSProperties;

  return (
    <div className={`card-stage ${exit ? `card-stage--${exit}` : ''}`}>
      <div className="card-stack" aria-hidden="true" />
      <div
        className={`card ${entering ? 'card--enter' : ''} ${dragging ? 'card--dragging' : ''} ${springing ? 'card--springing' : ''} ${exit ? `card--exit card--${exit}` : ''}`}
        style={cardStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={cancelDrag}
      >
        <span className="card__paperclip" aria-hidden="true" />
        <span className="card__file-tab" aria-hidden="true">Draw · {draw.spec.id}</span>
        <div
          className="card__verdict card__verdict--fund"
          style={{ opacity: exit === 'fund' ? 1 : Math.min(1, Math.max(0, tilt / COMMIT_PX)) }}
          aria-hidden="true"
        >
          Fund
        </div>
        <div
          className="card__verdict card__verdict--hold"
          style={{ opacity: exit === 'hold' ? 1 : Math.min(1, Math.max(0, -tilt / COMMIT_PX)) }}
          aria-hidden="true"
        >
          Hold
        </div>

        <div className="card__topline">
          <span>Payment application · field copy</span>
          <span>{draw.spec.resubmits > 0 ? `Revision ${draw.spec.resubmits}` : 'Original request'}</span>
        </div>

        <div className="card__head">
          <div>
            <h1 className="card__trade">{draw.spec.trade.name}</h1>
            <p className="card__contractor">Submitted by {draw.contractorName}</p>
          </div>
          <div className="card__ask">
            <span className="claim__label">Current request</span>
            <span className="card__amount">{money(draw.amount)}</span>
          </div>
        </div>

        <div className="card__claim">
          <div className="claim__row">
            <span className="claim__label">Billed to</span>
            <span className="claim__pct">{draw.claimPct}%</span>
          </div>
          <div
            className="claim__track"
            role="img"
            aria-label={`Claiming ${draw.claimPct}% complete; ${draw.paidPct}% funded to date`}
          >
            <div className="claim__paid" style={{ inlineSize: `${draw.paidPct}%` }} />
            <div className="claim__new" style={{ inlineSize: `${Math.max(0, draw.claimPct - draw.paidPct)}%`, insetInlineStart: `${draw.paidPct}%` }} />
          </div>
          <p className="claim__note">{draw.paidPct}% funded to date</p>
        </div>

        <div className="evidence__heading">
          <span>Evidence file</span>
          <span>{draw.evidence.length} {draw.evidence.length === 1 ? 'signal' : 'signals'}</span>
        </div>
        <ul className="evidence">
          {draw.evidence.map((item) => (
            <li key={item.id + item.label} className={`evidence__item evidence__item--${item.tone}`}>
              <ToneMark tone={item.tone} />
              <div>
                <span className="evidence__label">{item.label}</span>
                <span className="evidence__detail">{item.detail}</span>
              </div>
            </li>
          ))}
        </ul>

      </div>

      <div className={`controls ${exit ? `controls--${exit}` : ''}`}>
        <button
          type="button"
          className="btn btn--hold"
          onClick={() => commit('hold')}
          aria-keyshortcuts="ArrowLeft"
          disabled={exit !== null}
        >
          <span className="btn__stamp-mark" aria-hidden="true">↺</span>
          <span className="btn__copy">
            <span className="btn__label">Hold</span>
            <span className="btn__hint">← Return for verification</span>
          </span>
        </button>
        <button
          type="button"
          className="btn btn--fund"
          onClick={() => commit('fund')}
          aria-keyshortcuts="ArrowRight"
          disabled={exit !== null}
        >
          <span className="btn__stamp-mark" aria-hidden="true">✓</span>
          <span className="btn__copy">
            <span className="btn__label">Fund</span>
            <span className="btn__hint">Release verified cash →</span>
          </span>
        </button>
      </div>
    </div>
  );
}
