import { SoundOffIcon, SoundOnIcon } from './Icons';

/**
 * A mute button. Its name is exactly what it shows, "Sound on" or "Sound off",
 * so screen reader and voice control users hear and say the same words. The
 * icon also changes, so the state never relies on colour.
 */
export function SoundToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" className={`sound-toggle${on ? '' : ' is-off'}`} onClick={() => onChange(!on)}>
      {on ? <SoundOnIcon size={24} /> : <SoundOffIcon size={24} />}
      <span>{on ? 'Sound on' : 'Sound off'}</span>
    </button>
  );
}
