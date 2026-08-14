import { MAX_EXPOSURE_PCT, type DecisionLog, type RunState } from '../engine';
import { money } from './format';

export function DecisionReceipt({ entry }: { entry: DecisionLog }) {
  return (
    <div className={`receipt receipt--${entry.decision}`}>
      <span className="receipt__mark" aria-hidden="true">
        {entry.decision === 'fund' ? '✓' : '↺'}
      </span>
      <div>
        <p className="receipt__title">
          {entry.decision === 'fund' ? 'Funds released' : 'Sent back for verification'}
        </p>
        <p className="receipt__detail">
          {entry.tradeName} ·{' '}
          {entry.decision === 'fund'
            ? `${money(entry.released)} disbursed against ${entry.progress.toFixed(1)} points of progress`
            : 'No cash released; the request may return corrected'}
        </p>
      </div>
    </div>
  );
}

export function ReviewTrail({ state }: { state: RunState }) {
  return (
    <aside className="review-trail" aria-label="Decision trail and operating limits">
      <section className="review-trail__section">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">File drawer</p>
            <h2>Stamped draws</h2>
          </div>
          <span className="panel-count">{state.log.length}</span>
        </div>

        {state.log.length === 0 ? (
          <div className="trail-empty">
            <p>The drawer is empty.</p>
            <span>Your stamped decisions and cash impact will be filed here.</span>
          </div>
        ) : (
          <ol className="trail-list">
            {[...state.log].reverse().map((entry, index) => (
              <li key={`${entry.drawId}-${state.log.length - index}`}>
                <span className={`trail-list__decision is-${entry.decision}`}>
                  {entry.decision === 'fund' ? 'Funded' : 'Held'}
                </span>
                <div className="trail-list__body">
                  <strong>{entry.tradeName}</strong>
                  <span>
                    {entry.decision === 'fund'
                      ? `${money(entry.released)} released`
                      : 'Returned to queue'}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
        <p className="sealed-note">
          <span aria-hidden="true">◇</span> Ground truth stays sealed until closeout.
        </p>
      </section>

      <section className="review-trail__section review-trail__section--limits">
        <p className="eyebrow">Card taped to desk</p>
        <dl className="limit-list">
          <div>
            <dt>Exposure ceiling</dt>
            <dd>+{MAX_EXPOSURE_PCT} pts</dd>
          </div>
          <div>
            <dt>Goodwill floor</dt>
            <dd>0</dd>
          </div>
          <div>
            <dt>Closeout target</dt>
            <dd>100%</dd>
          </div>
        </dl>
        <p className="limit-note">
          Protect the collateral without creating enough friction to stop the work.
        </p>
      </section>
    </aside>
  );
}

export function DecisionReview({ state }: { state: RunState }) {
  return (
    <section className="decision-review" aria-labelledby="decision-review-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Closeout file</p>
          <h2 id="decision-review-title">What was actually in place</h2>
        </div>
        <span className="panel-count">{state.log.length}</span>
      </div>

      <ol className="audit-list">
        {state.log.map((entry, index) => (
          <li key={`${entry.drawId}-${index}`}>
            <span className="audit-list__index">{String(index + 1).padStart(2, '0')}</span>
            <div className="audit-list__subject">
              <strong>{entry.tradeName}</strong>
              <span>{entry.contractorName}</span>
            </div>
            <dl className="audit-list__numbers">
              <div>
                <dt>Claimed</dt>
                <dd>{entry.claimPct}%</dd>
              </div>
              <div>
                <dt>Verified</dt>
                <dd>{entry.actualPct}%</dd>
              </div>
            </dl>
            <span className={`audit-list__verdict ${entry.correct ? 'is-correct' : 'is-wrong'}`}>
              {entry.correct ? 'Sound call' : 'Missed risk'}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
