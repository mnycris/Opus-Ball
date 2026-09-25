import type { Competition, ISODate, LeagueDef, World } from '../../domain/types'
import { Rng } from '../../domain/rng'
import { addDays, weekday } from '../../domain/dates'
import { inBreak, kickoffFor, type SeasonDates } from './calendar'
import { emptyRow } from './tables'
import { newFixture } from './fixtures'

/** Circle-method round robin. Returns rounds of [home, away] pairs. */
export function roundRobin(teams: number[], rng: Rng): [number, number][][] {
  const t = [...teams]
  rng.shuffle(t)
  if (t.length % 2) t.push(0)
  const n = t.length
  const rounds: [number, number][][] = []
  const fixed = t[0]
  let rot = t.slice(1)
  for (let r = 0; r < n - 1; r++) {
    const round: [number, number][] = []
    const line = [fixed, ...rot]
    for (let i = 0; i < n / 2; i++) {
      const a = line[i], b = line[n - 1 - i]
      if (a === 0 || b === 0) continue
      // alternate home advantage for balance
      round.push((r + i) % 2 === 0 ? [a, b] : [b, a])
    }
    rounds.push(round)
    rot = [rot[rot.length - 1], ...rot.slice(0, rot.length - 1)]
  }
  return rounds
}

export function multiRoundRobin(teams: number[], legs: number, rng: Rng): [number, number][][] {
  const first = roundRobin(teams, rng)
  const out: [number, number][][] = [...first]
  for (let l = 1; l < legs; l++) {
    if (l % 2 === 1) out.push(...first.map((r) => r.map(([a, b]) => [b, a] as [number, number])))
    else out.push(...roundRobin(teams, rng))
  }
  return out
}

/** League weekend + midweek slots for `rounds` matchdays, avoiding international breaks and reserved dates. */
export function leagueSlots(dates: SeasonDates, rounds: number, reserved: Set<ISODate>, startOffset = 0): ISODate[] {
  const start = addDays(dates.leagueStart, startOffset)
  const weekends: ISODate[] = []
  for (let d = start; d <= dates.leagueEnd; d = addDays(d, 1)) {
    if (weekday(d) !== 6) continue
    if (inBreak(d, dates.intlBreaks) || reserved.has(d)) continue
    // winter pause 21 Dec – 1 Jan handled by keeping Boxing Day style fixtures only for 26/28 Dec
    weekends.push(d)
  }
  let slots = weekends
  if (rounds > weekends.length) {
    const need = rounds - weekends.length
    const tuesdays: ISODate[] = []
    for (let d = addDays(start, 10); d <= addDays(dates.leagueEnd, -10); d = addDays(d, 1)) {
      if (weekday(d) === 2 && !inBreak(d, dates.intlBreaks) && !reserved.has(d)) tuesdays.push(d)
    }
    const picked: ISODate[] = []
    for (let i = 0; i < need; i++) picked.push(tuesdays[Math.floor((i + 0.5) * tuesdays.length / need)])
    slots = [...weekends, ...picked].sort()
  } else if (rounds < weekends.length) {
    const picked: ISODate[] = []
    for (let i = 0; i < rounds; i++) picked.push(weekends[Math.floor(i * weekends.length / rounds)])
    slots = picked
  }
  return slots
}

export function createLeagueCompetition(w: World, lg: LeagueDef, season: number, dates: SeasonDates, rng: Rng,
  real?: [string, string, number, number, number][], reserved = new Set<ISODate>()): Competition {
  const comp: Competition = {
    id: `L${lg.id}-${season}`, key: `L${lg.id}`, name: lg.name, short: lg.short, format: 'league', season,
    country: lg.country, leagueId: lg.id, tier: lg.level, clubs: [...lg.clubs], fixtures: [], rounds: [], status: 'upcoming',
    table: lg.clubs.map((c) => emptyRow(c)),
    rules: { promo: lg.promo, playoff: lg.playoff, rele: lg.rele, releplayoff: lg.releplayoff, promoplayoff: lg.promoplayoff, uefa: lg.uefa },
    logoKey: `L${lg.id}`,
  }
  if (lg.conferences) {
    const east = new Set(EASTERN)
    for (const row of comp.table!) row.group = east.has(w.clubs[row.clubId]?.dbName) ? 'Eastern Conference' : 'Western Conference'
    comp.groups = {
      'Eastern Conference': comp.table!.filter((r) => r.group === 'Eastern Conference').map((r) => r.clubId),
      'Western Conference': comp.table!.filter((r) => r.group === 'Western Conference').map((r) => r.clubId),
    }
  }
  w.competitions[comp.id] = comp
  if (real && real.length) {
    for (const [date, time, h, a, rnd] of real) {
      newFixture(w, comp, h, a, date, time || '15:00', `Matchday ${rnd}`, { importance: 1 })
    }
    return comp
  }
  let rounds: [number, number][][]
  if (lg.conferences && comp.groups) {
    const groups = Object.values(comp.groups)
    const rr = groups.map((g) => multiRoundRobin(g, 2, rng))
    const len = Math.max(...rr.map((r) => r.length))
    rounds = []
    for (let i = 0; i < len; i++) rounds.push(rr.flatMap((r) => r[i] || []))
  } else {
    rounds = multiRoundRobin(lg.clubs, lg.rounds || 2, rng)
  }
  const slots = leagueSlots(dates, rounds.length, reserved, lg.level >= 2 ? -7 : 0)
  rounds.forEach((round, i) => {
    const base = slots[i] || addDays(dates.leagueEnd, i - rounds.length)
    round.forEach(([h, a], j) => {
      let d = base
      if (weekday(base) === 6) {
        const r = rng.next()
        if (r < 0.1) d = addDays(base, -1) // Friday
        else if (r > 0.72) d = addDays(base, 1) // Sunday
      }
      newFixture(w, comp, h, a, d, kickoffFor(d), `Matchday ${i + 1}`, { importance: 1 })
    })
  })
  return comp
}

const EASTERN = ['Atlanta United', 'Charlotte FC', 'Chicago Fire', 'FC Cincinnati', 'Columbus Crew', 'DC United', 'Inter Miami',
  'CF Montréal', 'Nashville SC', 'New England Revolution', 'New York City FC', 'New York Red Bulls', 'Orlando City SC',
  'Philadelphia Union', 'Toronto FC']
