// Procedural portrait renderer for generated people (regens, youth prospects, scouts, staff, the user manager).
import { memo } from 'react'
import type { AvatarConfig } from '../../domain/types'

export const SKINS = ['#F6D3B8', '#EBC09C', '#D9A77F', '#B97E57', '#8D5A3B', '#5E3A26']
export const SKIN_SHADE = ['#E7B996', '#D8A57E', '#C28E66', '#9F6644', '#744629', '#472A1A']
export const HAIR_COLORS = ['#141111', '#2B1D16', '#4A2F20', '#7A5334', '#C9A469', '#A64B25', '#8D8A86', '#E6E1D8']
export const HAIR_STYLES = ['Crew Cut', 'Buzz', 'Side Part', 'Textured Crop', 'Curly Top', 'Afro', 'Slicked Back', 'Man Bun', 'Bald', 'Quiff']
export const BEARDS = ['None', 'Stubble', 'Short Beard', 'Full Beard', 'Goatee', 'Moustache']
export const BROWS = ['Straight', 'Arched', 'Thick']
export const GLASSES = ['None', 'Round', 'Rectangular']

export function seededAvatar(seed: number, nation?: string): AvatarConfig {
  const r = (k: number) => {
    let x = (seed ^ (k * 0x9e3779b9)) >>> 0
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5
    return ((x >>> 0) % 10000) / 10000
  }
  const darkNations = new Set(['Nigeria', 'Ghana', 'Senegal', 'Cameroon', "Côte d'Ivoire", 'Mali', 'Congo DR', 'Guinea', 'Gambia', 'Jamaica', 'Burkina Faso', 'Angola', 'Zambia', 'Togo', 'Benin', 'Sierra Leone', 'Haiti', 'Congo', 'Gabon', 'Kenya', 'Tanzania', 'Uganda', 'Zimbabwe', 'Mozambique', 'Liberia', 'South Africa', 'Guinea-Bissau', 'Cabo Verde', 'Equatorial Guinea', 'Burundi', 'Rwanda', 'Madagascar', 'Chad', 'Niger', 'Eritrea', 'South Sudan', 'Trinidad and Tobago', 'Barbados', 'Curacao', 'Suriname'])
  const midNations = new Set(['Brazil', 'Morocco', 'Algeria', 'Tunisia', 'Egypt', 'Colombia', 'Mexico', 'Peru', 'Ecuador', 'Venezuela', 'Bolivia', 'Paraguay', 'Türkiye', 'Saudi Arabia', 'Iran', 'Iraq', 'India', 'Qatar', 'United Arab Emirates', 'Portugal', 'Uruguay', 'Chile', 'Argentina', 'Costa Rica', 'Honduras', 'Panama'])
  const eastAsia = new Set(['Japan', 'Korea Republic', 'China PR', 'Thailand', 'Vietnam', 'Indonesia', 'Philippines'])
  let skin: number
  if (nation && darkNations.has(nation)) skin = 4 + Math.round(r(1))
  else if (nation && midNations.has(nation)) skin = 1 + Math.floor(r(1) * 3.5)
  else if (nation && eastAsia.has(nation)) skin = Math.floor(r(1) * 2)
  else skin = r(1) < 0.12 ? 3 + Math.floor(r(9) * 3) : Math.floor(r(1) * 2.6)
  const dark = skin >= 4
  const hair = dark ? [0, 1, 4, 5, 3][Math.floor(r(2) * 5)] : Math.floor(r(2) * HAIR_STYLES.length)
  const hairColor = dark ? (r(3) < 0.9 ? 0 : 1) : eastAsia.has(nation || '') ? 0 : Math.floor(Math.pow(r(3), 1.6) * 6)
  return {
    skin, hair, hairColor, beard: r(4) < 0.55 ? 0 : 1 + Math.floor(r(5) * 5), eyes: Math.floor(r(6) * 3), brows: Math.floor(r(7) * 3),
    glasses: 0, outfit: 'Tracksuit', outfitColor: '#1A2233', tie: false,
  }
}

function hairPath(style: number): { back?: string; front: string } {
  switch (style) {
    case 0: return { front: 'M31 44c0-12 8-20 19-20s19 8 19 20c-2-6-6-9-9-10-5 3-14 3-20 0-4 1-7 4-9 10Z' }
    case 1: return { front: 'M32 42c1-10 8-17 18-17s17 7 18 17c-3-4-8-6-18-6s-15 2-18 6Z' }
    case 2: return { front: 'M30 45c-1-13 8-22 20-22 11 0 19 7 20 19-3-5-7-8-12-9-7-1-12 1-16-3-3 3-8 7-12 15Z' }
    case 3: return { front: 'M30 46c-2-14 7-24 20-24s21 9 20 22c-2-4-4-6-6-7l-3 3-3-4-4 3-4-4-4 4-3-3-3 4c-4 1-7 3-10 6Z' }
    case 4: return { front: 'M29 45c-3-14 6-25 21-25s24 11 21 25c-1-6-4-9-6-10 1-2 0-4-2-5-1 3-4 3-6 1-2 3-5 3-7 0-2 3-5 3-7 0-2 2-4 3-6 2-2 1-4 4-4 7-2 1-3 3-4 5Z' }
    case 5: return { back: 'M24 48c-6-20 6-34 26-34s32 14 26 34c-3-3-5-4-7-4H31c-2 0-4 1-7 4Z', front: 'M27 44c-2-14 8-24 23-24s25 10 23 24c-4-7-11-10-23-10s-19 3-23 10Z' }
    case 6: return { front: 'M30 44c0-13 8-21 20-21s20 8 20 21c-2-7-5-11-10-12-6-1-14-1-20 1-5 2-8 5-10 11Z' }
    case 7: return { back: 'M44 18c0-4 3-6 6-6s6 2 6 6-3 5-6 5-6-1-6-5Z', front: 'M30 45c0-14 8-22 20-22s20 8 20 22c-3-7-8-11-20-11s-17 4-20 11Z' }
    case 8: return { front: 'M33 38c2-7 9-12 17-12s15 5 17 12c-4-3-10-4-17-4s-13 1-17 4Z' }
    case 9: return { front: 'M30 45c-1-12 6-19 17-21 6-1 14 0 18 4 4 3 5 8 5 14-3-5-6-7-10-8 1-3 0-5-2-6-4 3-10 4-15 3-5 2-10 7-13 14Z' }
  }
  return { front: '' }
}

function beardPath(b: number): string {
  switch (b) {
    case 1: return 'M33 58c2 10 9 16 17 16s15-6 17-16c-3 3-6 5-9 5-3-2-5-3-8-3s-5 1-8 3c-3 0-6-2-9-5Z'
    case 2: return 'M32 55c1 13 8 21 18 21s17-8 18-21c-2 4-5 7-9 8-3-2-6-3-9-3s-6 1-9 3c-4-1-7-4-9-8Z'
    case 3: return 'M30 52c0 16 8 27 20 27s20-11 20-27c-2 6-5 9-10 10-3-2-6-3-10-3s-7 1-10 3c-5-1-8-4-10-10Z'
    case 4: return 'M43 66c1 6 3 10 7 10s6-4 7-10c-2 1-4 2-7 2s-5-1-7-2Z'
    case 5: return 'M42 62.5c2-2 5-3 8-3s6 1 8 3c-2 1-5 1.5-8 1.5s-6-.5-8-1.5Z'
  }
  return ''
}

export const Portrait = memo(function Portrait({ cfg, size = 64, bg, kit, radius = 12, jersey, framed = true }: { cfg: AvatarConfig; size?: number; bg?: [string, string]; kit?: string; radius?: number; jersey?: number; framed?: boolean }) {
  const skin = SKINS[cfg.skin] || SKINS[1]
  const shade = SKIN_SHADE[cfg.skin] || SKIN_SHADE[1]
  const hc = HAIR_COLORS[cfg.hairColor] || HAIR_COLORS[0]
  const hp = hairPath(cfg.hair)
  const outfit = kit || cfg.outfitColor || '#1A2233'
  const id = `p${cfg.skin}${cfg.hair}${cfg.beard}${cfg.hairColor}${outfit.replace('#', '')}${size}`
  const suit = cfg.outfit === 'Suit' || cfg.outfit === 'Coat'
  const beardC = cfg.hairColor === 7 ? '#CFCAC0' : hc
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ borderRadius: radius, display: 'block' }}>
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={bg?.[0] || '#2A3346'} />
          <stop offset="1" stopColor={bg?.[1] || '#10141D'} />
        </linearGradient>
        <radialGradient id={`${id}face`} cx="0.45" cy="0.4" r="0.7">
          <stop offset="0" stopColor={skin} />
          <stop offset="1" stopColor={shade} />
        </radialGradient>
      </defs>
      {framed && <rect width="100" height="100" fill={`url(#${id}bg)`} />}
      {hp.back && <path d={hp.back} fill={hc} />}
      {/* shoulders & outfit */}
      <path d="M12 104c2-17 14-26 38-26s36 9 38 26Z" fill={outfit} />
      {suit ? (
        <>
          <path d="M38 79 50 96 62 79c-3-1-7-2-12-2s-9 1-12 2Z" fill="#F4F6FA" />
          {cfg.tie && <path d="M48 81h4l1.5 4-2 13h-3l-2-13Z" fill="#8B1C24" />}
          <path d="M38 79 50 96 44 104H30c3-9 5-17 8-25Z" fill="rgba(0,0,0,.28)" />
          <path d="M62 79 50 96l6 8h14c-3-9-5-17-8-25Z" fill="rgba(0,0,0,.28)" />
        </>
      ) : (
        <>
          <path d="M40 79c2 5 6 8 10 8s8-3 10-8" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="2.5" />
          {jersey ? <text x="50" y="99" textAnchor="middle" fontSize="11" fontWeight="800" fill="rgba(255,255,255,.55)" fontFamily="Barlow Condensed, sans-serif">{jersey}</text> : null}
        </>
      )}
      {/* neck */}
      <path d="M42 68h16v12c-2 3-5 4-8 4s-6-1-8-4Z" fill={shade} />
      {/* ears */}
      <ellipse cx="31" cy="52" rx="4" ry="6" fill={shade} />
      <ellipse cx="69" cy="52" rx="4" ry="6" fill={shade} />
      {/* head */}
      <path d="M31 46c0-13 8-21 19-21s19 8 19 21v7c0 12-8 21-19 21S31 65 31 53Z" fill={`url(#${id}face)`} />
      {/* beard */}
      {cfg.beard > 0 && <path d={beardPath(cfg.beard)} fill={beardC} opacity={cfg.beard === 1 ? 0.45 : 0.95} />}
      {/* brows */}
      {cfg.brows === 0 && <><path d="M38 46h8" stroke={hc} strokeWidth="2.4" strokeLinecap="round" /><path d="M54 46h8" stroke={hc} strokeWidth="2.4" strokeLinecap="round" /></>}
      {cfg.brows === 1 && <><path d="M38 47c2-2 5-2.5 8-1" stroke={hc} strokeWidth="2.2" fill="none" strokeLinecap="round" /><path d="M54 46c3-1.5 6-1 8 1" stroke={hc} strokeWidth="2.2" fill="none" strokeLinecap="round" /></>}
      {cfg.brows === 2 && <><path d="M37.5 46.5c3-1.5 6-1.5 9 0" stroke={hc} strokeWidth="3.4" fill="none" strokeLinecap="round" /><path d="M53.5 46.5c3-1.5 6-1.5 9 0" stroke={hc} strokeWidth="3.4" fill="none" strokeLinecap="round" /></>}
      {/* eyes */}
      <ellipse cx="42" cy="51.5" rx="3" ry={cfg.eyes === 2 ? 1.6 : 2} fill="#fff" />
      <ellipse cx="58" cy="51.5" rx="3" ry={cfg.eyes === 2 ? 1.6 : 2} fill="#fff" />
      <circle cx="42.3" cy="51.7" r="1.5" fill={cfg.eyes === 1 ? '#3D5A7A' : '#2A1C14'} />
      <circle cx="58.3" cy="51.7" r="1.5" fill={cfg.eyes === 1 ? '#3D5A7A' : '#2A1C14'} />
      {/* nose & mouth */}
      <path d="M50 53v7c-1 1-3 1.5-4 1" stroke={shade} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M45 65.5c3 1.5 7 1.5 10 0" stroke="#9A5B4A" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* hair front */}
      {hp.front && <path d={hp.front} fill={hc} />}
      {/* glasses */}
      {cfg.glasses === 1 && <g stroke="#1B1B1F" strokeWidth="1.5" fill="rgba(255,255,255,.12)"><circle cx="42" cy="51.5" r="5" /><circle cx="58" cy="51.5" r="5" /><path d="M47 51.5h6" /></g>}
      {cfg.glasses === 2 && <g stroke="#1B1B1F" strokeWidth="1.6" fill="rgba(255,255,255,.12)"><rect x="36" y="48" width="11" height="7.5" rx="2" /><rect x="53" y="48" width="11" height="7.5" rx="2" /><path d="M47 51h6" /></g>}
    </svg>
  )
})
