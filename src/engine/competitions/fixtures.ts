import type { Competition, Fixture, ISODate, World } from '../../domain/types'

export function newFixture(w: World, comp: Competition, home: number, away: number, date: ISODate, time: string, roundName: string, extra: Partial<Fixture> = {}): Fixture {
  const n = comp.fixtures.length + 1
  const id = `${comp.id}:${n}`
  const f: Fixture = {
    id, compId: comp.id, roundName, date, time, home, away, played: false,
    userInvolved: home === w.userClubId || away === w.userClubId, ...extra,
  }
  const derby = w.clubs[home]?.rivals.find((r) => r[0] === away)
  if (derby) f.derby = derby[1]
  w.fixtures[id] = f
  comp.fixtures.push(id)
  return f
}

export function clubFixtures(w: World, clubId: number): Fixture[] {
  const out: Fixture[] = []
  for (const f of Object.values(w.fixtures)) if (f.home === clubId || f.away === clubId) out.push(f)
  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
}

/** Maintains a per-club sorted fixture index for fast lookups. */
export function buildClubIndex(w: World): Map<number, Fixture[]> {
  const m = new Map<number, Fixture[]>()
  for (const f of Object.values(w.fixtures)) {
    for (const c of [f.home, f.away]) {
      let arr = m.get(c)
      if (!arr) m.set(c, (arr = []))
      arr.push(f)
    }
  }
  for (const arr of m.values()) arr.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  return m
}
