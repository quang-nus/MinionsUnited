import type { CrewStatus } from '../engine/types';

const SKIN = ['#8D5A3B', '#E9B48A', '#C68642', '#F1C9A5'];
const SUIT = ['#E8A400', '#14897A', '#6A4BB5', '#D2552F'];

/** A simple astronaut face. The expression follows the crew member's status. */
export function Face({ index, status }: { index: number; status: CrewStatus }) {
  const skin = SKIN[index % SKIN.length];
  const suit = SUIT[index % SUIT.length];
  const sick = status === 'sick';
  const away = status === 'evacuated';

  return (
    <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" focusable="false" className="face">
      {/* helmet ring */}
      <circle cx="32" cy="32" r="30" fill={away ? '#C9BDB4' : suit} />
      <circle cx="32" cy="32" r="23" fill={away ? '#E6DED8' : skin} />
      {sick && <circle cx="32" cy="32" r="23" fill="#9BC53D" opacity="0.35" />}
      {/* eyes */}
      {sick ? (
        <>
          <path d="M22 28h6M36 28h6" stroke="#3B1F2B" strokeWidth="3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="25" cy="28" r="3" fill="#3B1F2B" />
          <circle cx="39" cy="28" r="3" fill="#3B1F2B" />
        </>
      )}
      {/* mouth */}
      {sick ? (
        <path d="M25 42q7-5 14 0" stroke="#3B1F2B" strokeWidth="3" fill="none" strokeLinecap="round" />
      ) : away ? (
        <path d="M26 41h12" stroke="#3B1F2B" strokeWidth="3" strokeLinecap="round" />
      ) : (
        <path d="M24 38q8 8 16 0" stroke="#3B1F2B" strokeWidth="3" fill="none" strokeLinecap="round" />
      )}
      {/* visor glint while exploring */}
      {status === 'expedition' && (
        <path d="M12 22a22 22 0 0 1 14-12" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.8" />
      )}
      {/* thermometer when sick */}
      {sick && (
        <g transform="rotate(25 46 44)">
          <rect x="43" y="36" width="6" height="18" rx="3" fill="#fff" stroke="#3B1F2B" strokeWidth="1.5" />
          <rect x="45" y="44" width="2" height="8" rx="1" fill="#C62828" />
        </g>
      )}
    </svg>
  );
}
