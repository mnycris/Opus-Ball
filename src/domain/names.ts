import type { Rng } from './rng'

// Fallback name pools for nationalities with too few players in the database.
const FALLBACK: Record<string, [string[], string[]]> = {
  default: [
    ['Alex', 'Daniel', 'Marco', 'Lucas', 'Adam', 'Leo', 'Samuel', 'David', 'Noah', 'Victor', 'Adrian', 'Julian', 'Oscar', 'Elias', 'Mateo'],
    ['Silva', 'Novak', 'Keller', 'Moreau', 'Rossi', 'Jensen', 'Kovač', 'Horvat', 'Petrov', 'Costa', 'Weber', 'Nielsen', 'Popescu', 'Varga'],
  ],
}

export function pickName(pools: Record<string, [string[], string[]]>, nation: string, rng: Rng): { first: string; last: string } {
  const pool = pools[nation] || FALLBACK.default
  const [firsts, lasts] = pool
  // weight towards common names, but keep variety
  const first = firsts[Math.floor(Math.pow(rng.next(), 1.6) * firsts.length)] || rng.pick(FALLBACK.default[0])
  let last = lasts[Math.floor(Math.pow(rng.next(), 1.3) * lasts.length)] || rng.pick(FALLBACK.default[1])
  if (last === first) last = rng.pick(lasts)
  return { first, last }
}

export function displayName(first: string, last: string, nation: string): string {
  // Brazilian/Portuguese players are commonly known by a single name
  if ((nation === 'Brazil') && first.length <= 7) return first
  return `${first[0]}. ${last}`
}

const STAFF_FIRST = ['Tom', 'Luis', 'Jonas', 'Pierre', 'Marco', 'Erik', 'Paolo', 'Javier', 'Stefan', 'Hugo', 'Ricardo', 'Simon', 'Andrea', 'Mikkel', 'Sergio', 'Henrik', 'Diego', 'Nuno', 'Lars', 'Fabio']
const STAFF_LAST = ['Walsh', 'Moreno', 'Richter', 'Lefèvre', 'Conti', 'Lindqvist', 'Ferreira', 'Navarro', 'Brandt', 'Dubois', 'Pereira', 'Hughes', 'Galli', 'Holm', 'Ortega', 'Berg', 'Sousa', 'Kerr', 'Vidal', 'Bauer']
export function staffName(rng: Rng, pools: Record<string, [string[], string[]]>, nation?: string): string {
  if (nation && pools[nation]) {
    const n = pickName(pools, nation, rng)
    return `${n.first} ${n.last}`
  }
  return `${rng.pick(STAFF_FIRST)} ${rng.pick(STAFF_LAST)}`
}
