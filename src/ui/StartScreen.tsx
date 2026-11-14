import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CREW_NAME_MAX_LENGTH, CREW_SIZE, SOLS_TOTAL } from '../engine/constants';
import { cleanCrewNames, defaultCrewName } from '../engine/day';
import type { Scenario } from '../engine/types';
import type { SavedGame } from '../store';
import { dateRange } from './format';
import { Face } from './Face';
import { SunIcon } from './Icons';
import { SoundToggle } from './SoundToggle';

interface StartScreenProps {
  hasScenarios: boolean;
  saved: SavedGame | null;
  soundOn: boolean;
  onSoundChange: (on: boolean) => void;
  onStart: () => void;
  onContinue: () => void;
  onAbout: () => void;
}

export function StartScreen({
  hasScenarios,
  saved,
  soundOn,
  onSoundChange,
  onStart,
  onContinue,
  onAbout,
}: StartScreenProps) {
  const firstButton = useRef<HTMLButtonElement>(null);
  useEffect(() => firstButton.current?.focus(), []);

  return (
    <main className="screen">
      <div className="screen-card start-card">
        <div className="start-sound">
          <SoundToggle on={soundOn} onChange={onSoundChange} />
        </div>
        <div className="start-sun">
          <SunIcon size={56} />
        </div>
        <h1 className="screen-title">Mars Outpost</h1>
        <ol className="how-to">
          <li>Keep four astronauts safe on Mars for {SOLS_TOTAL} sols.</li>
          <li>Each sol, spend power on what the base needs.</li>
          <li>Real solar flares will hit, so plan ahead!</li>
        </ol>
        <p className="screen-note">A sol is one day on Mars.</p>

        {!hasScenarios && (
          <p className="screen-warning">No flare data yet. Run the fetch script to download some.</p>
        )}

        <div className="screen-buttons">
          {saved !== null && (
            <button type="button" ref={firstButton} className="big-button" onClick={onContinue}>
              Continue
              <small>
                {saved.scenario.name}, sol {saved.game.sol} of {SOLS_TOTAL}
              </small>
            </button>
          )}
          <button
            type="button"
            ref={saved === null ? firstButton : undefined}
            className={saved === null ? 'big-button' : 'big-button secondary'}
            disabled={!hasScenarios}
            onClick={onStart}
          >
            Start a new mission
          </button>
        </div>

        <button type="button" className="link-button" onClick={onAbout}>
          About the science
        </button>
      </div>
    </main>
  );
}

interface BriefingProps {
  scenario: Scenario;
  replacesSave: boolean;
  initialNames: readonly string[];
  onBegin: (names: string[]) => void;
  onBack: () => void;
}

/**
 * Shown after a scenario is picked: its name, real dates and that the data is
 * archived, then four boxes to name the crew. Enter in any box begins.
 */
export function BriefingScreen({ scenario, replacesSave, initialNames, onBegin, onBack }: BriefingProps) {
  const [names, setNames] = useState<string[]>(() =>
    Array.from({ length: CREW_SIZE }, (_, i) => initialNames[i] ?? defaultCrewName(i)),
  );
  const firstBox = useRef<HTMLInputElement>(null);
  useEffect(() => firstBox.current?.focus(), []);

  const begin = (event: FormEvent) => {
    event.preventDefault();
    onBegin(cleanCrewNames(names));
  };

  return (
    <main className="screen">
      <form className="screen-card briefing-card" onSubmit={begin}>
        <p className="screen-kicker">Your mission</p>
        <h1 className="screen-title">{scenario.name}</h1>
        <p className="briefing-dates">
          Archived NASA data from {dateRange(scenario.startDate, scenario.endDate)}
        </p>
        <p>The solar flares in this mission really happened on these dates.</p>

        <fieldset className="crew-naming">
          <legend>Name your crew</legend>
          <p className="screen-note">Use first names or nicknames.</p>
          <div className="name-grid">
            {names.map((name, index) => {
              const id = `crew-name-${index + 1}`;
              return (
                <div key={id} className="name-row">
                  <Face index={index} status="base" />
                  <label className="visually-hidden" htmlFor={id}>
                    Name for crew member {index + 1}
                  </label>
                  <input
                    id={id}
                    ref={index === 0 ? firstBox : undefined}
                    className="name-input"
                    type="text"
                    value={name}
                    maxLength={CREW_NAME_MAX_LENGTH}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => {
                      const next = [...names];
                      next[index] = event.target.value;
                      setNames(next);
                    }}
                  />
                </div>
              );
            })}
          </div>
        </fieldset>

        {replacesSave && <p className="screen-warning">Starting will replace your saved mission.</p>}
        <div className="screen-buttons">
          <button type="submit" className="big-button">
            Begin the mission
          </button>
          <button type="button" className="big-button secondary" onClick={onBack}>
            Back
          </button>
        </div>
      </form>
    </main>
  );
}
