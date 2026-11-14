import { useEffect, useRef, useState } from 'react';
import { buyLifeSupport, buyShielding, launchResearch, requestComms } from '../engine/actions';
import {
  COMMS_POWER_COST,
  DAILY_SHIELDING_USE,
  FLARE_SHIELDING_USE,
  LIFE_SUPPORT_POWER_COST,
  RESEARCH_LAUNCH_LIFE_SUPPORT_COST,
  SHIELDING_POWER_COST,
} from '../engine/constants';
import type { GameState } from '../engine/types';
import type { GameStore } from '../store';
import { Face } from './Face';
import { CommsIcon, InfoIcon, LifeSupportIcon, ResearchIcon, ShieldIcon, WarningIcon } from './Icons';
import { lifeSupportTonight, shieldingAdvice, shieldingWanted, type ShieldingAdvice } from '../engine/day';

const MAX_STEP = 99;

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="stepper" role="group" aria-label={`How much ${label}`}>
      <button
        type="button"
        className="step"
        aria-label={`One less ${label}`}
        disabled={value <= 1}
        onClick={() => onChange(Math.max(1, value - 1))}
      >
        −
      </button>
      <output className="step-value" aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className="step"
        aria-label={`One more ${label}`}
        disabled={value >= MAX_STEP}
        onClick={() => onChange(Math.min(MAX_STEP, value + 1))}
      >
        +
      </button>
    </div>
  );
}

interface ExplorerChoice {
  id: number;
  name: string;
  index: number;
}

/** A small dialog to choose who goes exploring. Escape or "Not now" closes it. */
function ExplorerPicker({
  choices,
  onPick,
  onClose,
}: {
  choices: readonly ExplorerChoice[];
  onPick: (id: number) => void;
  onClose: () => void;
}) {
  const firstButton = useRef<HTMLButtonElement>(null);
  useEffect(() => firstButton.current?.focus(), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div
        className="dialog picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="picker-title">
          <ResearchIcon size={28} /> Who should go exploring?
        </h2>
        <p>You can't call them back. They return when they are ready.</p>
        <p>The longer they stay, the more they find.</p>
        <div className="pick-list">
          {choices.map((choice, i) => (
            <button
              key={choice.id}
              ref={i === 0 ? firstButton : undefined}
              type="button"
              className="pick-button"
              onClick={() => onPick(choice.id)}
            >
              <Face index={choice.index} status="base" />
              <span>{choice.name}</span>
            </button>
          ))}
        </div>
        <div className="dialog-buttons">
          <button type="button" className="pick-cancel" onClick={onClose}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

/** The words for each piece of shielding advice. The engine decides which one applies. */
function shieldingAdviceText(advice: ShieldingAdvice): string | null {
  switch (advice) {
    case 'more-than-flare':
      return `Too many! Even a flare night uses only ${DAILY_SHIELDING_USE + FLARE_SHIELDING_USE}. The rest wears out by morning.`;
    case 'more-than-tonight':
      return `Tonight uses only ${DAILY_SHIELDING_USE}. More helps only if a flare hits tonight. The rest wears out by morning.`;
    case 'ok':
      return null;
  }
}

/**
 * The shielding tile's sentence. An action error comes first; then any advice
 * about buying more than tonight can use; otherwise the usual sentence. The
 * advice sits in a polite live region that is always on the page, so screen
 * readers hear it when it appears or changes without being interrupted.
 */
function ShieldingText({ error, advice }: { error: string | undefined; advice: ShieldingAdvice }) {
  const words = error === undefined ? shieldingAdviceText(advice) : null;
  const strong = advice === 'more-than-flare';
  return (
    <>
      <div className="advice-live" aria-live="polite">
        {words !== null && (
          <p className={`action-text shield-advice ${strong ? 'is-strong' : 'is-gentle'}`}>
            {strong ? <WarningIcon size={16} /> : <InfoIcon size={16} />} {words}
          </p>
        )}
      </div>
      {words === null && (
        <ActionText error={error}>Shields block radiation for one night only.</ActionText>
      )}
    </>
  );
}

/** The tile's sentence, or, when the action cannot be used, the reason why. */
function ActionText({ error, children }: { error: string | undefined; children: React.ReactNode }) {
  return error === undefined ? (
    <p className="action-text">{children}</p>
  ) : (
    <p className="action-text why-not">
      <WarningIcon size={16} /> {error}
    </p>
  );
}

/**
 * GameScreen gives this panel a new key every sol and every new game, so the
 * steppers start again at what tonight still needs.
 */
export function ActionPanel({ game, store }: { game: GameState; store: GameStore }) {
  const lifeShort = Math.max(1, lifeSupportTonight(game) - game.lifeSupport);
  const shieldShort = Math.max(1, shieldingWanted(game) - game.shielding);

  const [lifeQty, setLifeQty] = useState(lifeShort);
  const [shieldQty, setShieldQty] = useState(shieldShort);
  const [picking, setPicking] = useState(false);

  const lifeError = buyLifeSupport(game, lifeQty).error;
  const shieldError = buyShielding(game, shieldQty).error;
  const commsError = requestComms(game).error;

  const launchChoices = game.crew.map((member) => ({
    member,
    error: launchResearch(game, member.id).error,
  }));
  const canLaunch = launchChoices.filter((c) => c.error === undefined);
  const researchError =
    canLaunch.length > 0
      ? undefined
      : (launchChoices.find((c) => c.member.status === 'base')?.error ?? 'Nobody is free to explore.');

  return (
    <section className="panel action-panel" aria-label="What to do today">
      <h2>What will you do today?</h2>
      <div className="action-grid">
        <div className="action action-life">
          <div className="action-head">
            <LifeSupportIcon size={32} />
            <h3>Life support</h3>
            <span className="action-cost">{LIFE_SUPPORT_POWER_COST} power each</span>
          </div>
          <ActionText error={lifeError}>Air, water and food for your crew.</ActionText>
          <div className="action-row">
            <Stepper label="life support" value={lifeQty} onChange={setLifeQty} />
            <button
              type="button"
              className="action-button"
              disabled={lifeError !== undefined}
              aria-label={`Buy ${lifeQty} life support`}
              onClick={() => store.buyLifeSupport(lifeQty)}
            >
              Buy {lifeQty}
            </button>
          </div>
        </div>

        <div className="action action-shield">
          <div className="action-head">
            <ShieldIcon size={32} />
            <h3>Shielding</h3>
            <span className="action-cost">{SHIELDING_POWER_COST} power each</span>
          </div>
          <ShieldingText error={shieldError} advice={shieldingAdvice(game, shieldQty)} />
          <div className="action-row">
            <Stepper label="shielding" value={shieldQty} onChange={setShieldQty} />
            <button
              type="button"
              className="action-button"
              disabled={shieldError !== undefined}
              aria-label={`Buy ${shieldQty} shielding`}
              onClick={() => store.buyShielding(shieldQty)}
            >
              Buy {shieldQty}
            </button>
          </div>
        </div>

        <div className="action action-research">
          <div className="action-head">
            <ResearchIcon size={32} />
            <h3>Research</h3>
            <span className="action-cost">{RESEARCH_LAUNCH_LIFE_SUPPORT_COST} life support</span>
          </div>
          <ActionText error={researchError}>Send someone out to explore Mars.</ActionText>
          <button
            type="button"
            className="action-button wide"
            disabled={researchError !== undefined}
            onClick={() => setPicking(true)}
          >
            Choose an explorer
          </button>
          {picking && (
            <ExplorerPicker
              choices={canLaunch.map(({ member }) => ({
                id: member.id,
                name: member.name,
                index: game.crew.findIndex((m) => m.id === member.id),
              }))}
              onPick={(id) => {
                store.launchResearch(id);
                setPicking(false);
              }}
              onClose={() => setPicking(false)}
            />
          )}
        </div>

        <div className="action action-comms">
          <div className="action-head">
            <CommsIcon size={32} />
            <h3>Communication</h3>
            <span className="action-cost">{COMMS_POWER_COST} power</span>
          </div>
          <ActionText error={commsError}>Ask when a flare is coming. Calls cost a lot of power.</ActionText>
          <button
            type="button"
            className="action-button wide"
            disabled={commsError !== undefined}
            onClick={() => store.requestComms()}
          >
            Call Mission Control
          </button>
        </div>
      </div>
    </section>
  );
}
