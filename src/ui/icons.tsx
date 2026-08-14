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
    <svg className="logo" viewBox="0 0 36 36" aria-hidden="true">
      <path d="M4.5 15.5h27l-3 14h-21z" />
      <path d="M8 10.5h20l2.5 5H5.5z" />
      <path d="M11.5 5.5h13l2 5h-17z" />
      <path d="M14 21h8" />
    </svg>
  );
}
