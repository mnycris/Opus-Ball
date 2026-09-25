import type { Club, Player, World } from '../domain/types'
import compLogos from '../data/compLogos.json'
import crestsCC from '../data/crestsCC.json'
import eaAssets from '../data/eaAssets.json'

const BASE = import.meta.env.BASE_URL || '/'
const CC = 'https://assets.football-logos.cc/logos'
const EA = 'https://ratings-images-prod.pulse.ea.com'
const CREST_CC = (crestsCC as { clubs: Record<string, string>; comps: Record<string, string> })
const EA_TEAMS = (eaAssets as { teams: Record<string, string>; playstyles: Record<string, string> }).teams
const EA_PS = (eaAssets as { teams: Record<string, string>; playstyles: Record<string, string> }).playstyles

const ccUrl = (v: string) => { const [country, file] = v.split('/'); return `${CC}/${country}/512x512/${file}.png` }

/**
 * Official EA SPORTS FC headshots, newest first: EA's ratings portrait CDN, then the SoFIFA mirror.
 * All remote images are requested with `referrerPolicy="no-referrer"` (see ImgChain) so hotlink rules keyed on
 * the Referer header don't reject them.
 */
export function faceUrls(p: Pick<Player, 'id' | 'regen'>): string[] {
  if (p.regen || p.id >= 9_000_000) return []
  const s = String(p.id).padStart(6, '0')
  const a = s.slice(0, s.length - 3), b = s.slice(-3)
  return [
    `${EA}/FC25/full/player-portraits/p${p.id}.png?width=256`,
    `https://cdn.sofifa.net/players/${a}/${b}/27_120.png`,
    `https://cdn.sofifa.net/players/${a}/${b}/26_120.png`,
    `${EA}/FC26/full/player-portraits/p${p.id}.png?width=256`,
  ]
}

export function badgeUrls(c: Pick<Club, 'id' | 'badge' | 'sofifaTeamId'>): string[] {
  const out: string[] = []
  if (c.badge) out.push(`${BASE}assets/badges/${c.id}.webp`)
  const cc = CREST_CC.clubs[String(c.id)]
  if (cc) out.push(ccUrl(cc))
  if (c.sofifaTeamId && EA_TEAMS[String(c.sofifaTeamId)]) out.push(EA_TEAMS[String(c.sofifaTeamId)])
  if (c.sofifaTeamId) out.push(`https://cdn.sofifa.net/teams/${c.sofifaTeamId}/120.png`)
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
/** Competition logo sources in official colours (football-logos.cc first, bundled art second). */
export function compLogoUrls(key: string): string[] {
  const out: string[] = []
  if (CREST_CC.comps[key]) out.push(ccUrl(CREST_CC.comps[key]))
  if (LOGOS[key]) out.push(`${BASE}assets/comps/${key}.webp`)
  return out
}
export function compLogoUrl(key: string): string | undefined {
  return compLogoUrls(key)[0]
}
export function compLogoMeta(key: string) {
  return LOGOS[key]
}

/** Real EA PlayStyle icon (drop-assets.ea.com) for a PlayStyle name, e.g. "Power Shot" or "Power Shot+". */
export function playStyleIcon(name: string, plus: boolean): string | undefined {
  const t = name.replace(/\+$/, '').trim().toLowerCase()
  const key = Object.keys(EA_PS).find((k) => k.replace(/\+$/, '').toLowerCase() === t && k.endsWith('+') === plus)
  return key ? EA_PS[key] : undefined
}

/** Remember which remote images failed so we don't retry them every render. */
const failed = new Set<string>()
export function markFailed(url: string) { failed.add(url) }
export function isFailed(url: string) { return failed.has(url) }

// ---------------------------------------------------------------- Wikipedia photos (managers, fallback players)
const WIKI_KEY = 'opus:wiki:v1'
let wikiCache: Record<string, string | null> = {}
try { wikiCache = JSON.parse(localStorage.getItem(WIKI_KEY) || '{}') } catch { wikiCache = {} }
const inflight = new Map<string, Promise<string | null>>()
let saveTimer: number | undefined
function persist() {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => { try { localStorage.setItem(WIKI_KEY, JSON.stringify(wikiCache)) } catch { /* quota */ } }, 800)
}

export interface WikiQuery { key: string; titles: string[]; verify: (description: string, extract: string) => boolean }

/** Resolve a verified Wikipedia lead image (thumbnail) for a person. Cached per device; null when none verifies. */
export function wikiPhoto(q: WikiQuery): Promise<string | null> {
  if (q.key in wikiCache) return Promise.resolve(wikiCache[q.key])
  const existing = inflight.get(q.key)
  if (existing) return existing
  const run = (async () => {
    for (const title of q.titles) {
      try {
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`, { headers: { accept: 'application/json' } })
        if (!res.ok) continue
        const j = await res.json()
        if (j.type === 'disambiguation') continue
        const img: string | undefined = j.thumbnail?.source
        if (img && q.verify(String(j.description || ''), String(j.extract || ''))) {
          wikiCache[q.key] = img.replace(/\/(\d+)px-/, '/320px-')
          persist()
          return wikiCache[q.key]
        }
      } catch { /* offline or blocked */ return null }
    }
    wikiCache[q.key] = null
    persist()
    return null
  })()
  inflight.set(q.key, run)
  return run
}

export function managerWikiQuery(name: string): WikiQuery {
  return {
    key: `m:${name}`,
    titles: [name, `${name} (football manager)`, `${name} (footballer)`],
    verify: (d, e) => /football|soccer|coach|manager/i.test(d) || /football (manager|coach)|head coach/i.test(e.slice(0, 300)),
  }
}

export function playerWikiQuery(p: Pick<Player, 'id' | 'name' | 'fullName' | 'dob'>): WikiQuery {
  const year = p.dob.slice(0, 4)
  return {
    key: `p:${p.id}`,
    titles: [p.fullName, p.name].filter((t, i, a) => t && a.indexOf(t) === i && !/^[A-Z]\. /.test(t)),
    verify: (d, e) => {
      if (!/footballer|soccer player/i.test(d)) return false
      const years = (d + ' ' + e.slice(0, 200)).match(/\b(19[6-9]\d|20[01]\d)\b/g)
      return !years || years.includes(year)
    },
  }
}
