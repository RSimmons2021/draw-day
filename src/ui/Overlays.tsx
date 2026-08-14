import { useState } from 'react';
import { LOSS_COPY, scoreRun, shareText, type RunState } from '../engine';
import { Logo } from './icons';
import { money } from './format';

export function Briefing({ seed, onStart }: { seed: string; onStart: () => void }) {
  return (
    <section className="overlay">
      <div className="overlay__inner">
        <Logo />
        <h1 className="overlay__title">Draw Day</h1>
        <p className="overlay__seed">Queue for {seed}</p>

        <p className="overlay__lede">
          You review draw requests for a construction lender. Contractors bill for work
          they say is finished. Your job is to release cash only against work that is
          actually in place. Five draws.
        </p>

        <ul className="rules">
          <li>
            <strong>Fund</strong> a claim and the money leaves the facility. If the work
            is not there, you buy it twice.
          </li>
          <li>
            <strong>Hold</strong> a claim and it comes back corrected — but an honest
            crew you stiff stops waiting on you.
          </li>
          <li>
            No single flag settles it. Weigh the evidence, and remember who has burned
            you before.
          </li>
        </ul>

        <button type="button" className="btn btn--primary" onClick={onStart} autoFocus>
          Start review
        </button>
        <p className="overlay__hint">Swipe the card, or use the arrow keys.</p>
      </div>
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
  const [copied, setCopied] = useState(false);
  const loss = state.lossReason ? LOSS_COPY[state.lossReason] : null;

  const share = async () => {
    try {
      await navigator.clipboard.writeText(shareText(state, card));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is unavailable over plain http and in some embedded webviews.
      // Nothing is broken; the button just stays as it was.
      setCopied(false);
    }
  };

  return (
    <section className="overlay" aria-live="polite">
      <div className="overlay__inner">
        <p className="overlay__seed">{state.seed}</p>
        <h1 className={`overlay__title ${card.won ? 'is-won' : 'is-lost'}`}>
          {card.won ? 'Closed out' : loss?.title}
        </h1>
        <p className="overlay__lede">
          {card.won
            ? 'Every line item verified and paid. Retainage released at closeout.'
            : loss?.body}
        </p>

        <dl className="results">
          <div>
            <dt>Capital preserved</dt>
            <dd>{money(card.capitalPreserved)}</dd>
          </div>
          <div>
            <dt>Calls right</dt>
            <dd>
              {card.correct}/{card.decisions}
            </dd>
          </div>
          <div>
            <dt>Released on air</dt>
            <dd className={card.leakage > 0 ? 'is-bad' : ''}>{money(card.leakage)}</dd>
          </div>
          <div>
            <dt>Rating</dt>
            <dd>{card.grade}</dd>
          </div>
        </dl>

        <div className="overlay__actions">
          <button type="button" className="btn btn--primary" onClick={onPractice}>
            New project
          </button>
          <button type="button" className="btn btn--ghost" onClick={onReplay}>
            Replay this queue
          </button>
        </div>
        <button type="button" className="btn btn--link" onClick={share}>
          {copied ? 'Copied' : 'Copy result'}
        </button>

        <footer className="signoff">
          <p className="signoff__by">Built by Richard Simmons</p>
          <p className="signoff__links">
            <a href="mailto:richard.simmons.dev@gmail.com">richard.simmons.dev@gmail.com</a>
            <span aria-hidden="true"> · </span>
            <a
              href="https://richard-simmons-portfolio.vercel.app"
              target="_blank"
              rel="noreferrer noopener"
            >
              Portfolio
            </a>
          </p>
        </footer>
      </div>
    </section>
  );
}
