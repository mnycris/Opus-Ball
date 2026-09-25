import type { Player, World } from '../../domain/types'

// Derived club -> players index (not persisted). Invalidate with touchRoster() whenever
// a player's club or academy status changes.
const cache = new WeakMap<World, { v: number; map: Map<number, Player[]>; academy: Map<number, Player[]> }>()

export function touchRoster(w: World) {
  w.flags.rosterVersion = (w.flags.rosterVersion || 0) + 1
}

function index(w: World) {
  const v = w.flags.rosterVersion || 0
  let c = cache.get(w)
  if (!c || c.v !== v) {
    const map = new Map<number, Player[]>()
    const academy = new Map<number, Player[]>()
    for (const p of Object.values(w.players)) {
      const m = p.academy ? academy : map
      let arr = m.get(p.clubId)
      if (!arr) m.set(p.clubId, (arr = []))
      arr.push(p)
    }
    c = { v, map, academy }
    cache.set(w, c)
  }
  return c
}

export function rosterOf(w: World, clubId: number): Player[] {
  return index(w).map.get(clubId) || []
}
export function academyOf(w: World, clubId: number): Player[] {
  return index(w).academy.get(clubId) || []
}
export function setPlayerClub(w: World, p: Player, clubId: number) {
  p.clubId = clubId
  touchRoster(w)
}
