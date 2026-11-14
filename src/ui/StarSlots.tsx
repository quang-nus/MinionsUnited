import { useEffect, useRef, useState } from 'react';
import { CREW_SIZE, SOLS_TOTAL, STARS_2_RESEARCH, STARS_3_RESEARCH } from '../engine/constants';
import type { StarChange, StarProgress, StarSlotState } from '../engine/research';
import { StarIcon } from './Icons';
import { starMessages } from './nightEvents';

/** A star animation in progress: which slots changed, numbered so it can replay. */
export interface StarAnimation {
  count: number;
  changes: readonly StarChange[];
}

const STAR_PATH = 'M12 2.8l2.8 5.8 6.4.8-4.7 4.4 1.2 6.3L12 17l-5.7 3.1 1.2-6.3-4.7-4.4 6.4-.8z';

/**
 * Three looks that differ in shape, not only colour: lit is filled, open is a
 * plain outline, out of reach is a dashed outline crossed by a slash.
 */
function StarShape({ state }: { state: StarSlotState }) {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" focusable="false" className="star-shape">
      <path
        d={STAR_PATH}
        className={`star-path is-${state}`}
        strokeLinejoin="round"
        strokeDasharray={state === 'out-of-reach' ? '2.2 1.8' : undefined}
      />
      {state === 'out-of-reach' && <path d="M4 20 20 4" className="star-slash" strokeLinecap="round" />}
    </svg>
  );
}

interface SlotInfo {
  n: 1 | 2 | 3;
  state: StarSlotState;
  /** Read by screen readers: goal and state. */
  label: string;
  /** Shown in the tip: the goal in plain words, then the state. */
  goal: string;
  status: string;
}

function stateWords(state: StarSlotState): string {
  switch (state) {
    case 'lit':
      return 'Earned.';
    case 'open':
      return 'Not yet earned.';
    case 'out-of-reach':
      return 'Out of reach: someone was evacuated.';
  }
}

function slotsFor(progress: StarProgress): SlotInfo[] {
  const make = (n: 1 | 2 | 3, state: StarSlotState, short: string, goal: string): SlotInfo => ({
    n,
    state,
    label: `Star ${n}: ${short}. ${stateWords(state)}`,
    goal,
    status: stateWords(state),
  });
  return [
    make(1, progress.finish, 'finish the mission', `Finish all ${SOLS_TOTAL} sols.`),
    make(2, progress.research, `${STARS_2_RESEARCH} research`, `Collect ${STARS_2_RESEARCH} research.`),
    make(
      3,
      progress.fullCrew,
      `all ${CREW_SIZE} crew on Mars and ${STARS_3_RESEARCH} research`,
      `Keep all ${CREW_SIZE} crew on Mars and collect ${STARS_3_RESEARCH} research.`,
    ),
  ];
}

/**
 * The three star slots beside the research score. Tapping, hovering or
 * focusing a slot shows its goal in a small tip. Animations come from
 * `animation` and run only when the game screen says a star changed.
 */
export function StarSlots({ progress, animation }: { progress: StarProgress; animation: StarAnimation | null }) {
  const [tip, setTip] = useState<number | null>(null);
  // A tap focuses the slot (opening its tip) and then clicks it, so the click
  // looks at whether the tip was open before the tap began.
  const openBeforePress = useRef(false);

  useEffect(() => {
    if (tip === null) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTip(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tip]);

  return (
    <div className="star-slots" role="group" aria-label="Stars you can earn">
      {slotsFor(progress).map((slot) => {
        const change = animation?.changes.find((c) => c.slot === slot.n);
        return (
          <div key={slot.n} className="star-slot-wrap">
            <button
              // A new key restarts the animation each time this slot changes.
              key={change !== undefined && animation !== null ? `anim-${animation.count}` : 'still'}
              type="button"
              className={`star-slot is-${slot.state}${change !== undefined ? ` anim-${change.kind}` : ''}`}
              aria-label={slot.label}
              onPointerDown={() => {
                openBeforePress.current = tip === slot.n;
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') openBeforePress.current = tip === slot.n;
              }}
              onClick={() => setTip(openBeforePress.current ? null : slot.n)}
              onFocus={() => setTip(slot.n)}
              onBlur={() => setTip((t) => (t === slot.n ? null : t))}
              // Hover only for a real mouse: touch screens send mouse events after a tap.
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse') setTip(slot.n);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === 'mouse') setTip((t) => (t === slot.n ? null : t));
              }}
            >
              <StarShape state={slot.state} />
              {change?.kind === 'gained' && (
                <span className="sparkles" aria-hidden="true">
                  {Array.from({ length: 6 }, (_, i) => (
                    <span key={i} className={`sparkle sparkle-${i + 1}`} />
                  ))}
                </span>
              )}
              {change?.kind === 'lost' && (
                <span className="star-ghost" aria-hidden="true">
                  <StarShape state="lit" />
                </span>
              )}
            </button>
            {tip === slot.n && (
              <span className="star-tip" aria-hidden="true">
                <strong>Star {slot.n}</strong> {slot.goal} <em>{slot.status}</em>
              </span>
            )}
          </div>
        );
      })}
      {animation !== null && starMessages(animation.changes).length > 0 && (
        // Visual only: GameScreen announces the same words in a polite live region.
        <div key={animation.count} className={`star-toast ${toneOf(animation.changes)}`} aria-hidden="true">
          <StarIcon size={20} />
          <span>
            {starMessages(animation.changes).map((line) => (
              <span key={line} className="star-toast-line">
                {line}
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

function toneOf(changes: readonly StarChange[]): string {
  if (changes.some((c) => c.kind === 'gained')) return 'is-gain';
  if (changes.some((c) => c.kind === 'lost')) return 'is-loss';
  return 'is-quiet';
}
