import { useEffect, useRef } from 'react';
import { CREW_SIZE, SOLS_TOTAL, STARS_2_RESEARCH, STARS_3_RESEARCH } from '../engine/constants';
import { addDays, flaresBySol } from '../engine/flares';
import { starGoals, starsFor, type StarCount } from '../engine/research';
import type { GameState, LogEntry, Scenario } from '../engine/types';
import { formatDate, formatPeak } from './format';
import { FlareIcon, GoalDoneIcon, GoalOpenIcon, LifeSupportIcon, ResearchIcon, RocketIcon, ShieldIcon, SunIcon } from './Icons';

interface EndScreenProps {
  game: GameState;
  scenario: Scenario;
  onPlayAgain: () => void;
  onMenu: () => void;
  onAbout: () => void;
}

function Stars({ count }: { count: StarCount }) {
  return (
    <div className="stars" role="img" aria-label={`${count} of 3 stars`}>
      {[1, 2, 3].map((n) => (
        <svg key={n} viewBox="0 0 24 24" width="56" height="56" aria-hidden="true" className={n <= count ? 'star on' : 'star off'}>
          <path d="m12 2.5 2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6-4.9-4.6 6.6-.8z" />
        </svg>
      ))}
    </div>
  );
}

/**
 * The three star goals as a checklist. Each goal has an icon and words for
 * its state, so it never relies on colour; screen readers hear "Done" or
 * "Not yet" before each goal.
 */
function StarGoalList({ game }: { game: GameState }) {
  const goals = starGoals(game);
  const rows = [
    { done: goals.won, text: 'You finished the mission.' },
    { done: goals.research, text: `You collected ${STARS_2_RESEARCH} research or more.` },
    {
      done: goals.fullCrew,
      text: `All ${CREW_SIZE} crew stayed on Mars and you collected ${STARS_3_RESEARCH} research or more.`,
    },
  ];
  return (
    <ul className="star-goals" aria-label="How to earn stars">
      {rows.map((row) => (
        <li key={row.text} className={row.done ? 'goal is-done' : 'goal is-open'}>
          {row.done ? <GoalDoneIcon size={24} /> : <GoalOpenIcon size={24} />}
          <span>
            <span className="visually-hidden">{row.done ? 'Done: ' : 'Not yet: '}</span>
            {row.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** One row per sol: its real date, any real flare, and what happened. */
function Recap({ game, scenario }: { game: GameState; scenario: Scenario }) {
  const flares = flaresBySol(scenario);
  const bySol = new Map<number, LogEntry[]>();
  for (const entry of game.log) {
    if (entry.tag === 'routine' || entry.tag === 'forecast' || entry.tag === 'end') continue;
    bySol.set(entry.sol, [...(bySol.get(entry.sol) ?? []), entry]);
  }

  return (
    <ol className="recap" tabIndex={0} aria-label="Your mission, sol by sol">
      {Array.from({ length: SOLS_TOTAL }, (_, i) => i + 1).map((sol) => {
        const flare = flares.get(sol);
        const strongest = flare?.[0];
        const events = bySol.get(sol) ?? [];
        return (
          <li key={sol} className={`recap-row${flare ? ' has-flare' : ''}`}>
            <div className="recap-when">
              <strong>Sol {sol}</strong>
              <span>{formatDate(addDays(scenario.startDate, sol - 1))}</span>
            </div>
            <div className="recap-what">
              {strongest && (
                <p className="recap-flare">
                  <FlareIcon size={18} /> Real solar flare, class {strongest.classType}, peaked{' '}
                  {formatPeak(strongest.peakTime ?? '')}.
                  {flare && flare.length > 1 && ` There were ${flare.length} big flares that day.`}
                </p>
              )}
              {events.length === 0 && !strongest && <p className="recap-quiet">A quiet sol.</p>}
              {events.map((e, index) => (
                <p key={index}>{e.text}</p>
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Which resource ran out, from the last time someone had to leave. */
function lossReason(game: GameState): 'life-support' | 'shielding' {
  const last = [...game.log].reverse().find((e) => e.tag === 'evacuated-life-support' || e.tag === 'evacuated-flare');
  return last?.tag === 'evacuated-flare' ? 'shielding' : 'life-support';
}

export function EndScreen({ game, scenario, onPlayAgain, onMenu, onAbout }: EndScreenProps) {
  const playButton = useRef<HTMLButtonElement>(null);
  useEffect(() => playButton.current?.focus(), []);
  const won = game.status === 'won';
  const onMars = game.crew.filter((m) => m.status !== 'evacuated').length;

  return (
    <main className="screen">
      <div className={`screen-card end-card ${won ? 'is-won' : 'is-lost'}`}>
        {won ? (
          <>
            <div className="end-icon">
              <SunIcon size={56} />
            </div>
            <h1 className="screen-title">Mission complete!</h1>
            <Stars count={starsFor(game)} />
            <StarGoalList game={game} />
            <p className="end-score">
              <ResearchIcon size={30} /> You collected <strong>{game.research}</strong> research.
            </p>
            <p>
              {onMars} of {game.crew.length} crew stayed on Mars for all {SOLS_TOTAL} sols.
            </p>
            <h2 className="recap-title">Your mission, sol by sol</h2>
            <Recap game={game} scenario={scenario} />
          </>
        ) : (
          <>
            <div className="end-icon">
              <RocketIcon size={56} />
            </div>
            <h1 className="screen-title">Everyone is safe on the rescue ship.</h1>
            <p>The mission ended on sol {game.sol}.</p>
            {lossReason(game) === 'life-support' ? (
              <div className="loss-box">
                <p className="loss-what">
                  <LifeSupportIcon size={28} /> Life support ran out.
                </p>
                <p className="loss-tip">
                  Tip: check the life support meter before you end each sol. Sick crew need 2.
                </p>
              </div>
            ) : (
              <div className="loss-box">
                <p className="loss-what">
                  <ShieldIcon size={28} /> The shields were too weak for a solar flare.
                </p>
                <p className="loss-tip">
                  Tip: shields wear out every night. Call Mission Control, and buy 17 on a flare night.
                </p>
              </div>
            )}
            <p className="end-score">
              <ResearchIcon size={30} /> You collected <strong>{game.research}</strong> research.
            </p>
          </>
        )}

        <div className="screen-buttons">
          <button type="button" ref={playButton} className="big-button" onClick={onPlayAgain}>
            Play again
          </button>
          <button type="button" className="big-button secondary" onClick={onMenu}>
            Menu
          </button>
        </div>
        <button type="button" className="link-button" onClick={onAbout}>
          About the science
        </button>
      </div>
    </main>
  );
}
