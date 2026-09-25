// Live 2D match view: a properly proportioned (105×68) pitch with all 22 players as kit-coloured, numbered dots moving
// with the phase of play, and a real football that travels through each simulated minute's build-up, shots and set
// pieces. Plus the FotMob-style momentum graph.
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { Club, World } from '../../domain/types'
import { formationOf } from '../../domain/constants'
import type { MatchSim, MinuteFrame } from '../../engine/match/engine'
import { Ball } from './Lineup'

interface Pt { x: number; y: number }
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const hash = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295 }

function hexRgb(h: string): [number, number, number] {
  const n = parseInt((h || '#888888').replace('#', '').padEnd(6, '0').slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const lum = (h: string) => { const [r, g, b] = hexRgb(h); return (r * 299 + g * 587 + b * 114) / 1000 }
const dist = (a: string, b: string) => { const x = hexRgb(a), y = hexRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) }

/** Kit colours for both sides, switching the away side to its second colour on a clash. */
export function kitColors(home: Club, away: Club): [string, string] {
  const h = home.kit?.[0] || '#3ea6ff'
  let a = away.kit?.[0] || '#ff8a3d'
  if (dist(h, a) < 110) a = away.kit?.[1] && dist(h, away.kit[1]) >= 110 ? away.kit[1] : lum(h) > 150 ? '#1b2330' : '#f2f2f2'
  return [h, a]
}

const SHOT = new Set(['goal', 'penGoal', 'owngoal', 'save', 'miss', 'chance', 'woodwork', 'penMiss', 'var'])
const LABEL: Record<string, string> = {
  goal: 'GOAL', penGoal: 'GOAL', owngoal: 'OWN GOAL', save: 'SAVE', miss: 'OFF TARGET', chance: 'BLOCKED', woodwork: 'WOODWORK', penMiss: 'PENALTY MISSED',
  var: 'VAR · NO GOAL', corner: 'CORNER', freekick: 'FREE KICK', offside: 'OFFSIDE', foul: 'FOUL', yellow: 'YELLOW CARD', red: 'RED CARD', secondYellow: 'RED CARD', injury: 'INJURY',
}

/** Ball waypoints for one simulated minute, starting from where the ball is now. */
function pathFor(f: MinuteFrame, from: Pt, idx: number): Pt[] {
  const r = (k: number) => hash(idx, k)
  const atk = f.s
  const edge = (v: number) => (atk === 0 ? v : 100 - v)
  const end: Pt = { x: f.x, y: f.y }
  const lerp = (t: number, lat: number): Pt => ({ x: from.x + (end.x - from.x) * t, y: clamp(lat, 6, 94) })
  if (SHOT.has(f.k)) {
    const shotAt: Pt = f.k === 'goal' || f.k === 'penGoal' || f.k === 'owngoal' ? { x: edge(84 + r(1) * 8), y: 32 + r(2) * 36 } : { x: f.x, y: f.y }
    const target: Pt =
      f.k === 'goal' || f.k === 'penGoal' || f.k === 'owngoal' ? { x: edge(101.2), y: 46 + r(3) * 8 }
        : f.k === 'save' || f.k === 'penMiss' ? { x: edge(97.2), y: 45 + r(3) * 10 }
          : f.k === 'woodwork' ? { x: edge(99.6), y: r(3) < 0.5 ? 44.2 : 55.8 }
            : f.k === 'miss' ? { x: edge(102), y: r(3) < 0.5 ? 36 + r(4) * 5 : 59 + r(4) * 5 }
              : { x: edge(91), y: shotAt.y + (r(3) - 0.5) * 8 }
    const build = { x: edge(62 + r(5) * 14), y: 15 + r(6) * 70 }
    return [build, shotAt, target]
  }
  if (f.k === 'corner') return [{ x: edge(80 + r(1) * 10), y: end.y < 50 ? 10 : 90 }, end]
  if (f.k === 'kickoff') return [{ x: 50, y: 50 }]
  return [lerp(0.35, 20 + r(1) * 60), lerp(0.72, 20 + r(2) * 60), end]
}

interface Dot { id: number; no: number; side: 0 | 1; gk: boolean; sx: number; sy: number }

export const LivePitch = memo(function LivePitch({ sim, w, speed, frameCount, home, away }: { sim: MatchSim; w: World; speed: number; frameCount: number; home: Club; away: Club }) {
  const [ball, setBall] = useState<Pt>({ x: 50, y: 50 })
  const [dur, setDur] = useState(600)
  const [poss, setPoss] = useState<0 | 1 | -1>(-1)
  const [tag, setTag] = useState<{ text: string; x: number; y: number; k: string; id: number }>()
  const [net, setNet] = useState<{ side: 0 | 1; id: number }>()
  const [tick, setTick] = useState(0)
  const timers = useRef<number[]>([])
  const lastAt = useRef(0)
  const frameCountPrev = useRef(0)
  const ballRef = useRef(ball)
  ballRef.current = ball
  const [hc, ac] = useMemo(() => kitColors(home, away), [home.id, away.id])

  // players currently on the pitch, positioned from their formation slots
  const dots: Dot[] = useMemo(() => {
    const out: Dot[] = []
    for (const side of [0, 1] as const) {
      const f = formationOf(sim.sideFormation(side))
      for (const r of sim.liveRatings(side)) {
        if (!r.on) continue
        const s = f.slots[r.slot] || f.slots[0]
        out.push({ id: r.id, no: w.players[r.id]?.jersey || 0, side, gk: r.pos === 'GK', sx: s.x, sy: s.y })
      }
    }
    return out
  }, [frameCount, sim.phase, sim.events.length])

  useEffect(() => {
    const frames = sim.timeline
    const f = frames[frames.length - 1]
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    const now = performance.now()
    const gap = now - lastAt.current
    lastAt.current = now
    const brk = sim.phase === 'HT' || sim.phase === 'ETHT' || sim.phase === 'pre' || sim.phase === 'PENS' || (sim.phase === 'FT' && !f)
    if (!f || brk) {
      setDur(700); setBall({ x: 50, y: 50 }); setPoss(-1); setTick((t) => t + 1)
      return
    }
    const minuteMs = 1000 / speed
    // fast-forwarding (seek / next break): snap to the minute's end state
    if (gap < minuteMs * 0.5 || frames.length - frameCountPrev.current > 1) {
      frameCountPrev.current = frames.length
      setDur(Math.max(60, Math.min(220, gap)))
      setBall({ x: clamp(f.x, -1, 101), y: f.y }); setPoss(f.s); setTick((t) => t + 1)
      return
    }
    frameCountPrev.current = frames.length
    const prev = frames[frames.length - 2]
    const from: Pt = prev && (prev.k === 'goal' || prev.k === 'penGoal' || prev.k === 'owngoal') ? { x: 50, y: 50 } : ballRef.current
    const pts = pathFor(f, from, frames.length)
    const seg = (minuteMs * 0.92) / pts.length
    setPoss(f.s)
    pts.forEach((p, i) => {
      timers.current.push(window.setTimeout(() => {
        setDur(seg * (i === pts.length - 1 && SHOT.has(f.k) ? 0.55 : 1))
        setBall(p)
        setTick((t) => t + 1)
        if (i === pts.length - 1 && LABEL[f.k]) {
          setTag({ text: LABEL[f.k], x: p.x, y: p.y, k: f.k, id: frames.length })
          if (f.k === 'goal' || f.k === 'penGoal' || f.k === 'owngoal') setNet({ side: f.s, id: frames.length })
        }
      }, i === 0 ? 0 : seg * i))
    })
    return () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = [] }
  }, [frameCount, sim.phase])

  useEffect(() => {
    if (!tag) return
    const t = window.setTimeout(() => setTag(undefined), 1700)
    return () => window.clearTimeout(t)
  }, [tag?.id])
  useEffect(() => {
    if (!net) return
    const t = window.setTimeout(() => setNet(undefined), 2600)
    return () => window.clearTimeout(t)
  }, [net?.id])

  // team shapes follow the ball; the nearest player of each side engages it
  const placed = useMemo(() => {
    const bx = clamp(ball.x, 0, 100), by = clamp(ball.y, 0, 100)
    const pos = dots.map((d) => {
      const inPoss = poss === d.side
      // work in the side's own frame: 0 = own goal, 100 = opponent goal
      const bOwn = d.side === 0 ? bx : 100 - bx
      const byOwn = d.side === 0 ? by : 100 - by
      let x: number, y: number
      if (d.gk) {
        x = clamp(4 + bOwn * 0.1, 3, 14)
        y = 50 + (byOwn - 50) * 0.18
      } else {
        const cx = poss === -1 ? 30 : clamp(bOwn * 0.72 + (inPoss ? 9 : -7), 18, 70)
        x = cx + (d.sy - 48) * (inPoss ? 0.46 : 0.34)
        y = 50 + (d.sx - 50) * (inPoss ? 0.98 : 0.78) + (byOwn - 50) * 0.2
        if (poss === -1) x = clamp(x, 6, 48)
      }
      const j = 1.6
      x += (hash(d.id, tick) - 0.5) * j
      y += (hash(d.id + 7, tick) - 0.5) * j * 1.4
      return { d, x: d.side === 0 ? x : 100 - x, y: d.side === 0 ? y : 100 - y }
    })
    if (poss !== -1) {
      for (const side of [0, 1] as const) {
        const cand = pos.filter((p) => p.d.side === side && !p.d.gk)
        if (!cand.length) continue
        const near = cand.reduce((a, b) => (Math.hypot(a.x - bx, (a.y - by) * 0.65) < Math.hypot(b.x - bx, (b.y - by) * 0.65) ? a : b))
        const k = side === poss ? 0.92 : 0.6
        const back = side === 0 ? -1.4 : 1.4
        near.x = near.x + (bx + (side === poss ? back : -back) - near.x) * k
        near.y = near.y + (by - near.y) * k
      }
    }
    return pos
  }, [dots, ball, poss, tick])

  const move = `${Math.round(dur)}ms`
  return (
    <div className="lp">
      <svg className="lp-lines" viewBox="0 0 105 68" preserveAspectRatio="none" aria-hidden>
        <g fill="none" stroke="rgba(255,255,255,.3)" strokeWidth=".3">
          <rect x="0.4" y="0.4" width="104.2" height="67.2" />
          <line x1="52.5" y1="0.4" x2="52.5" y2="67.6" />
          <circle cx="52.5" cy="34" r="9.15" />
          <rect x="0.4" y="13.84" width="16.5" height="40.32" /><rect x="88.1" y="13.84" width="16.5" height="40.32" />
          <rect x="0.4" y="24.84" width="5.5" height="18.32" /><rect x="99.1" y="24.84" width="5.5" height="18.32" />
          <path d="M16.9 26.7a9.15 9.15 0 0 1 0 14.6M88.1 26.7a9.15 9.15 0 0 0 0 14.6" />
          <path d="M.4 1.4a1 1 0 0 0 1-1M103.6.4a1 1 0 0 0 1 1M.4 66.6a1 1 0 0 1 1 1M103.6 67.6a1 1 0 0 1 1-1" />
        </g>
        <g fill="rgba(255,255,255,.35)"><circle cx="52.5" cy="34" r=".35" /><circle cx="11" cy="34" r=".3" /><circle cx="94" cy="34" r=".3" /></g>
        <g stroke="rgba(255,255,255,.55)" strokeWidth=".35" fill="rgba(255,255,255,.06)">
          <rect x="-1.6" y="30.34" width="2" height="7.32" /><rect x="104.6" y="30.34" width="2" height="7.32" />
        </g>
      </svg>
      {net && <span className={`lp-net ${net.side === 0 ? 'r' : 'l'}`} key={net.id} />}
      {placed.map(({ d, x, y }) => (
        <span key={d.id} className={`lp-dot ${d.gk ? 'gk' : ''}`}
          style={{ left: `${x}%`, top: `${y}%`, transition: `left ${move} ease-in-out, top ${move} ease-in-out`, ['--kit' as any]: d.gk ? (d.side === 0 ? '#f5d90a' : '#b16cf0') : d.side === 0 ? hc : ac, color: lum(d.gk ? (d.side === 0 ? '#f5d90a' : '#b16cf0') : d.side === 0 ? hc : ac) > 150 ? '#0b0d11' : '#fff' }}>
          {d.no || ''}
        </span>
      ))}
      <span className="lp-ball-shadow" style={{ left: `${clamp(ball.x, -1.5, 101.5)}%`, top: `${ball.y}%`, transition: `left ${move} ease-out, top ${move} ease-out` }} />
      <span className={`lp-ball ${dur > 150 ? 'rolling' : ''}`} style={{ left: `${clamp(ball.x, -1.5, 101.5)}%`, top: `${ball.y}%`, transition: `left ${move} ease-out, top ${move} ease-out` }}>
        <Ball size={11} />
      </span>
      {tag && <span key={tag.id} className={`lp-tag k-${tag.k}`} style={{ left: `${clamp(tag.x, 12, 88)}%`, top: `${clamp(tag.y - 12, 8, 90)}%` }}>{tag.text}</span>}
    </div>
  )
})

/** FotMob-style momentum graph: per-minute pressure bars, home above the line and away below, with goals marked. */
export function MomentumGraph({ data, goals, colors, live, et }: { data: [number, number][]; goals: { key: number; side: 0 | 1 }[]; colors: [string, string]; live?: boolean; et?: boolean }) {
  const W = 300, H = 56, mid = H / 2
  const total = Math.max(data.length + (live ? 1 : 0), et ? 130 : 97)
  const bw = W / total
  const sm = data.map((_, i) => ((data[i - 1]?.[1] ?? data[i][1]) + 2 * data[i][1] + (data[i + 1]?.[1] ?? data[i][1])) / 4)
  const idxOf = (key: number) => { const i = data.findIndex((d) => d[0] >= key - 1e-6); return i < 0 ? data.length - 1 : i }
  const ht = data.findIndex((d) => d[0] >= 46)
  const ft = data.findIndex((d) => d[0] >= 91)
  return (
    <svg className="mom-graph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <line x1="0" y1={mid} x2={W} y2={mid} stroke="rgba(255,255,255,.12)" strokeWidth=".6" />
      {ht > 0 && <line x1={ht * bw} y1="2" x2={ht * bw} y2={H - 2} stroke="rgba(255,255,255,.18)" strokeDasharray="2 2" strokeWidth=".6" />}
      {ft > 0 && <line x1={ft * bw} y1="2" x2={ft * bw} y2={H - 2} stroke="rgba(255,255,255,.18)" strokeDasharray="2 2" strokeWidth=".6" />}
      {sm.map((v, i) => {
        const h = Math.max(0.6, Math.pow(Math.abs(v), 0.6) * (mid - 7))
        return <rect key={i} x={i * bw + bw * 0.12} width={bw * 0.76} y={v >= 0 ? mid - h : mid} height={h} rx={bw * 0.2} fill={v >= 0 ? colors[0] : colors[1]} opacity={0.92} />
      })}
      {goals.map((g, i) => {
        const x = (idxOf(g.key) + 0.5) * bw
        return <g key={i} transform={`translate(${x - 4} ${g.side === 0 ? 0 : H - 8})`}><circle cx="4" cy="4" r="4" fill="#fff" /><circle cx="4" cy="4" r="1.6" fill="#15181c" /></g>
      })}
      {live && data.length > 0 && <rect x={data.length * bw} y="3" width="1" height={H - 6} fill="var(--acc)" />}
    </svg>
  )
}
