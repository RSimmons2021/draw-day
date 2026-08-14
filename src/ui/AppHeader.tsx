import { Logo } from './icons';

type View = 'briefing' | 'playing' | 'result';

const VIEW_LABEL: Record<View, string> = {
  briefing: 'The desk',
  playing: 'Draw tray',
  result: 'File room',
};

export function AppHeader({ seed, view }: { seed: string; view: View }) {
  const isDailySeed = /^\d{4}-\d{2}-\d{2}$/.test(seed);

  return (
    <header className="masthead">
      <div className="brand">
        <Logo />
        <div>
          <p className="brand__name">Draw Desk</p>
          <p className="brand__descriptor">Construction finance field office</p>
        </div>
      </div>

      <div className="masthead__run">
        <span className="place-pointer" aria-hidden="true">☞</span>
        <span>{VIEW_LABEL[view]}</span>
        <span className="masthead__divider" aria-hidden="true" />
        {isDailySeed ? <time dateTime={seed}>{seed}</time> : <span>{seed}</span>}
      </div>

      <a
        className="source-link"
        href="https://github.com/RSimmons2021/draw-day"
        target="_blank"
        rel="noreferrer noopener"
      >
        Source room
        <span aria-hidden="true"> ↗</span>
      </a>
    </header>
  );
}
