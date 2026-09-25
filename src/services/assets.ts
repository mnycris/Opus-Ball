import type { Club, Player, World } from '../domain/types'
import compLogos from '../data/compLogos.json'

const BASE = import.meta.env.BASE_URL || '/'

/** Real EA FC player headshots (SoFIFA CDN), newest edition first. */
export function faceUrls(p: Pick<Player, 'id' | 'regen'>): string[] {
  if (p.regen || p.id >= 9_000_000) return []
  const s = String(p.id).padStart(6, '0')
  const a = s.slice(0, s.length - 3), b = s.slice(-3)
  return ['27', '26', '25'].map((v) => `https://cdn.sofifa.net/players/${a}/${b}/${v}_120.png`)
}

export function badgeUrls(c: Pick<Club, 'id' | 'badge' | 'sofifaTeamId'>): string[] {
  const out: string[] = []
  if (c.badge) out.push(`${BASE}assets/badges/${c.id}.webp`)
  if (c.sofifaTeamId) out.push(`https://cdn.sofifa.net/teams/${c.sofifaTeamId}/120.png`, `https://cdn.sofifa.net/teams/${c.sofifaTeamId}/60.png`)
  return out
}

export function flagUrl(w: World | undefined, nation: string, fallbackCode?: string): string | undefined {
  const code = w?.nations[nation]?.flag || fallbackCode
  return code ? `${BASE}assets/flags/${code}.svg` : undefined
}

export function flagCodeUrl(code: string) {
  return `${BASE}assets/flags/${code}.svg`
}

const LOGOS = compLogos as Record<string, { w: number; h: number }>
export const MONO_LOGOS = new Set(['UCL', 'UEL', 'L16', 'L17', 'L10', 'L308', 'L50', 'L351', 'L83', 'L13', 'L41', 'L31'])
export function compLogoUrl(key: string): string | undefined {
  return LOGOS[key] ? `${BASE}assets/comps/${key}.webp` : undefined
}
export function compLogoMeta(key: string) {
  return LOGOS[key]
}

/** Remember which remote images failed so we don't retry them every render. */
const failed = new Set<string>()
export function markFailed(url: string) { failed.add(url) }
export function isFailed(url: string) { return failed.has(url) }
