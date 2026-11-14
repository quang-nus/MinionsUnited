import { useEffect, useState } from 'react';
import type { GameState, Scenario } from '../engine/types';
import { readGuideSeen, writeGuideSeen, type GameStore } from '../store';
import { ActionPanel } from './ActionPanel';
import { CrewPanel } from './CrewPanel';
import { EndSolButton } from './EndSolButton';
import { EventLog } from './EventLog';
import { FirstSolGuide } from './FirstSolGuide';
import { ForecastPanel } from './ForecastPanel';
import { FlareIcon, WarningIcon } from './Icons';
import type { NightEvents, NumberedEvents } from './nightEvents';
import { ResourceBar } from './ResourceBar';
import { SoundToggle } from './SoundToggle';
import { dateRange } from './format';

/** How long the flare flash stays on screen, in milliseconds. */
const FLARE_FLASH_MS = 1800;

interface GameScreenProps {
  store: GameStore;
  scenario: Scenario;
  game: GameState;
  night: NumberedEvents;
  soundOn: boolean;
  onSoundChange: (on: boolean) => void;
  onMenu: () => void;
  onAbout: () => void;
}

/** One short sentence for screen readers after each sol. */
function announcement(game: GameState, events: NightEvents): string {
  if (!events.solEnded) return '';
  const parts = [`Sol ${game.sol} has begun.`];
  if (events.flare) parts.push('A solar flare hit last night.');
  for (const id of events.returnedIds) {
    const member = game.crew.find((m) => m.id === id);
    if (member !== undefined) parts.push(`${member.name} is back.`);
  }
  return parts.join(' ');
}

export function GameScreen({ store, scenario, game, night, soundOn, onSoundChange, onMenu, onAbout }: GameScreenProps) {
  const dates = dateRange(scenario.startDate, scenario.endDate);
  const [showGuide, setShowGuide] = useState(() => game.sol === 1 && !readGuideSeen());
  const [flashKey, setFlashKey] = useState<number | null>(null);

  useEffect(() => {
    if (!night.events.flare) return undefined;
    setFlashKey(night.count);
    const timer = window.setTimeout(() => setFlashKey(null), FLARE_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [night]);

  const finishGuide = () => {
    writeGuideSeen();
    setShowGuide(false);
  };

  return (
    <div className="game">
      <header className="top">
        <h1>Mars Outpost</h1>
        <p className="scenario">
          {scenario.name}: archived NASA data from {dates}
        </p>
        <SoundToggle on={soundOn} onChange={onSoundChange} />
      </header>

      <ResourceBar game={game} />

      <main className="middle">
        <div className="left">
          <CrewPanel game={game} onCure={store.cure} returned={night} />
          <ActionPanel key={`${store.gameNumber}-${game.sol}`} game={game} store={store} />
        </div>
        <div className="right">
          <ForecastPanel game={game} />
          <EventLog log={game.log} />
          <EndSolButton game={game} onEndSol={store.endSol} />
        </div>
      </main>

      <footer className="credit">
        <span>Solar flare data: NASA DONKI (archived), {dates}.</span>
        <span className="credit-links">
          <button type="button" className="link-button" onClick={onAbout}>
            About the science
          </button>
          <button type="button" className="link-button" onClick={onMenu}>
            Menu (your game is saved)
          </button>
        </span>
      </footer>

      <p className="visually-hidden" aria-live="polite">
        {announcement(game, night.events)}
      </p>

      {flashKey !== null && (
        <div key={flashKey} className="flare-flash" aria-hidden="true">
          <div className="flare-flash-sign">
            <FlareIcon size={64} />
            <span>Solar flare!</span>
          </div>
        </div>
      )}

      {store.error && (
        <div className="error-banner" role="alert">
          <WarningIcon size={24} />
          <span>{store.error}</span>
          <button type="button" onClick={store.dismissError}>
            OK
          </button>
        </div>
      )}

      {showGuide && <FirstSolGuide onDone={finishGuide} />}
    </div>
  );
}
