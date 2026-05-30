import { useId } from 'react'

interface Props {
  size?: number
  dimmed?: boolean
  style?: React.CSSProperties
}

export default function Logo({ size = 80, dimmed = false, style }: Props) {
  const uid = useId().replace(/:/g, 'x')

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      width={size}
      height={size}
      style={{
        flexShrink: 0,
        filter: dimmed ? 'grayscale(50%) brightness(0.65)' : 'none',
        transition: 'filter 0.3s ease',
        ...style,
      }}
    >
      <defs>
        <linearGradient id={`${uid}-s`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4338ca" />
          <stop offset="100%" stopColor="#1e1b4b" />
        </linearGradient>
        <linearGradient id={`${uid}-c`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <filter id={`${uid}-sh`} x="-15%" y="-15%" width="130%" height="140%">
          <feDropShadow dx="0" dy="5" stdDeviation="7" floodColor="#1e1b4b" floodOpacity="0.55" />
        </filter>
      </defs>

      {/* Shield body */}
      <path
        d="M100 12 L175 44 L175 104 C175 150 100 188 100 188 C100 188 25 150 25 104 L25 44 Z"
        fill={`url(#${uid}-s)`}
        filter={`url(#${uid}-sh)`}
      />
      {/* Shield inner rim */}
      <path
        d="M100 22 L165 50 L165 104 C165 144 100 178 100 178 C100 178 35 144 35 104 L35 50 Z"
        fill="none"
        stroke="#6366f1"
        strokeWidth="1.5"
        opacity={0.4}
      />

      {/* Cylinder top cap */}
      <ellipse cx="100" cy="76" rx="38" ry="13" fill="#a5b4fc" opacity={0.95} />
      {/* Cylinder body */}
      <rect x="62" y="76" width="76" height="52" fill={`url(#${uid}-c)`} />
      {/* Cylinder row lines */}
      <ellipse cx="100" cy="93" rx="38" ry="13" fill="none" stroke="#c7d2fe" strokeWidth="1.5" opacity={0.4} />
      <ellipse cx="100" cy="110" rx="38" ry="13" fill="none" stroke="#c7d2fe" strokeWidth="1.5" opacity={0.4} />
      {/* Cylinder bottom cap */}
      <ellipse cx="100" cy="128" rx="38" ry="13" fill="#4338ca" />
      {/* Shine */}
      <ellipse cx="91" cy="73" rx="17" ry="4.5" fill="white" opacity={0.13} />

      {/* Lock body */}
      <rect x="87" y="140" width="26" height="20" rx="4" fill="#e0e7ff" opacity={0.95} />
      {/* Lock shackle */}
      <path
        d="M93 140 L93 133 A7 7 0 0 1 107 133 L107 140"
        fill="none"
        stroke="#e0e7ff"
        strokeWidth="4"
        strokeLinecap="round"
        opacity={0.95}
      />
      {/* Keyhole */}
      <circle cx="100" cy="149" r="3.5" fill="#4338ca" />
      <rect x="98.5" y="150" width="3" height="5" rx="1" fill="#4338ca" />
    </svg>
  )
}
