import { useCallback, useLayoutEffect, useReducer, useState } from 'react';
import {
  createRun,
  dailySeed,
  reducer,
  selectCurrentDraw,
  type Decision,
} from './engine';
import { DrawCard } from './ui/DrawCard';
import { AppHeader } from './ui/AppHeader';
import { Hud } from './ui/Hud';
import { Briefing, Result } from './ui/Overlays';
import { DecisionReceipt, ReviewTrail } from './ui/ReviewTrail';
import { money } from './ui/format';

type Phase = 'briefing' | 'playing';

/** A one-off queue for players who want another project after the daily one. */
function practiceSeed(): string {
  return `practice-${Date.now().toString(36)}`;
}

export function App() {
  const today = dailySeed();
  const [seed, setSeed] = useState(today);
  const [phase, setPhase] = useState<Phase>('briefing');
  const [state, dispatch] = useReducer(reducer, today, createRun);
  const draw = selectCurrentDraw(state);

  const decide = useCallback((decision: Decision) => {
    dispatch({ type: 'decide', decision });
  }, []);

  const start = useCallback(
    (next: string) => {
      setSeed(next);
      dispatch({ type: 'start', seed: next });
      setPhase('playing');
    },
    [],
  );

  // A mobile player may be far down the decision trail when the phase changes.
  // New phases begin at their heading so neither the result nor the next project
  // appears halfway down the page.
  useLayoutEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [phase, state.status]);

  // Announce the outcome of each decision for screen readers, which otherwise get
  // nothing from a card silently sliding off screen.
  const last = state.log[state.log.length - 1];
  const announcement =
    state.status === 'won'
      ? 'Review complete. The loan closed out.'
      : state.status === 'lost'
        ? 'Review complete. The loan did not close out.'
        : last
          ? last.decision === 'fund'
            ? `Funded ${last.tradeName}. ${money(last.released)} released.`
            : `Held ${last.tradeName} for verification.`
          : '';

  const view =
    phase === 'briefing'
      ? 'briefing'
      : state.status === 'running'
        ? 'playing'
        : 'result';

  return (
    <main className={`app app--${view}`}>
      <a className="skip-link" href="#main-content">
        Skip to game
      </a>
      <AppHeader seed={seed} view={view} />

      <div id="main-content" className="app__content" tabIndex={-1}>
        {phase === 'briefing' ? (
          <Briefing seed={seed} onStart={() => start(seed)} />
        ) : state.status === 'running' && draw ? (
          <div className="workspace">
            <section className="workspace__review" aria-label="Current draw review">
              <Hud state={state} />
              <div className={`receipt-slot ${last ? 'has-receipt' : ''}`}>
                <div className="receipt-slot__inner">
                  {last && (
                    <DecisionReceipt
                      key={`${last.drawId}-${state.log.length}`}
                      entry={last}
                    />
                  )}
                </div>
              </div>
              <DrawCard
                key={`${draw.spec.id}-${draw.spec.resubmits}-${draw.claimPct}`}
                draw={draw}
                onDecide={decide}
              />
            </section>
            <ReviewTrail state={state} />
          </div>
        ) : (
          <Result
            state={state}
            onReplay={() => start(seed)}
            onPractice={() => start(practiceSeed())}
          />
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </main>
  );
}
