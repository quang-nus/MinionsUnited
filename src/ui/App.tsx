import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState, Scenario } from '../engine/types';
import {
  allScenarios,
  pickScenario,
  readCrewNames,
  readLastScenarioId,
  readSave,
  useGameStore,
  type SavedGame,
} from '../store';
import { AboutScreen } from './AboutScreen';
import { EndScreen } from './EndScreen';
import { GameScreen } from './GameScreen';
import { NO_EVENTS, nightEvents, type NumberedEvents } from './nightEvents';
import { playSound, readSoundOn, writeSoundOn } from './sound';
import { BriefingScreen, StartScreen } from './StartScreen';
import './game.css';
import './screens.css';

type Screen =
  | { name: 'start' }
  | { name: 'briefing'; scenario: Scenario }
  | { name: 'game' }
  | { name: 'about'; back: Exclude<Screen, { name: 'about' }> };

export function App() {
  const scenarios = useMemo(() => allScenarios(), []);
  const store = useGameStore();
  const [screen, setScreen] = useState<Screen>({ name: 'start' });
  const [saved, setSaved] = useState<SavedGame | null>(() => readSave(scenarios));
  const [soundOn, setSoundOnState] = useState(readSoundOn);
  const [night, setNight] = useState<NumberedEvents>({ count: 0, events: NO_EVENTS });
  const previousGame = useRef<GameState | null>(null);

  const setSoundOn = (on: boolean) => {
    writeSoundOn(on);
    setSoundOnState(on);
  };

  // After each end of sol: pick a sound and tell the screens what happened.
  useEffect(() => {
    const game = store.game;
    const events = game === null ? NO_EVENTS : nightEvents(previousGame.current, game);
    previousGame.current = game;
    if (game === null || !events.solEnded) return;
    if (game.status === 'won') playSound('won', soundOn);
    else if (game.status === 'lost') playSound('lost', soundOn);
    else if (events.flare) playSound('flare', soundOn);
    else if (events.returnedIds.length > 0) playSound('returned', soundOn);
    else playSound('endSol', soundOn);
    setNight((previous) => ({ count: previous.count + 1, events }));
    // Sound is read when the sol ends, so turning it on or off never replays a sound.
  }, [store.game]);

  const goToStart = () => {
    store.leave();
    setSaved(readSave(scenarios));
    setScreen({ name: 'start' });
  };

  const newMission = () => {
    // Answer 17: the store side picks at random, never the engine.
    const scenario = pickScenario(scenarios, readLastScenarioId(), Math.random());
    if (scenario !== undefined) {
      setSaved(readSave(scenarios));
      setScreen({ name: 'briefing', scenario });
    }
  };

  const showAbout = () => {
    if (screen.name !== 'about') setScreen({ name: 'about', back: screen });
  };

  switch (screen.name) {
    case 'start':
      return (
        <StartScreen
          hasScenarios={scenarios.length > 0}
          saved={saved}
          soundOn={soundOn}
          onSoundChange={setSoundOn}
          onStart={newMission}
          onContinue={() => {
            if (saved === null) return;
            store.resume(saved);
            setNight({ count: 0, events: NO_EVENTS });
            setScreen({ name: 'game' });
          }}
          onAbout={showAbout}
        />
      );

    case 'briefing':
      return (
        <BriefingScreen
          scenario={screen.scenario}
          replacesSave={saved !== null}
          initialNames={readCrewNames()}
          onBegin={(names) => {
            store.start(screen.scenario, names);
            setNight({ count: 0, events: NO_EVENTS });
            setScreen({ name: 'game' });
          }}
          onBack={goToStart}
        />
      );

    case 'about':
      return <AboutScreen scenarios={scenarios} onBack={() => setScreen(screen.back)} />;

    case 'game': {
      const { game, scenario } = store;
      if (game === null || scenario === null) {
        return (
          <StartScreen
            hasScenarios={scenarios.length > 0}
            saved={saved}
            soundOn={soundOn}
            onSoundChange={setSoundOn}
            onStart={newMission}
            onContinue={goToStart}
            onAbout={showAbout}
          />
        );
      }
      if (game.status !== 'playing') {
        return (
          <EndScreen game={game} scenario={scenario} onPlayAgain={newMission} onMenu={goToStart} onAbout={showAbout} />
        );
      }
      return (
        <GameScreen
          store={store}
          scenario={scenario}
          game={game}
          night={night}
          soundOn={soundOn}
          onSoundChange={setSoundOn}
          onMenu={goToStart}
          onAbout={showAbout}
        />
      );
    }
  }
}
