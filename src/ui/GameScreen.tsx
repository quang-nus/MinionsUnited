import { useEffect, useRef, useState } from 'react';
import { starProgress } from '../engine/research';
import type { GameState, Scenario } from '../engine/types';
import { readGuideSeen, writeGuideSeen, type GameStore } from '../store';
import { ActionPanel } from './ActionPanel';
import { CrewPanel } from './CrewPanel';
import { EndSolButton } from './EndSolButton';
import { EventLog } from './EventLog';
import { FirstSolGuide } from './FirstSolGuide';
import { ForecastPanel } from './ForecastPanel';
import { FlareIcon, WarningIcon } from './Icons';
import { NO_EVENTS, starMessages, type NightEvents, type NumberedEvents } from './nightEvents';
import { ResourceBar } from './ResourceBar';
import { playSound } from './sound';
import { SoundToggle } from './SoundToggle';
import type { StarAnimation } from './StarSlots';
import { dateRange } from './format';

/** How long the flare flash stays on screen, in milliseconds. */
const FLARE_FLASH_MS = 1800;
/** Star changes wait until the night's events have been shown. */
const STAR_DELAY_AFTER_FLARE_MS = FLARE_FLASH_MS + 200;
const STAR_DELAY_AFTER_RETURN_MS = 1200;
const STAR_DELAY_MS = 400;
/** How long the star message stays on screen. */
const STAR_MESSAGE_MS = 4500;

function starDelay(events: NightEvents): number {
  if (events.flare) return STAR_DELAY_AFTER_FLARE_MS;
  if (events.returnedIds.length > 0) return STAR_DELAY_AFTER_RETURN_MS;
  return STAR_DELAY_MS;
}

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
  const [starAnimation, setStarAnimation] = useState<StarAnimation | null>(null);
  const [starsShownFor, setStarsShownFor] = useState<number | null>(null);

  // Events from before this screen appeared (for example, coming back from
  // the About page) are not shown again.
  const firstCount = useRef(night.count);
  const fresh = night.count !== firstCount.current;
  const events = fresh ? night.events : NO_EVENTS;

  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  useEffect(() => {
    if (!fresh || !night.events.flare) return undefined;
    setFlashKey(night.count);
    const timer = window.setTimeout(() => setFlashKey(null), FLARE_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [night, fresh]);

  // Star changes: shown once the night's events are over, with a message and a sound.
  useEffect(() => {
    if (!fresh || night.events.stars.length === 0) return undefined;
    const changes = night.events.stars;
    const show = window.setTimeout(() => {
      setStarsShownFor(night.count);
      setStarAnimation({ count: night.count, changes });
      if (changes.some((c) => c.kind === 'gained')) playSound('starGained', soundRef.current);
      else if (changes.some((c) => c.kind === 'lost')) playSound('starLost', soundRef.current);
    }, starDelay(night.events));
    const hide = window.setTimeout(
      () => setStarAnimation((a) => (a?.count === night.count ? null : a)),
      starDelay(night.events) + STAR_MESSAGE_MS,
    );
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [night, fresh]);

  // Until the night's star change is shown, the slots keep their look from before the night.
  const waitingForStars = fresh && night.events.stars.length > 0 && starsShownFor !== night.count;
  const stars = waitingForStars && night.events.starsBefore !== null ? night.events.starsBefore : starProgress(game);
  const starLines = starAnimation === null ? [] : starMessages(starAnimation.changes);

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

      <ResourceBar game={game} stars={stars} starAnimation={starAnimation} />

      <main className="middle">
        <div className="left">
          <CrewPanel game={game} onCure={store.cure} returned={{ count: night.count, events }} />
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
        {announcement(game, events)}
      </p>
      <p className="visually-hidden" aria-live="polite">
        {starLines.join(' ')}
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
