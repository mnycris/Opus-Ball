// Pure UI effect layers (CSS + inline SVG, no imagery): floodlight beams, pitch markings,
// scouting radar, diagonal mesh, prism sheen and trophy confetti.
import { memo } from 'react'

export type FxKind = 'floodlights' | 'beams' | 'tunnel' | 'pitch' | 'radar' | 'mesh' | 'grid' | 'confetti' | 'spotlight'

export const Fx = memo(function Fx({ kind, intensity = 1 }: { kind: FxKind; intensity?: number }) {
  return (
    <div className={`fx fx-${kind}`} style={{ ['--fx-i' as any]: intensity }} aria-hidden>
      {(kind === 'floodlights' || kind === 'beams') && (<><span className="glow g1" /><span className="glow g2" /><span className="glow g3" /></>)}
      {kind === 'spotlight' && <span className="spot" />}
      {kind === 'tunnel' && (
        <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="fx-tun" cx="50%" cy="55%" r="45%"><stop offset="0" stopColor="rgba(255,255,255,.55)" /><stop offset="0.35" stopColor="rgba(var(--club-rgb),.35)" /><stop offset="1" stopColor="rgba(0,0,0,0)" /></radialGradient>
          </defs>
          <rect width="400" height="200" fill="url(#fx-tun)" />
          <g stroke="rgba(255,255,255,.08)" strokeWidth="1" fill="none">
            {Array.from({ length: 9 }, (_, i) => { const s = 1 - i * 0.1; return <rect key={i} x={200 - 210 * s} y={110 - 120 * s} width={420 * s} height={240 * s} rx={30 * s} /> })}
            {[-1, 1].map((d) => <line key={d} x1={200 + d * 12} y1={112} x2={200 + d * 260} y2={260} />)}
            {[-1, 1].map((d) => <line key={`t${d}`} x1={200 + d * 12} y1={104} x2={200 + d * 260} y2={-60} />)}
          </g>
        </svg>
      )}
      {kind === 'pitch' && (
        <svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice">
          <g fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="1.4">
            <rect x="10" y="10" width="380" height="200" rx="3" />
            <line x1="200" y1="10" x2="200" y2="210" />
            <circle cx="200" cy="110" r="36" />
            <rect x="10" y="55" width="62" height="110" /><rect x="328" y="55" width="62" height="110" />
            <rect x="10" y="85" width="22" height="50" /><rect x="368" y="85" width="22" height="50" />
            <path d="M72 88a28 28 0 0 1 0 44M328 88a28 28 0 0 0 0 44" />
          </g>
          <g fill="rgba(255,176,32,.7)">{[[120, 60], [150, 90], [120, 120], [150, 150], [260, 70], [280, 140]].map(([x, y], i) => <path key={i} d={`M${x} ${y}l5 -9 5 9z`} />)}</g>
        </svg>
      )}
      {kind === 'radar' && (
        <div className="radar">
          <svg viewBox="0 0 200 200">
            <g fill="none" stroke="rgba(var(--acc-rgb),.25)" strokeWidth="1">{[30, 55, 80, 98].map((r) => <circle key={r} cx="100" cy="100" r={r} />)}</g>
            <g stroke="rgba(var(--acc-rgb),.18)"><line x1="0" y1="100" x2="200" y2="100" /><line x1="100" y1="0" x2="100" y2="200" /></g>
            {[[70, 60], [130, 80], [85, 140], [150, 130], [60, 110]].map(([x, y], i) => <circle key={i} className="blip" style={{ animationDelay: `${i * 0.6}s` }} cx={x} cy={y} r="3" fill="var(--acc)" />)}
          </svg>
          <span className="sweep" />
        </div>
      )}
      {kind === 'mesh' && <span className="mesh" />}
      {kind === 'grid' && <span className="grid" />}
      {kind === 'confetti' && (
        <>
          <span className="rays" />
          <div className="confetti">{Array.from({ length: 34 }, (_, i) => <i key={i} style={{ left: `${(i * 29) % 100}%`, animationDelay: `${(i * 0.23) % 3.2}s`, animationDuration: `${2.6 + (i % 5) * 0.5}s`, background: ['#F4C542', '#ffffff', 'var(--club)', '#FFE38A', 'var(--club2)'][i % 5], transform: `rotate(${i * 47}deg)` }} />)}</div>
        </>
      )}
    </div>
  )
})
