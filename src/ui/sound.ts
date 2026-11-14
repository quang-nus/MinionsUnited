// Small sound effects made with the Web Audio API, so there are no sound files
// and no extra dependency. Sound is on by default; the mute choice is
// remembered in localStorage. Nothing here is used by the engine.

export const SOUND_KEY = 'mars-outpost.sound';

export type SoundName = 'endSol' | 'flare' | 'returned' | 'won' | 'lost' | 'starGained' | 'starLost';

/** Reads the remembered setting: anything other than 'off' means sound is on. */
export function parseSoundSetting(text: string | null): boolean {
  return text !== 'off';
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readSoundOn(): boolean {
  try {
    return parseSoundSetting(storage()?.getItem(SOUND_KEY) ?? null);
  } catch {
    return true;
  }
}

export function writeSoundOn(on: boolean): void {
  try {
    storage()?.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked: the setting lasts until the page is closed.
  }
}

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctor === undefined) return null;
  try {
    context ??= new Ctor();
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

interface Note {
  freq: number;
  start: number; // seconds after now
  length: number; // seconds
  type?: OscillatorType;
  volume?: number;
  slideTo?: number; // frequency at the end of the note
}

const SOUNDS: Record<SoundName, readonly Note[]> = {
  // A soft falling "whoosh" as the sun sets.
  endSol: [{ freq: 520, slideTo: 260, start: 0, length: 0.35, type: 'sine', volume: 0.12 }],
  // A low warning rumble with a bright crackle on top.
  flare: [
    { freq: 110, slideTo: 70, start: 0, length: 0.9, type: 'sawtooth', volume: 0.1 },
    { freq: 880, slideTo: 1320, start: 0.05, length: 0.25, type: 'square', volume: 0.05 },
    { freq: 990, slideTo: 1480, start: 0.3, length: 0.2, type: 'square', volume: 0.04 },
  ],
  // A happy rising two-note chime.
  returned: [
    { freq: 660, start: 0, length: 0.16, type: 'triangle', volume: 0.16 },
    { freq: 990, start: 0.14, length: 0.28, type: 'triangle', volume: 0.16 },
  ],
  // A quick sparkly run up for a new star.
  starGained: [
    { freq: 784, start: 0, length: 0.12, type: 'triangle', volume: 0.14 },
    { freq: 1047, start: 0.09, length: 0.12, type: 'triangle', volume: 0.14 },
    { freq: 1319, start: 0.18, length: 0.12, type: 'triangle', volume: 0.14 },
    { freq: 1568, start: 0.27, length: 0.3, type: 'sine', volume: 0.12 },
  ],
  // A soft sliding-down "aww" when a star is lost.
  starLost: [
    { freq: 440, slideTo: 330, start: 0, length: 0.35, type: 'sine', volume: 0.13 },
    { freq: 330, slideTo: 220, start: 0.3, length: 0.45, type: 'sine', volume: 0.12 },
  ],
  won: [
    { freq: 523, start: 0, length: 0.18, type: 'triangle', volume: 0.16 },
    { freq: 659, start: 0.16, length: 0.18, type: 'triangle', volume: 0.16 },
    { freq: 784, start: 0.32, length: 0.18, type: 'triangle', volume: 0.16 },
    { freq: 1047, start: 0.48, length: 0.45, type: 'triangle', volume: 0.16 },
  ],
  lost: [
    { freq: 392, start: 0, length: 0.25, type: 'sine', volume: 0.14 },
    { freq: 330, start: 0.22, length: 0.25, type: 'sine', volume: 0.14 },
    { freq: 262, start: 0.44, length: 0.5, type: 'sine', volume: 0.14 },
  ],
};

/** Plays a sound if sound is on. Never throws. */
export function playSound(name: SoundName, on: boolean): void {
  if (!on) return;
  const ctx = audio();
  if (ctx === null) return;
  try {
    const now = ctx.currentTime;
    for (const note of SOUNDS[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = now + note.start;
      const t1 = t0 + note.length;
      osc.type = note.type ?? 'sine';
      osc.frequency.setValueAtTime(note.freq, t0);
      if (note.slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(note.slideTo, t1);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(note.volume ?? 0.12, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t1 + 0.05);
    }
  } catch {
    // Audio not available: play silently.
  }
}
