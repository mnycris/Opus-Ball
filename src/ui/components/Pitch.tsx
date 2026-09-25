import type { ReactNode } from 'react'
import type { Formation } from '../../domain/constants'

export function PitchLines() {
  return (
    <svg className="lines" viewBox="0 0 100 128" preserveAspectRatio="none">
      <g fill="none" stroke="rgba(255,255,255,.22)" strokeWidth=".45">
        <rect x="3" y="3" width="94" height="122" rx="1" />
        <line x1="3" y1="64" x2="97" y2="64" />
        <circle cx="50" cy="64" r="11" />
        <circle cx="50" cy="64" r=".7" fill="rgba(255,255,255,.3)" />
        <rect x="24" y="3" width="52" height="19" />
        <rect x="37" y="3" width="26" height="7" />
        <rect x="24" y="106" width="52" height="19" />
        <rect x="37" y="118" width="26" height="7" />
        <path d="M40 22a11 11 0 0 0 20 0" />
        <path d="M40 106a11 11 0 0 1 20 0" />
      </g>
    </svg>
  )
}

/** Vertical pitch (own goal at the bottom). Slot y is 0 (own goal) → 100 (opponent goal). */
export function Pitch({ formation, render, children, style, compact }: { formation: Formation; render: (slotIndex: number) => ReactNode; children?: ReactNode; style?: React.CSSProperties; compact?: boolean }) {
  return (
    <div className="pitch" style={{ aspectRatio: compact ? '0.82' : undefined, ...style }}>
      <PitchLines />
      {formation.slots.map((s, i) => (
        <div key={i} className="pitch-slot" style={{ left: `${s.x}%`, top: `${100 - (compact ? 4 + s.y * 0.9 : s.y) - (compact ? 0 : 2)}%` }}>
          {render(i)}
        </div>
      ))}
      {children}
    </div>
  )
}
