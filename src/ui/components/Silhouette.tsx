import { memo } from 'react'

/** EA-style placeholder for players without an official headshot: kit-coloured silhouette with shirt number. */
export const Silhouette = memo(function Silhouette({ size = 48, kit = '#2a3346', trim = '#ffffff', number, seed = 0 }: { size?: number; kit?: string; trim?: string; number?: number; seed?: number }) {
  const id = `sil${(seed % 997).toString(36)}${kit.replace('#', '')}`
  const hair = seed % 4 // slight silhouette variety: short, crop, curls, long
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`${id}h`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c3cad6" /><stop offset="1" stopColor="#7a8496" /></linearGradient>
        <linearGradient id={`${id}k`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={kit} /><stop offset="1" stopColor={kit} stopOpacity="0.7" /></linearGradient>
        <radialGradient id={`${id}g`} cx="50%" cy="30%" r="70%"><stop offset="0" stopColor="rgba(255,255,255,.18)" /><stop offset="1" stopColor="rgba(255,255,255,0)" /></radialGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${id}g)`} />
      <path d="M8 104c3-19 17-28 42-28s39 9 42 28Z" fill={`url(#${id}k)`} stroke="rgba(255,255,255,.35)" strokeWidth="1.2" />
      <path d="M38 77 50 90 62 77" fill="none" stroke={trim} strokeOpacity=".6" strokeWidth="2.6" />
      <path d="M41 64h18v12c-2.5 3-5.5 4.5-9 4.5S43.5 79 41 76Z" fill="#8b94a5" />
      <path d="M32 44c0-12 8-20 18-20s18 8 18 20v6c0 12-8 21-18 21S32 62 32 50Z" fill={`url(#${id}h)`} />
      {hair === 0 && <path d="M32 44c0-13 8-21 18-21s18 8 18 21c-3-6-9-9-18-9s-15 3-18 9Z" fill="#565e6d" />}
      {hair === 1 && <path d="M31 46c-1-14 8-24 19-24s20 9 19 22c-4-5-9-8-19-8s-15 4-19 10Z" fill="#505866" />}
      {hair === 2 && <path d="M29 47c-3-15 6-27 21-27s24 12 21 26c-2-4-5-7-7-8 0-3-3-5-6-4-2-3-6-3-8-1-3-2-7-1-8 2-3 0-6 3-7 6-3 2-5 4-6 6Z" fill="#4b5361" />}
      {hair === 3 && <path d="M29 52c-3-19 7-30 21-30s24 11 21 30c-1-8-4-14-8-16-4 2-9 3-13 3s-9-1-13-3c-4 2-7 8-8 16Z" fill="#4b5361" />}
      {number ? <text x="50" y="99" textAnchor="middle" fontFamily="Barlow Condensed, sans-serif" fontWeight="800" fontSize="15" fill={trim} fillOpacity=".75">{number}</text> : null}
    </svg>
  )
})
