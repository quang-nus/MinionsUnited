import { useEffect, useRef, useState } from 'react';
import { FLARE_EVACUATIONS_UNSHIELDED, FLARE_SHIELDING_USE } from '../engine/constants';
import type { GameState } from '../engine/types';
import { SunsetIcon, WarningIcon } from './Icons';
import { flareForecastTonight, lifeSupportTonight, shieldingTonight } from '../engine/day';

function problemsTonight(game: GameState): string[] {
  const problems: string[] = [];
  const life = lifeSupportTonight(game);
  if (game.lifeSupport < life) {
    problems.push(`Life support: you need ${life} but have ${game.lifeSupport}. Someone may have to leave.`);
  }
  const shield = shieldingTonight();
  if (game.shielding < shield) {
    problems.push(`Shielding: you need ${shield} but have ${game.shielding}. The crew could get sick.`);
  } else if (flareForecastTonight(game) && game.shielding < shield + FLARE_SHIELDING_USE) {
    problems.push(
      `A flare may hit tonight. Shields need ${shield + FLARE_SHIELDING_USE}, and you have ${game.shielding}. ` +
        `${FLARE_EVACUATIONS_UNSHIELDED} crew could be evacuated.`,
    );
  }
  return problems;
}

export function EndSolButton({ game, onEndSol }: { game: GameState; onEndSol: () => void }) {
  const [asking, setAsking] = useState(false);
  const backRef = useRef<HTMLButtonElement>(null);
  const problems = problemsTonight(game);

  useEffect(() => {
    if (asking) backRef.current?.focus();
  }, [asking]);

  useEffect(() => {
    if (!asking) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAsking(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [asking]);

  const end = () => {
    setAsking(false);
    onEndSol();
  };

  return (
    <>
      <button
        type="button"
        className="end-sol"
        onClick={() => (problems.length > 0 ? setAsking(true) : end())}
      >
        <SunsetIcon size={36} />
        <span>
          End sol {game.sol}
          <small>Go to sleep and see what happens</small>
        </span>
      </button>

      {asking && (
        <div className="overlay" role="presentation" onClick={() => setAsking(false)}>
          <div
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="confirm-title">
              <WarningIcon size={28} /> Are you sure?
            </h2>
            <ul className="problem-list">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
            <div className="dialog-buttons">
              <button type="button" ref={backRef} className="dialog-back" onClick={() => setAsking(false)}>
                Go back
              </button>
              <button type="button" className="dialog-go" onClick={end}>
                End the sol anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
