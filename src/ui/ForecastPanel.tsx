import { DAILY_SHIELDING_USE, FLARE_SHIELDING_USE, SOLS_TOTAL } from '../engine/constants';
import { flareForecastTonight } from '../engine/day';
import type { GameState } from '../engine/types';
import { FlareIcon } from './Icons';

function forecastSentence(game: GameState): string {
  const forecast = game.forecast;
  if (forecast === null) {
    return game.commsRequestedOnSol === game.sol
      ? 'Mission Control will answer tomorrow morning.'
      : 'No flare report right now. Call Mission Control to get one.';
  }
  if (forecast === 'clear') {
    const until = game.forecastUntil ?? game.sol;
    return until >= SOLS_TOTAL
      ? 'Mission Control says no flares before the mission ends.'
      : `Mission Control says no flares up to Sol ${until}.`;
  }
  const when = forecast.sol === game.sol ? 'tonight' : `on Sol ${forecast.sol}`;
  return `A solar flare may hit ${when}. Mission Control is ${forecast.confidence}% sure.`;
}

export function ForecastPanel({ game }: { game: GameState }) {
  const warned = typeof game.forecast === 'object' && game.forecast !== null;
  const tonight = flareForecastTonight(game);
  return (
    <section className={`panel forecast-panel${warned ? ' is-warned' : ''}`} aria-label="Flare report">
      <FlareIcon size={40} />
      <div>
        <p className="forecast-text" aria-live="polite">
          {forecastSentence(game)}
        </p>
        <p className="forecast-explain">
          {tonight
            ? `Shields need ${DAILY_SHIELDING_USE + FLARE_SHIELDING_USE} tonight to stop it.`
            : 'A solar flare is a burst of energy from the Sun.'}
        </p>
      </div>
    </section>
  );
}
