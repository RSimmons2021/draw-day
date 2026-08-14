import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  createRun,
  dailySeed,
  reducer,
  selectCurrentDraw,
  type Decision,
} from './engine';
import { DrawCard } from './ui/DrawCard';
import { Hud } from './ui/Hud';
import { Briefing, Result } from './ui/Overlays';

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
  const liveRef = useRef<HTMLParagraphElement>(null);

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

  // Keyboard is a first-class input, not a fallback: the whole game is a binary
  // choice, and on a laptop the arrow keys are faster than the pointer.
  useEffect(() => {
    if (phase !== 'playing' || !draw) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        decide('fund');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        decide('hold');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, draw, decide]);

  // Announce the outcome of each decision for screen readers, which otherwise get
  // nothing from a card silently sliding off screen.
  const last = state.log[state.log.length - 1];
  const announcement = last
    ? `${last.decision === 'fund' ? 'Funded' : 'Held'} ${last.tradeName}. ${
        last.correct ? 'Correct call.' : 'Wrong call.'
      }`
    : '';

  return (
    <main className="app">
      {phase === 'briefing' ? (
        <Briefing seed={seed} onStart={() => start(seed)} />
      ) : state.status === 'running' && draw ? (
        <>
          <Hud state={state} />
          <DrawCard key={draw.spec.id} draw={draw} onDecide={decide} />
        </>
      ) : (
        <Result
          state={state}
          onReplay={() => start(seed)}
          onPractice={() => start(practiceSeed())}
        />
      )}
      <p ref={liveRef} className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </main>
  );
}
