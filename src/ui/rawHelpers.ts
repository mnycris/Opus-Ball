// Read-only views over the raw database used before a world exists (new-career flow).
import type { RawClub, RawDb, RawLeague } from '../data/rawTypes'
import { clubBudget } from '../domain/finance'
import { clamp } from '../domain/rng'
import { POS_GROUP } from '../domain/constants'
import type { Position } from '../domain/types'

export interface RawPlayerLite { id: number; name: string; ovr: number; pot: number; pos: Position; positions: Position[]; nation: string; age: number; value: number }

const cache = new WeakMap<RawDb, Map<number, RawPlayerLite[]>>()

export function rawSquads(raw: RawDb): Map<number, RawPlayerLite[]> {
  let m = cache.get(raw)
  if (m) return m
  m = new Map()
  const f = raw.playerFields
  const I = (k: string) => f.indexOf(k)
  const iId = I('id'), iName = I('name'), iOvr = I('ovr'), iPot = I('pot'), iPos = I('positions'), iNat = I('nation'), iClub = I('clubId'), iDob = I('dob'), iVal = I('value')
  const startYear = Number(raw.startDate.slice(0, 4))
  for (const r of raw.players) {
    const positions = String(r[iPos]).split('|').filter(Boolean) as Position[]
    const dob = String(r[iDob])
    const p: RawPlayerLite = { id: r[iId], name: r[iName], ovr: r[iOvr], pot: r[iPot], pos: positions[0], positions, nation: r[iNat], age: startYear - Number(dob.slice(0, 4)) - (dob.slice(5) > raw.startDate.slice(5) ? 1 : 0), value: r[iVal] }
    const c = r[iClub] as number
    let arr = m.get(c)
    if (!arr) m.set(c, (arr = []))
    arr.push(p)
  }
  for (const arr of m.values()) arr.sort((a, b) => b.ovr - a.ovr)
  cache.set(raw, m)
  return m
}

/** EA-style ATT / MID / DEF / OVR ratings from the best available XI. */
export function clubRatings(raw: RawDb, clubId: number) {
  const sq = rawSquads(raw).get(clubId) || []
  const take = (g: string, n: number) => {
    const list = sq.filter((p) => POS_GROUP[p.pos] === g).slice(0, n)
    return list.length ? Math.round(list.reduce((a, p) => a + p.ovr, 0) / list.length) : 0
  }
  const gk = take('GK', 1), def = take('DEF', 4), mid = take('MID', 3), att = take('ATT', 3)
  const ovr = Math.round((gk + def * 4 + mid * 3 + att * 3) / 11)
  return { att, mid, def, gk, ovr }
}

export function starRating(avg: number): number {
  if (avg >= 81.5) return 5
  if (avg >= 79) return 4.5
  if (avg >= 76.5) return 4
  if (avg >= 74) return 3.5
  if (avg >= 71.5) return 3
  if (avg >= 69) return 2.5
  if (avg >= 66.5) return 2
  if (avg >= 64) return 1.5
  if (avg >= 61) return 1
  return 0.5
}

export function rawBudget(raw: RawDb, c: RawClub): number {
  const lg = raw.leagues.find((l) => l.id === c.leagueId)
  const intl = clamp(Math.round((c.squadAvg - 59.5) / 2.25), 1, 10)
  return clubBudget(c.squadValue, lg as any, intl)
}

export function leagueClubs(raw: RawDb, lg: RawLeague): RawClub[] {
  const byId = new Map(raw.clubs.map((c) => [c.id, c]))
  return lg.clubs.map((id) => byId.get(id)).filter(Boolean).sort((a, b) => b!.squadAvg - a!.squadAvg) as RawClub[]
}

/** Board expectation shown on the club inspect card (derived from squad strength rank in the league). */
export function rawExpectation(raw: RawDb, c: RawClub): string {
  const lg = raw.leagues.find((l) => l.id === c.leagueId)
  if (!lg) return 'Compete'
  const ranked = leagueClubs(raw, lg)
  const rank = ranked.findIndex((x) => x.id === c.id) + 1
  const n = ranked.length
  if (rank === 1) return lg.level === 1 ? 'Win the league' : 'Win promotion as champions'
  if (rank <= 3) return lg.level === 1 ? 'Title challenge' : 'Automatic promotion'
  if (lg.level > 1 && rank <= (lg.promo || 2) + (lg.playoff ? lg.playoff[1] - lg.playoff[0] + 1 : 4)) return 'Promotion play-offs'
  if (rank <= Math.max(4, Math.round(n * 0.3))) return 'Qualify for Europe'
  if (rank <= Math.round(n * 0.55)) return 'Top half finish'
  if (rank <= Math.round(n * 0.8)) return 'Mid-table finish'
  return 'Avoid relegation'
}
