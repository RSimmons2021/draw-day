import { MAX_EXPOSURE_PCT, selectExposure, selectRemaining, type RunState } from '../engine';
import { money } from './format';

export function Hud({ state }: { state: RunState }) {
  const exposure = selectExposure(state);
  // Exposure is the one number that can end the run without warning, so it gets a
  // gauge showing how much room is left rather than a bare figure.
  const exposureRatio = Math.max(0, Math.min(1, exposure / MAX_EXPOSURE_PCT));
  const exposureLevel = exposureRatio > 0.75 ? 'danger' : exposureRatio > 0.4 ? 'warn' : 'ok';
  const remaining = selectRemaining(state);

  return (
    <header className="hud">
      <div className="hud__heading">
        <p className="eyebrow">Desk instruments</p>
        <p className="hud__queue-note"><span aria-hidden="true">☞</span> Position updates after every stamp</p>
      </div>
      <div className="hud__primary">
        <div className="hud__completion">
          <span className="hud__label">Work in place</span>
          <span className="hud__value">
            {Math.floor(state.completion)}
            <span className="hud__unit">%</span>
          </span>
        </div>
        <div className="hud__queue">
          <span className="hud__label">Open draws</span>
          <span className="hud__value hud__value--sm">{remaining}</span>
        </div>
      </div>

      <div
        className="meter meter--completion"
        role="progressbar"
        aria-label="Project completion"
        aria-valuenow={Math.floor(state.completion)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="meter__fill" style={{ inlineSize: `${state.completion}%` }} />
      </div>

      <dl className="hud__stats">
        <div className="stat">
          <dt className="hud__label">Facility available</dt>
          <dd className="stat__value">{money(state.facility - state.disbursed)}</dd>
        </div>

        <div className={`stat stat--${exposureLevel}`}>
          <dt className="hud__label">Exposure</dt>
          <dd className="stat__value">
            {exposure > 0 ? '+' : ''}
            {exposure.toFixed(1)}
            <span className="hud__unit">pts</span>
          </dd>
          <div
            className="meter meter--exposure"
            role="progressbar"
            aria-label="Cash released ahead of work in place"
            aria-valuenow={Number(Math.max(0, exposure).toFixed(1))}
            aria-valuemin={0}
            aria-valuemax={MAX_EXPOSURE_PCT}
            aria-valuetext={
              exposure <= 0
                ? `${Math.abs(exposure).toFixed(1)} points behind work in place; no current exposure`
                : `${exposure.toFixed(1)} of ${MAX_EXPOSURE_PCT} points before the loan is under-collateralized`
            }
          >
            <div className="meter__fill" style={{ inlineSize: `${exposureRatio * 100}%` }} />
          </div>
        </div>

        <div className={`stat ${state.trust <= 30 ? 'stat--danger' : ''}`}>
          <dt className="hud__label">Crew goodwill</dt>
          <dd className="stat__value">{Math.round(state.trust)}</dd>
          <div
            className="meter meter--trust"
            role="progressbar"
            aria-label="Contractor goodwill"
            aria-valuenow={Math.round(state.trust)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="meter__fill" style={{ inlineSize: `${state.trust}%` }} />
          </div>
        </div>
      </dl>
    </header>
  );
}
