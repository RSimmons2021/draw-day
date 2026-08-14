import { useCallback, useEffect, useRef, useState } from 'react';
import type { Decision, PreparedDraw } from '../engine';
import { ToneMark } from './icons';
import { money } from './format';

/** Horizontal travel, in px, that commits a swipe. */
const COMMIT_PX = 96;

/** Long enough to read as a gesture, short enough not to gate the next decision. */
const EXIT_MS = 190;

const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Props {
  draw: PreparedDraw;
  onDecide: (decision: Decision) => void;
}

export function DrawCard({ draw, onDecide }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number } | null>(null);
  const timerRef = useRef<number | null>(null);
  // One card, one decision. Swipe and button can otherwise both fire.
  const decidedRef = useRef(false);
  const [exit, setExit] = useState<Decision | null>(null);
  const [tilt, setTilt] = useState(0);

  useEffect(() => {
    decidedRef.current = false;
    setExit(null);
    setTilt(0);
  }, [draw.spec.id]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

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

  // Pointer capture routes every subsequent move and release to this element, so the
  // drag needs no window-level listeners and cannot leak one per card.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (decidedRef.current || e.button !== 0) return;
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setTilt(e.clientX - drag.startX);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const dx = e.clientX - drag.startX;
    if (dx > COMMIT_PX) commit('fund');
    else if (dx < -COMMIT_PX) commit('hold');
    else setTilt(0);
  };

  const dragging = dragRef.current !== null;
  const transform = exit
    ? `translate3d(${exit === 'fund' ? 130 : -130}%, 0, 0) rotate(${exit === 'fund' ? 14 : -14}deg)`
    : `translate3d(${tilt}px, 0, 0) rotate(${tilt / 22}deg)`;

  return (
    <div className="card-stage">
      <div
        ref={cardRef}
        className={`card ${dragging ? 'card--dragging' : ''} ${exit ? 'card--exit' : ''}`}
        style={{ transform, opacity: exit ? 0 : 1 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="card__verdict card__verdict--fund"
          style={{ opacity: Math.min(1, Math.max(0, tilt / COMMIT_PX)) }}
          aria-hidden="true"
        >
          Fund
        </div>
        <div
          className="card__verdict card__verdict--hold"
          style={{ opacity: Math.min(1, Math.max(0, -tilt / COMMIT_PX)) }}
          aria-hidden="true"
        >
          Hold
        </div>

        <div className="card__head">
          <h2 className="card__trade">{draw.spec.trade.name}</h2>
          <p className="card__contractor">{draw.contractorName}</p>
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

        <div className="card__ask">
          <span className="hud__label">Requesting</span>
          <span className="card__amount">{money(draw.amount)}</span>
        </div>
      </div>

      <div className="controls">
        <button
          type="button"
          className="btn btn--hold"
          onClick={() => commit('hold')}
          aria-keyshortcuts="ArrowLeft"
        >
          Hold
        </button>
        <button
          type="button"
          className="btn btn--fund"
          onClick={() => commit('fund')}
          aria-keyshortcuts="ArrowRight"
        >
          Fund
        </button>
      </div>
    </div>
  );
}
