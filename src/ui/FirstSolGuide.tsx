import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface GuideStep {
  /** CSS selector of the thing to point at. */
  target: string;
  title: string;
  text: string;
}

export const GUIDE_STEPS: readonly GuideStep[] = [
  { target: '.meter-power', title: 'Power', text: 'This is your power. You spend it on everything.' },
  { target: '.action-life', title: 'Life support', text: 'Buy life support. Your crew needs air, water and food.' },
  { target: '.action-shield', title: 'Shielding', text: 'Buy shielding every sol to block space radiation.' },
  { target: '.action-research', title: 'Research', text: 'Send someone exploring. Research is your score!' },
  { target: '.action-comms', title: 'Mission Control', text: 'Call Mission Control to hear when a flare is coming.' },
  { target: '.crew-panel', title: 'Your crew', text: 'This is your crew. Keep them all safe!' },
  { target: '.end-sol', title: 'End the sol', text: 'Done for the day? End the sol and see what happens.' },
];

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const GAP = 14; // space between the ring and the bubble
const MARGIN = 10; // keep the bubble this far from the screen edge
const PAD = 6; // ring padding around the target

function measure(selector: string): Box | null {
  const el = document.querySelector(selector);
  if (el === null) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
}

/**
 * A short guide on sol 1 of the first game. It points at each part of the
 * screen in turn with one sentence. "Skip" or Escape ends it at once.
 */
export function FirstSolGuide({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [ring, setRing] = useState<Box | null>(null);
  const [bubbleSize, setBubbleSize] = useState({ width: 320, height: 150 });
  const bubbleRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = GUIDE_STEPS[index] ?? GUIDE_STEPS[0];
  const last = index === GUIDE_STEPS.length - 1;

  const place = useCallback(() => {
    if (step === undefined) return;
    setRing(measure(step.target));
    const b = bubbleRef.current;
    if (b !== null) setBubbleSize({ width: b.offsetWidth, height: b.offsetHeight });
  }, [step]);

  // Bring the target into view, then measure it and the bubble.
  useLayoutEffect(() => {
    if (step === undefined) return;
    document.querySelector(step.target)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    place();
  }, [step, place]);

  // Measure again once fonts and layout have settled, and whenever the target changes size.
  useEffect(() => {
    if (step === undefined) return undefined;
    const frame = window.requestAnimationFrame(place);
    const timer = window.setTimeout(place, 300);
    const target = document.querySelector(step.target);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    if (target !== null) observer?.observe(target);
    observer?.observe(document.body);
    void document.fonts?.ready.then(place);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      observer?.disconnect();
    };
  }, [step, place]);

  useEffect(() => {
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [place]);

  useEffect(() => nextRef.current?.focus(), [index]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onDone();
      }
      // Keep keyboard focus inside the guide while it is open.
      if (event.key === 'Tab' && bubbleRef.current !== null) {
        const buttons = Array.from(bubbleRef.current.querySelectorAll('button'));
        const first = buttons[0];
        const lastButton = buttons[buttons.length - 1];
        if (first === undefined || lastButton === undefined) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          lastButton.focus();
        } else if (!event.shiftKey && document.activeElement === lastButton) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  if (step === undefined) return null;

  // Bubble below the target if it fits, otherwise above; centred, kept on screen.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = vh / 2 - bubbleSize.height / 2;
  let left = vw / 2 - bubbleSize.width / 2;
  let side: 'above' | 'below' | 'none' = 'none';
  if (ring !== null) {
    const below = ring.top + ring.height + GAP;
    const above = ring.top - GAP - bubbleSize.height;
    if (below + bubbleSize.height <= vh - MARGIN) {
      top = below;
      side = 'below';
    } else if (above >= MARGIN) {
      top = above;
      side = 'above';
    } else {
      top = Math.max(MARGIN, vh - bubbleSize.height - MARGIN);
    }
    left = ring.left + ring.width / 2 - bubbleSize.width / 2;
  }
  left = Math.min(Math.max(MARGIN, left), vw - bubbleSize.width - MARGIN);
  const arrowLeft =
    ring === null ? 0 : Math.min(Math.max(24, ring.left + ring.width / 2 - left), bubbleSize.width - 24);

  return (
    <div className="guide" role="presentation">
      {ring !== null ? (
        <div
          className="guide-ring"
          style={{ top: ring.top, left: ring.left, width: ring.width, height: ring.height }}
          aria-hidden="true"
        />
      ) : (
        <div className="guide-dim" aria-hidden="true" />
      )}
      <div
        ref={bubbleRef}
        className={`guide-bubble guide-${side}`}
        style={{ top, left }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        aria-describedby="guide-text"
      >
        {side !== 'none' && <span className="guide-arrow" style={{ left: arrowLeft }} aria-hidden="true" />}
        <p className="guide-count">
          {index + 1} of {GUIDE_STEPS.length}
        </p>
        <h2 id="guide-title">{step.title}</h2>
        <p id="guide-text" className="guide-text">
          {step.text}
        </p>
        <div className="guide-buttons">
          <button type="button" className="guide-skip" onClick={onDone}>
            Skip the guide
          </button>
          <button
            type="button"
            ref={nextRef}
            className="guide-next"
            onClick={() => (last ? onDone() : setIndex(index + 1))}
          >
            {last ? "Let's play!" : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
