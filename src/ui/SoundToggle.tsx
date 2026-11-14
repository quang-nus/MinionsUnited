import { SoundOffIcon, SoundOnIcon } from './Icons';

/** A mute button. The label stays the same; aria-pressed says whether sound is on. */
export function SoundToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      className="sound-toggle"
      aria-pressed={on}
      aria-label="Sound effects"
      onClick={() => onChange(!on)}
    >
      {on ? <SoundOnIcon size={24} /> : <SoundOffIcon size={24} />}
      <span aria-hidden="true">{on ? 'Sound on' : 'Sound off'}</span>
    </button>
  );
}
