import { SOLS_TOTAL } from '../engine/constants';
import type { GameState } from '../engine/types';
import { LifeSupportIcon, PowerIcon, ResearchIcon, ShieldIcon, SunIcon, WarningIcon } from './Icons';
import { flareForecastTonight, lifeSupportTonight, shieldingTonight } from '../engine/day';

interface MeterProps {
  kind: 'power' | 'life' | 'shield';
  label: string;
  caption: string;
  icon: React.ReactNode;
  value: number;
  scale: number;
  tonight?: number;
  extraNote?: string;
}

function Meter({ kind, label, caption, icon, value, scale, tonight, extraNote }: MeterProps) {
  const short = tonight !== undefined && value < tonight;
  const fill = Math.min(1, value / scale) * 100;
  const tick = tonight !== undefined ? Math.min(1, tonight / scale) * 100 : null;

  return (
    <div className={`meter meter-${kind}${short ? ' is-short' : ''}`}>
      <div className="meter-head">
        <span className="meter-icon">{icon}</span>
        <span className="meter-label">{label}</span>
        <span className="meter-value">{value}</span>
      </div>
      <div
        className="meter-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={scale}
        aria-valuenow={Math.min(value, scale)}
      >
        <div className="meter-fill" style={{ width: `${fill}%` }} />
        {tick !== null && <div className="meter-tick" style={{ left: `${tick}%` }} />}
      </div>
      <div className="meter-note">
        {tonight === undefined ? (
          caption
        ) : short ? (
          <strong className="short-note">
            <WarningIcon size={18} /> Tonight needs {tonight}. Short by {tonight - value}!
          </strong>
        ) : (
          <>
            Tonight uses {tonight}. {caption}
          </>
        )}
        {extraNote && <span className="meter-extra"> {extraNote}</span>}
      </div>
    </div>
  );
}

export function ResourceBar({ game }: { game: GameState }) {
  const lifeTonight = lifeSupportTonight(game);
  const shieldTonight = shieldingTonight();

  return (
    <section className="resource-bar" aria-label="Your supplies">
      <div className="sol-box">
        <SunIcon size={34} />
        <div>
          <div className="sol-count">
            Sol {game.sol} <span className="sol-of">of {SOLS_TOTAL}</span>
          </div>
          <div className="sol-explain">A sol is one day on Mars.</div>
        </div>
      </div>

      <Meter
        kind="power"
        label="Power"
        caption="Made by your solar panels."
        icon={<PowerIcon />}
        value={game.power}
        scale={150}
      />
      <Meter
        kind="life"
        label="Life support"
        caption="Air, water and food."
        icon={<LifeSupportIcon />}
        value={game.lifeSupport}
        scale={30}
        tonight={lifeTonight}
      />
      <Meter
        kind="shield"
        label="Shielding"
        caption="Wears out every night."
        icon={<ShieldIcon />}
        value={game.shielding}
        scale={30}
        tonight={shieldTonight}
        extraNote={flareForecastTonight(game) ? 'A flare may hit tonight: it needs 15 more.' : undefined}
      />

      <div className="score-box">
        <ResearchIcon size={34} />
        <div>
          <div className="score-value">{game.research}</div>
          <div className="score-label">Research: your score</div>
        </div>
      </div>
    </section>
  );
}
