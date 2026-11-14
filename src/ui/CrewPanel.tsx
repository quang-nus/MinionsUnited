import { cure } from '../engine/actions';
import { CURE_LIFE_SUPPORT_COST } from '../engine/constants';
import type { CrewMember, GameState } from '../engine/types';
import { Face } from './Face';
import { RocketIcon } from './Icons';
import type { NumberedEvents } from './nightEvents';

/** Names longer than this are drawn a little smaller so they fit the card. */
const LONG_NAME = 8;

function statusWords(member: CrewMember): string {
  switch (member.status) {
    case 'base':
      return 'In the base';
    case 'sick':
      return 'Sick';
    case 'expedition':
      return `Exploring, sol ${member.solsOutside + 1}`;
    case 'evacuated':
      return 'On the rescue ship';
  }
}

interface CrewPanelProps {
  game: GameState;
  onCure: (crewId: number) => void;
  /** Crew who came back last night get a short hop and a "Back!" badge. */
  returned: NumberedEvents;
}

export function CrewPanel({ game, onCure, returned }: CrewPanelProps) {
  return (
    <section className="panel crew-panel" aria-label="Your crew">
      <h2>Your crew</h2>
      <ul className="crew-list">
        {game.crew.map((member, index) => {
          const cureError = member.status === 'sick' ? cure(game, member.id).error : undefined;
          const justBack = returned.events.returnedIds.includes(member.id);
          return (
            <li
              key={justBack ? `${member.id}-back-${returned.count}` : member.id}
              className={`crew-card status-${member.status}${justBack ? ' just-returned' : ''}`}
            >
              <Face index={index} status={member.status} />
              <div className="crew-info">
                <div className={`crew-name${Array.from(member.name).length > LONG_NAME ? ' is-long' : ''}`}>
                  {member.name}
                </div>
                <div className="crew-status">
                  {member.status === 'evacuated' && <RocketIcon size={16} />}
                  {statusWords(member)}
                </div>
                {member.status === 'sick' && (
                  <button
                    type="button"
                    className="cure-button"
                    disabled={cureError !== undefined}
                    title={cureError}
                    aria-label={
                      cureError === undefined
                        ? `Cure ${member.name} for ${CURE_LIFE_SUPPORT_COST} life support`
                        : `Cure ${member.name}: needs ${CURE_LIFE_SUPPORT_COST} life support`
                    }
                    onClick={() => onCure(member.id)}
                  >
                    {cureError === undefined
                      ? `Cure: ${CURE_LIFE_SUPPORT_COST} life support`
                      : `Cure needs ${CURE_LIFE_SUPPORT_COST} life support`}
                  </button>
                )}
              </div>
              {justBack && (
                <span className="back-badge" aria-hidden="true">
                  Back!
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
