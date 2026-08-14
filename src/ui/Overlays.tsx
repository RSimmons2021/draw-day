import { useState } from 'react';
import {
  FACILITY,
  LOSS_COPY,
  MAX_EXPOSURE_PCT,
  TARGET_DRAWS,
  scoreRun,
  shareText,
  type RunState,
} from '../engine';
import { money } from './format';
import { DecisionReview } from './ReviewTrail';
import { DeskScene } from './DeskScene';

export function Briefing({ seed, onStart }: { seed: string; onStart: () => void }) {
  return (
    <section className="briefing">
      <div className="briefing__main">
        <p className="place-tag"><span aria-hidden="true">☞</span> Today’s in tray</p>
        <h1 className="briefing__title">Protect the loan. Keep the build moving.</h1>
        <p className="briefing__lede">
          {TARGET_DRAWS} payment requests are waiting. Release cash only against work
          that is actually in place—without holding so aggressively that the crews walk
          off.
        </p>

        <dl className="briefing__stakes" aria-label="Assignment parameters">
          <div>
            <dt>Facility</dt>
            <dd>{money(FACILITY)}</dd>
          </div>
          <div>
            <dt>Exposure limit</dt>
            <dd>+{MAX_EXPOSURE_PCT} pts</dd>
          </div>
          <div>
            <dt>Starting queue</dt>
            <dd>{TARGET_DRAWS} draws</dd>
          </div>
        </dl>

        <ul className="rules">
          <li>
            <span className="rule-mark rule-mark--fund" aria-hidden="true">→</span>
            <div>
              <strong>Fund verified work</strong>
              <span>If the work is not there, the missing scope has to be bought twice.</span>
            </div>
          </li>
          <li>
            <span className="rule-mark rule-mark--hold" aria-hidden="true">↺</span>
            <div>
              <strong>Hold suspicious claims</strong>
              <span>A wrong hold consumes goodwill and can eventually stop the job.</span>
            </div>
          </li>
          <li>
            <span className="rule-mark" aria-hidden="true">◇</span>
            <div>
              <strong>Weigh the full file</strong>
              <span>No single flag settles a draw. History, sequence, and field evidence matter.</span>
            </div>
          </li>
        </ul>

        <div className="briefing__action">
          <button type="button" className="btn btn--primary" onClick={onStart}>
            Open the draw tray
            <span aria-hidden="true">→</span>
          </button>
          <p className="overlay__hint">Swipe, tap, or use ← Hold · Fund →</p>
        </div>
      </div>

      <aside className="build-brief" aria-labelledby="build-brief-title">
        <div className="window-bar">
          <span>Inside · Draw desk</span>
          <span className="window-bar__help" aria-hidden="true">?</span>
        </div>
        <DeskScene />
        <div className="build-brief__note">
          <p className="eyebrow">Pinned engineering note</p>
          <h2 id="build-brief-title">Product judgment, made executable.</h2>
          <p>
            This is a small domain product, not a themed quiz. Every claim changes a
            deterministic construction-finance model with real operational tradeoffs.
          </p>

          <dl className="build-stats">
          <div>
            <dt>Behavior tests</dt>
            <dd>70</dd>
          </div>
          <div>
            <dt>Balance seeds</dt>
            <dd>300</dd>
          </div>
          <div>
            <dt>Rules engine</dt>
            <dd>Pure</dd>
          </div>
          </dl>

          <ul className="build-points">
          <li>Seeded runs reproduce every state and decision.</li>
          <li>Business rules stay outside React and render without a browser.</li>
          <li>Keyboard, touch, focus, live regions, and reduced motion are first-class.</li>
          <li>Balance tests prove judgment beats rubber-stamping or blanket holds.</li>
          </ul>

          <a
            className="text-link"
            href="https://github.com/RSimmons2021/draw-day"
            target="_blank"
            rel="noreferrer noopener"
          >
            Open the engineering file <span aria-hidden="true">↗</span>
          </a>
          <p className="build-brief__seed">Desk calendar · {seed}</p>
        </div>
      </aside>
    </section>
  );
}

export function Result({
  state,
  onReplay,
  onPractice,
}: {
  state: RunState;
  onReplay: () => void;
  onPractice: () => void;
}) {
  const card = scoreRun(state);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const loss = state.lossReason ? LOSS_COPY[state.lossReason] : null;

  const share = async () => {
    try {
      await navigator.clipboard.writeText(shareText(state, card));
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('error');
    }
  };

  return (
    <section className="result">
      <div className="result__summary">
        <p className="place-tag"><span aria-hidden="true">☞</span> File room · {state.seed}</p>
        <div className={`result__status ${card.won ? 'is-won' : 'is-lost'}`}>
          <span className="result__status-mark" aria-hidden="true">
            {card.won ? '✓' : '×'}
          </span>
          <div>
            <h1>{card.won ? 'Loan closed out' : loss?.title}</h1>
            <p>
              {card.won
                ? 'Every line item reached verified completion. Retainage is released at closeout.'
                : loss?.body}
            </p>
          </div>
        </div>

        <dl className="results">
          <div>
            <dt>Capital preserved</dt>
            <dd>{money(card.capitalPreserved)}</dd>
          </div>
          <div>
            <dt>Decision accuracy</dt>
            <dd>
              {card.correct}/{card.decisions}
            </dd>
          </div>
          <div>
            <dt>Released without work</dt>
            <dd className={card.leakage > 0 ? 'is-bad' : ''}>{money(card.leakage)}</dd>
          </div>
          <div>
            <dt>Role calibration</dt>
            <dd>{card.grade}</dd>
          </div>
        </dl>

        <div className="overlay__actions">
          <button type="button" className="btn btn--primary" onClick={onPractice}>
            Review a new project <span aria-hidden="true">→</span>
          </button>
          <button type="button" className="btn btn--ghost" onClick={onReplay}>
            Replay this queue
          </button>
        </div>
        <button type="button" className="btn btn--link" onClick={share}>
          {copyState === 'copied' ? 'Result copied' : 'Copy shareable result'}
        </button>
        {copyState === 'error' && (
          <p className="copy-error" role="alert">
            Clipboard access is blocked in this browser. You can retry after allowing it.
          </p>
        )}
      </div>

      <DecisionReview state={state} />

      <footer className="signoff">
        <div>
          <p className="signoff__by">Designed and engineered by Richard Simmons</p>
          <p className="signoff__note">
            Typed domain model · deterministic simulation · responsive interaction design
          </p>
        </div>
        <p className="signoff__links">
          <a href="mailto:richard.simmons.dev@gmail.com">Email</a>
          <a
            href="https://github.com/RSimmons2021/draw-day"
            target="_blank"
            rel="noreferrer noopener"
          >
            Source
          </a>
          <a
            href="https://richard-simmons-portfolio.vercel.app"
            target="_blank"
            rel="noreferrer noopener"
          >
            Portfolio
          </a>
        </p>
      </footer>
    </section>
  );
}
