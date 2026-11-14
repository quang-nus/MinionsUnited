// Simple icons drawn for this game. All are decorative (aria-hidden);
// every icon sits next to words that say the same thing.

interface IconProps {
  size?: number;
}

function Svg({ size = 28, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export function PowerIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13.5 1.5 4 13.5h6.5L9 22.5l10-13h-6.5z" fill="currentColor" />
    </Svg>
  );
}

export function LifeSupportIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2.5S5.5 9.7 5.5 14a6.5 6.5 0 0 0 13 0C18.5 9.7 12 2.5 12 2.5z" fill="currentColor" />
      <path d="M9 14.5a3 3 0 0 0 3 3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </Svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2 4 5.2v5.9c0 5 3.4 9.3 8 10.9 4.6-1.6 8-5.9 8-10.9V5.2z" fill="currentColor" />
      <path d="m8.5 12 2.5 2.5 4.5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function ResearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M9 2h6v2h-1v5.2l5.3 9.3A2.3 2.3 0 0 1 17.3 22H6.7a2.3 2.3 0 0 1-2-3.5L10 9.2V4H9z"
        fill="currentColor"
      />
      <circle cx="10" cy="17" r="1.4" fill="#fff" />
      <circle cx="14" cy="15" r="1" fill="#fff" />
    </Svg>
  );
}

export function CommsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="6" cy="18" r="2.4" fill="currentColor" />
      <path d="M4 10.5a9.5 9.5 0 0 1 9.5 9.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <path d="M4 3.5A16.5 16.5 0 0 1 20.5 20" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" fill="none" />
    </Svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
        <rect
          key={angle}
          x="11"
          y="1.5"
          width="2"
          height="4"
          rx="1"
          fill="currentColor"
          transform={`rotate(${angle} 12 12)`}
        />
      ))}
    </Svg>
  );
}

export function FlareIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="14" r="6.5" fill="currentColor" />
      <path
        d="M14.5 9.5c1.2-2.6 3.6-4.6 6.5-5.2-.6 1.5-.6 3 .2 4.4-1.6-.2-3 .3-4 1.4 1.3.4 2.3 1.3 2.8 2.6-1.8-.6-3.6-.6-5.4.2z"
        fill="#D2552F"
      />
      <circle cx="10" cy="14" r="2.2" fill="#fff" opacity="0.55" />
    </Svg>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2.5 1.5 21h21z" fill="currentColor" />
      <rect x="11" y="9" width="2" height="6.5" rx="1" fill="#fff" />
      <circle cx="12" cy="18" r="1.2" fill="#fff" />
    </Svg>
  );
}

export function RocketIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2c3 2.5 4.5 6 4.5 10l-2 4h-5l-2-4C7.5 8 9 4.5 12 2z" fill="currentColor" />
      <circle cx="12" cy="9.5" r="1.8" fill="#fff" />
      <path d="M9.5 17h5l-1 4.5h-3z" fill="#E8A400" />
      <path d="M7.5 12 5 15.5h3zM16.5 12l2.5 3.5h-3z" fill="currentColor" />
    </Svg>
  );
}

export function SunsetIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 17a7 7 0 0 1 14 0z" fill="currentColor" />
      <rect x="2" y="18.5" width="20" height="2" rx="1" fill="currentColor" />
      <rect x="11" y="3" width="2" height="4" rx="1" fill="currentColor" />
      <rect x="3.5" y="8.5" width="2" height="4" rx="1" fill="currentColor" transform="rotate(-50 4.5 10.5)" />
      <rect x="18.5" y="8.5" width="2" height="4" rx="1" fill="currentColor" transform="rotate(50 19.5 10.5)" />
    </Svg>
  );
}

export function SoundOnIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 9h4l5-4.5v15L8 15H4z" fill="currentColor" />
      <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </Svg>
  );
}

export function SoundOffIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 9h4l5-4.5v15L8 15H4z" fill="currentColor" />
      <path d="m16 9 5 6m0-6-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </Svg>
  );
}
