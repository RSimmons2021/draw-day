import type { EvidenceTone } from '../engine';

const paths: Record<EvidenceTone, string> = {
  good: 'M4 8.5l3 3 5-6',
  bad: 'M8 4v5M8 11.5v.5',
  neutral: 'M4.5 8h7',
};

/**
 * Evidence markers carry a distinct shape as well as a colour, so the good/bad
 * distinction survives both colour blindness and a greyscale screenshot.
 */
export function ToneMark({ tone }: { tone: EvidenceTone }) {
  return (
    <svg className={`mark mark--${tone}`} viewBox="0 0 16 16" aria-hidden="true">
      {tone === 'bad' && <circle cx="8" cy="8" r="6.5" />}
      {tone === 'good' && <circle cx="8" cy="8" r="6.5" />}
      {tone === 'neutral' && <circle cx="8" cy="8" r="6.5" />}
      <path d={paths[tone]} />
    </svg>
  );
}

export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="20" width="6" height="8" rx="1" />
      <rect x="13" y="13" width="6" height="15" rx="1" />
      <rect x="23" y="5" width="6" height="23" rx="1" />
    </svg>
  );
}
