/** Deterministic, serialisable PRNG (mulberry32). */
export class Rng {
  state: number
  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9
  }
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next()
  }
  int(a: number, b: number) {
    return Math.floor(a + (b - a + 1) * this.next())
  }
  chance(p: number) {
    return this.next() < p
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]
  }
  weighted<T>(items: readonly T[], weight: (t: T) => number): T {
    let total = 0
    for (const it of items) total += Math.max(0, weight(it))
    if (total <= 0) return items[Math.floor(this.next() * items.length)]
    let r = this.next() * total
    for (const it of items) {
      r -= Math.max(0, weight(it))
      if (r <= 0) return it
    }
    return items[items.length - 1]
  }
  normal(mean = 0, sd = 1) {
    const u = 1 - this.next(), v = this.next()
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }
  poisson(lambda: number) {
    const L = Math.exp(-lambda)
    let k = 0, p = 1
    do { k++; p *= this.next() } while (p > L)
    return k - 1
  }
}

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))
