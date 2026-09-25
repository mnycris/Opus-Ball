// ============================================================================
// Minute-by-minute football simulation. Each simulated minute is resolved from
// the live state (lineups, attributes, fatigue, tactics, score, momentum), so
// changing tactics or players mid-match changes every future probability.
// ============================================================================
import type { MatchEvent, MatchPlayerStats, MatchResult, Player, Position, TeamMatchStats, TeamSheet, TeamTactics } from '../../domain/types'
import { A } from '../../domain/types'
import { Rng, clamp, sigmoid } from '../../domain/rng'
import { formationOf, POS_GROUP } from '../../domain/constants'
import { posRating } from '../../domain/ratings'
import { BODY_PARTS, callName, line } from './commentary'

export type Phase = 'pre' | '1H' | 'HT' | '2H' | 'ET1' | 'ETHT' | 'ET2' | 'PENS' | 'FT'

export interface SideInput {
  clubId: number
  name: string
  short: string
  sheet: TeamSheet
  players: Record<number, Player>
  controlledByUser?: boolean
  managerVision?: string
}

export interface MatchContext {
  id: string
  compName: string
  neutral: boolean
  venue: string
  attendance: number
  derby?: string
  final?: boolean
  knockout: boolean
  aggregate?: [number, number] // goals already scored in the tie (home side of this match first)
  extraTime: boolean
  penaltiesOnly: boolean
  importance: number
  strictness: number // referee 0.7..1.3
  injuryRate: number // 1 normal
  commentary: boolean
  userSide?: 0 | 1 | -1
  assistantSubs?: boolean
  aiBoost?: number // difficulty multiplier applied to the side the user is facing
}

interface LP {
  p: Player
  slot: number
  pos: Position
  role: string
  focus: string
  energy: number
  on: boolean
  subOn?: number
  subOff?: number
  yellow: boolean
  red: boolean
  injured: boolean
  impact: number
  st: MatchPlayerStats
  q: { att: number; cre: number; def: number; ctl: number; pace: number; aer: number; gk: number; pr: number }
}

interface Model {
  att: number; cre: number; def: number; ctl: number; pace: number; aer: number; gk: number
  attPres: number; defPres: number; press: number; count: number
}

const INV: Record<string, [number, number, number, number]> = {
  // att, cre, def, ctl involvement
  GK: [0, 0.05, 0, 0.1], CB: [0.05, 0.15, 1, 0.3], FB: [0.2, 0.35, 0.8, 0.35], WB: [0.32, 0.45, 0.62, 0.4],
  CDM: [0.12, 0.5, 0.82, 0.9], CM: [0.32, 0.85, 0.45, 1], CAM: [0.7, 1, 0.15, 0.9], WM: [0.6, 0.72, 0.3, 0.55],
  W: [0.85, 0.72, 0.15, 0.5], CF: [0.95, 0.7, 0.1, 0.5], ST: [1, 0.4, 0.05, 0.3],
}
const POSKEY: Record<Position, string> = { GK: 'GK', CB: 'CB', RB: 'FB', LB: 'FB', RWB: 'WB', LWB: 'WB', CDM: 'CDM', CM: 'CM', CAM: 'CAM', RM: 'WM', LM: 'WM', RW: 'W', LW: 'W', CF: 'CF', ST: 'ST' }

const ROLE_MOD: Record<string, [number, number, number, number]> = {
  'Inside Forward': [1.18, 0.9, 1, 1], 'Winger': [1, 1.08, 1, 1], 'Wide Playmaker': [0.88, 1.25, 1, 1.1],
  'Wide Midfielder': [0.9, 1, 1.25, 1], 'Advanced Forward': [1.15, 0.85, 0.8, 0.9], 'Poacher': [1.22, 0.6, 0.6, 0.8],
  'False 9': [0.85, 1.4, 1, 1.25], 'Target Forward': [1.05, 0.9, 1.1, 1], 'Playmaker': [1, 1.25, 0.85, 1.1],
  'Shadow Striker': [1.25, 0.9, 0.7, 0.9], 'Half-Winger': [1.1, 1.1, 0.85, 1], 'Classic 10': [1, 1.35, 0.5, 1],
  'Box-to-Box': [1.08, 1.02, 1.08, 1.05], 'Holding': [0.6, 0.85, 1.22, 1.05], 'Deep-Lying Playmaker': [0.7, 1.22, 1, 1.18],
  'Centre-Half': [0.4, 0.7, 1.3, 0.9], 'Wide Half': [0.9, 1, 1.05, 1], 'Fullback': [0.8, 0.9, 1.15, 1],
  'Falseback': [0.85, 1.1, 1, 1.25], 'Wingback': [1.15, 1.1, 0.92, 1], 'Attacking Wingback': [1.4, 1.2, 0.8, 1],
  'Defender': [0.8, 0.9, 1.1, 0.95], 'Stopper': [0.9, 0.8, 1.12, 0.9], 'Ball-Playing Defender': [1, 1.3, 0.97, 1.3],
  'Goalkeeper': [1, 1, 1, 1], 'Sweeper Keeper': [1, 1.1, 1, 1.1], 'Ball-Playing Keeper': [1, 1.2, 1, 1.2],
}
const FOCUS_MOD: Record<string, [number, number, number, number]> = {
  Attack: [1.1, 1.03, 0.9, 1], Defend: [0.85, 0.95, 1.12, 1], Balanced: [1, 1, 1, 1], 'Build-Up': [0.9, 1.1, 1, 1.1],
  Roaming: [1.05, 1.1, 0.9, 1], Aggressive: [1, 1, 1.05, 0.95],
}
const MENT: Record<string, number> = { 'Ultra Defensive': -2, Defensive: -1, Balanced: 0, Attacking: 1, 'Ultra Attacking': 2 }

function emptyTeamStats(): TeamMatchStats {
  return { possession: 50, shots: 0, sot: 0, xg: 0, passes: 0, passAcc: 0, corners: 0, fouls: 0, offsides: 0, yellows: 0, reds: 0, saves: 0, bigChances: 0 }
}

class Side {
  lps: LP[] = []
  bench: LP[] = []
  tactics: TeamTactics
  formation: string
  model!: Model
  subsUsed = 0
  windowsUsed = 0
  momentum = 0
  possMinutes = 0
  stats = emptyTeamStats()
  aiMentality = 0
  constructor(public input: SideInput, public idx: 0 | 1) {
    this.tactics = { ...input.sheet.tactics }
    this.formation = input.sheet.formation
  }
  get onPitch() { return this.lps.filter((l) => l.on) }
  get name() { return this.input.short }
}

export class MatchSim {
  rng: Rng
  sides: [Side, Side]
  phase: Phase = 'pre'
  minute = 0
  added = 0
  addedPlanned = 0
  score: [number, number] = [0, 0]
  htScore: [number, number] = [0, 0]
  regScore?: [number, number]
  pens?: [number, number]
  events: MatchEvent[] = []
  lastPossessor: 0 | 1 = 0
  halfEventsWeight = 0
  paused = false
  injuredWaiting: { side: 0 | 1; lp: LP }[] = []
  private lastBuildMinute = 0

  constructor(public home: SideInput, public away: SideInput, public ctx: MatchContext, seed: number) {
    this.rng = new Rng(seed)
    this.sides = [new Side(home, 0), new Side(away, 1)]
    for (const s of this.sides) this.initSide(s)
  }

  // ----------------------------------------------------------- setup
  private mkLP(p: Player, slot: number, pos: Position, role: string, focus: string, side: 0 | 1, on: boolean): LP {
    const st: MatchPlayerStats = {
      id: p.id, side, pos, mins: 0, rating: 6, goals: 0, assists: 0, shots: 0, sot: 0, xg: 0, passes: 0, passesCompleted: 0,
      keyPasses: 0, tackles: 0, interceptions: 0, saves: 0, fouls: 0, yellow: false, red: false, started: on,
    }
    const lp: LP = { p, slot, pos, role, focus, energy: p.fitness, on, yellow: false, red: false, injured: false, impact: 0, st, q: { att: 0, cre: 0, def: 0, ctl: 0, pace: 0, aer: 0, gk: 0, pr: 0 } }
    this.computeQ(lp)
    return lp
  }

  private initSide(s: Side) {
    const f = formationOf(s.formation)
    const sheet = s.input.sheet
    sheet.lineup.forEach((id, i) => {
      const p = s.input.players[id]
      if (!p) return
      const r = sheet.roles[i] || { role: '', focus: 'Balanced' }
      s.lps.push(this.mkLP(p, i, f.slots[i].pos, r.role, r.focus, s.idx, true))
    })
    sheet.bench.forEach((id) => {
      const p = s.input.players[id]
      if (p) s.bench.push(this.mkLP(p, -1, p.positions[0], '', 'Balanced', s.idx, false))
    })
    this.rebuild(s)
  }

  private computeQ(lp: LP) {
    const a = lp.p.attrs
    const q = lp.q
    q.att = a[A.finishing] * 0.26 + a[A.positioning] * 0.2 + a[A.dribbling] * 0.14 + a[A.ballControl] * 0.12 + a[A.sprintSpeed] * 0.1 + a[A.composure] * 0.1 + a[A.shotPower] * 0.08
    q.cre = a[A.vision] * 0.3 + a[A.shortPassing] * 0.28 + a[A.ballControl] * 0.14 + a[A.crossing] * 0.12 + a[A.longPassing] * 0.1 + a[A.curve] * 0.06
    q.def = a[A.defAwareness] * 0.25 + a[A.standingTackle] * 0.2 + a[A.interceptions] * 0.16 + a[A.slidingTackle] * 0.09 + a[A.strength] * 0.1 + a[A.heading] * 0.1 + a[A.sprintSpeed] * 0.1
    q.ctl = a[A.shortPassing] * 0.3 + a[A.ballControl] * 0.2 + a[A.composure] * 0.15 + a[A.reactions] * 0.15 + a[A.vision] * 0.1 + a[A.agility] * 0.1
    q.pace = a[A.sprintSpeed] * 0.55 + a[A.acceleration] * 0.45
    q.aer = a[A.heading] * 0.5 + a[A.jumping] * 0.3 + a[A.strength] * 0.2
    q.gk = a[A.gkReflexes] * 0.3 + a[A.gkDiving] * 0.3 + a[A.gkPositioning] * 0.25 + a[A.gkHandling] * 0.15
    q.pr = posRating(lp.p, lp.pos)
  }

  private cond(lp: LP): number {
    const e = clamp(lp.energy, 5, 100)
    const fit = 0.7 + 0.3 * Math.pow(e / 100, 0.55)
    const sharp = 0.95 + 0.05 * (lp.p.sharpness / 100)
    const morale = 0.975 + 0.05 * ((lp.p.morale - 50) / 50)
    const big = this.ctx.importance >= 3 ? 1 + (lp.p.hidden.bigMatch - 50) / 1500 : 1
    const fam = clamp(lp.q.pr / Math.max(40, lp.p.ovr), 0.6, 1.02)
    return fit * sharp * morale * big * (0.55 + 0.45 * fam)
  }

  rebuild(s: Side) {
    let wA = 0, wC = 0, wD = 0, wT = 0, sA = 0, sC = 0, sD = 0, sT = 0, pace = 0, paceW = 0, aer = 0, aerW = 0, gk = 55, press = 0
    const on = s.onPitch
    const us = this.ctx.userSide
    const boost = us === 0 || us === 1 ? (s.idx === us ? 1 : this.ctx.aiBoost ?? 1) : 1
    for (const lp of on) {
      const key = POSKEY[lp.pos]
      const inv = INV[key]
      const rm = ROLE_MOD[lp.role] || [1, 1, 1, 1]
      const fm = FOCUS_MOD[lp.focus] || [1, 1, 1, 1]
      const c = this.cond(lp) * boost
      const wa = inv[0] * rm[0] * fm[0], wc = inv[1] * rm[1] * fm[1], wd = inv[2] * rm[2] * fm[2], wt = inv[3] * rm[3] * fm[3]
      wA += wa; wC += wc; wD += wd; wT += wt
      sA += wa * lp.q.att * c; sC += wc * lp.q.cre * c; sD += wd * lp.q.def * c; sT += wt * lp.q.ctl * c
      if (key === 'GK') gk = lp.q.gk * (0.7 + 0.3 * c)
      if (wa > 0.5) { pace += lp.q.pace * c; paceW++ }
      if (wd > 0.6 || key === 'ST' || key === 'CF') { aer += lp.q.aer * c; aerW++ }
      press += (lp.p.attrs[A.stamina] * 0.5 + lp.p.attrs[A.aggression] * 0.3 + lp.p.attrs[A.reactions] * 0.2) * c
    }
    if (!on.some((l) => l.pos === 'GK')) gk = 35
    const n = on.length
    s.model = {
      att: wA ? sA / wA : 40, cre: wC ? sC / wC : 40, def: wD ? sD / wD : 40, ctl: wT ? sT / wT : 40,
      pace: paceW ? pace / paceW : 60, aer: aerW ? aer / aerW : 60, gk,
      attPres: wA, defPres: wD, press: n ? press / n : 50, count: n,
    }
  }

  // ----------------------------------------------------------- public controls
  setTactics(side: 0 | 1, t: Partial<TeamTactics>, announce = true) {
    const s = this.sides[side]
    const before = s.tactics.mentality
    s.tactics = { ...s.tactics, ...t }
    this.rebuild(s)
    if (announce && this.phase !== 'pre' && this.ctx.commentary) {
      const x = t.mentality && t.mentality !== before ? `${t.mentality.toLowerCase()} mentality` : describeTactic(t)
      if (x) this.push({ min: this.displayMinute(), type: 'tactic', side, text: line(this.rng, 'tactic', { t: s.name, x }) })
    }
  }

  setRole(side: 0 | 1, playerId: number, role: string, focus: string) {
    const lp = this.sides[side].lps.find((l) => l.p.id === playerId)
    if (!lp) return
    lp.role = role; lp.focus = focus
    this.rebuild(this.sides[side])
  }

  canSub(side: 0 | 1): boolean {
    const s = this.sides[side]
    const max = this.phase === 'ET1' || this.phase === 'ETHT' || this.phase === 'ET2' ? 6 : 5
    return s.subsUsed < max && (s.windowsUsed < (max === 6 ? 4 : 3) || this.phase === 'HT' || this.phase === 'ETHT' || this.phase === 'pre')
  }

  substitute(side: 0 | 1, outId: number, inId: number, reason: 'tactical' | 'injury' = 'tactical'): boolean {
    const s = this.sides[side]
    const out = s.lps.find((l) => l.p.id === outId && l.on)
    const bi = s.bench.findIndex((l) => l.p.id === inId)
    if (!out || bi < 0 || !this.canSub(side)) return false
    const inn = s.bench.splice(bi, 1)[0]
    out.on = false
    out.subOff = this.minute
    out.st.subOff = this.minute
    inn.on = true
    inn.slot = out.slot
    inn.pos = out.pos
    inn.role = out.role
    inn.focus = out.focus
    inn.subOn = this.minute
    inn.st.subOn = this.minute
    inn.st.pos = out.pos
    this.computeQ(inn)
    s.lps.push(inn)
    s.subsUsed++
    if (!(this.phase === 'HT' || this.phase === 'ETHT' || this.phase === 'pre')) {
      // subs made in the same minute share a window
      const lastSub = [...this.events].reverse().find((e) => e.type === 'sub' && e.side === side)
      if (!lastSub || lastSub.min !== this.displayMinute()) s.windowsUsed++
    }
    this.rebuild(s)
    this.injuredWaiting = this.injuredWaiting.filter((x) => x.lp !== out)
    const atBreak = this.phase === 'HT' || this.phase === 'ETHT'
    this.push({
      min: atBreak ? (this.phase === 'HT' ? 46 : 106) : this.displayMinute(), add: atBreak ? undefined : this.added || undefined, type: 'sub', side, player: inn.p.id, player2: out.p.id,
      text: line(this.rng, reason === 'injury' ? 'subInjury' : 'sub', { t: s.name, p: callName(inn.p.name), q: callName(out.p.name) }),
    })
    return true
  }

  /** Move players between formation slots (formation change or swaps). */
  setFormation(side: 0 | 1, formationId: string, slotOrder?: number[]) {
    const s = this.sides[side]
    const f = formationOf(formationId)
    s.formation = f.id
    const on = s.onPitch
    const order = slotOrder ? slotOrder.map((id) => on.find((l) => l.p.id === id)).filter(Boolean) as LP[] : on.sort((a, b) => a.slot - b.slot)
    order.forEach((lp, i) => {
      if (!f.slots[i]) return
      lp.slot = i
      lp.pos = f.slots[i].pos
      lp.st.pos = lp.pos
      this.computeQ(lp)
    })
    this.rebuild(s)
    if (this.phase !== 'pre' && this.ctx.commentary) this.push({ min: this.displayMinute(), type: 'tactic', side, text: line(this.rng, 'tactic', { t: s.name, x: f.name }) })
  }

  // ----------------------------------------------------------- flow
  displayMinute(): number {
    return this.minute
  }

  private push(e: MatchEvent) {
    e.score = [...this.score] as [number, number]
    this.events.push(e)
  }

  get finished() { return this.phase === 'FT' }

  /** Advance one match minute. Returns events generated during it. */
  step(): MatchEvent[] {
    const start = this.events.length
    if (this.phase === 'FT' || this.paused) return []
    const v = this.venueVars()
    switch (this.phase) {
      case 'pre':
        this.phase = '1H'
        this.minute = 0
        this.push({ min: 0, type: 'kickoff', side: -1, text: this.ctx.commentary ? line(this.rng, this.ctx.final ? 'kickoffFinal' : this.ctx.derby ? 'kickoffDerby' : 'kickoff', v) : '' })
        return this.events.slice(start)
      case 'HT':
        this.phase = '2H'
        this.minute = 45
        this.added = 0
        this.aiHalfTime()
        this.push({ min: 45, type: 'kickoff', side: -1, text: this.ctx.commentary ? 'The second half is underway.' : '' })
        return this.events.slice(start)
      case 'ETHT':
        this.phase = 'ET2'
        this.minute = 105
        this.added = 0
        this.push({ min: 105, type: 'kickoff', side: -1, text: 'The second period of extra time begins.' })
        return this.events.slice(start)
      case 'PENS':
        this.shootout()
        return this.events.slice(start)
    }
    const endMin = this.phase === '1H' ? 45 : this.phase === '2H' ? 90 : this.phase === 'ET1' ? 105 : 120
    if (this.minute < endMin) this.minute++
    else this.added++
    if (this.minute === endMin && this.added === 0) {
      this.addedPlanned = this.plannedStoppage()
      if (this.ctx.commentary && this.addedPlanned > 0) this.push({ min: endMin, type: 'info', side: -1, text: line(this.rng, 'added', { x: this.addedPlanned }) })
    }
    this.simMinute()
    if (this.minute === endMin && this.added >= this.addedPlanned) this.endPeriod()
    return this.events.slice(start)
  }

  runToEnd(): MatchResult {
    let guard = 0
    while (this.phase !== 'FT' && guard++ < 400) {
      if (this.injuredWaiting.length) this.autoResolveInjuries()
      this.step()
    }
    return this.result()
  }

  private venueVars() {
    return { home: this.home.short, away: this.away.short, venue: this.ctx.venue, att: this.ctx.attendance.toLocaleString('en-GB'), derby: this.ctx.derby, comp: this.ctx.compName }
  }

  private plannedStoppage(): number {
    const ev = this.events.filter((e) => this.inCurrentPeriod(e))
    const goals = ev.filter((e) => e.type === 'goal' || e.type === 'penGoal' || e.type === 'owngoal').length
    const subs = ev.filter((e) => e.type === 'sub').length
    const cards = ev.filter((e) => e.type === 'yellow' || e.type === 'red' || e.type === 'secondYellow').length
    const inj = ev.filter((e) => e.type === 'injury').length
    const waste = this.sides.some((s) => s.tactics.timeWasting) ? 1.2 : 0
    const base = this.phase === '1H' ? 0.8 : this.phase === '2H' ? 2.2 : 0.4
    const x = base + goals * 0.45 + subs * (this.phase === '2H' ? 0.3 : 0.2) + cards * 0.25 + inj * 0.9 + waste + this.rng.next() * 1.4
    const max = this.phase === '1H' ? 6 : this.phase === '2H' ? 9 : 3
    return clamp(Math.round(x), this.phase === '2H' ? 2 : this.phase === '1H' ? 1 : 0, max)
  }

  private inCurrentPeriod(e: MatchEvent) {
    if (this.phase === '1H') return e.min <= 45
    if (this.phase === '2H') return e.min > 45 && e.min <= 90
    if (this.phase === 'ET1') return e.min > 90 && e.min <= 105
    return e.min > 105
  }

  private endPeriod() {
    const v = { ...this.venueVars(), hs: this.score[0], as: this.score[1] }
    if (this.phase === '1H') {
      this.htScore = [...this.score] as [number, number]
      this.phase = 'HT'
      this.push({ min: 45, add: this.added || undefined, type: 'ht', side: -1, text: line(this.rng, 'ht', v) })
      for (const s of this.sides) for (const lp of s.onPitch) lp.energy = Math.min(100, lp.energy + 3.5)
      return
    }
    if (this.phase === '2H') {
      if (this.needsDecider()) {
        this.regScore = [...this.score] as [number, number]
        if (this.ctx.penaltiesOnly || !this.ctx.extraTime) {
          this.phase = 'PENS'
          this.push({ min: 90, add: this.added || undefined, type: 'pens', side: -1, text: line(this.rng, 'pens', v) })
        } else {
          this.phase = 'ET1'
          this.minute = 90
          this.added = 0
          this.push({ min: 90, add: this.added || undefined, type: 'et', side: -1, text: line(this.rng, 'et', v) })
        }
        return
      }
      this.finish(v)
      return
    }
    if (this.phase === 'ET1') {
      this.phase = 'ETHT'
      this.push({ min: 105, type: 'ht', side: -1, text: `End of the first period of extra time. ${this.home.short} ${this.score[0]}-${this.score[1]} ${this.away.short}.` })
      return
    }
    if (this.phase === 'ET2') {
      if (this.needsDecider()) {
        this.phase = 'PENS'
        this.push({ min: 120, type: 'pens', side: -1, text: line(this.rng, 'pens', v) })
        return
      }
      this.finish(v)
    }
  }

  private needsDecider(): boolean {
    if (!this.ctx.knockout) return false
    const agg = this.ctx.aggregate || [0, 0]
    return this.score[0] + agg[0] === this.score[1] + agg[1]
  }

  private finish(v: Record<string, any>) {
    this.phase = 'FT'
    const key = this.score[0] === this.score[1] ? 'ftDraw' : 'ft'
    this.push({ min: this.minute, add: this.added || undefined, type: 'ft', side: -1, text: line(this.rng, key, { ...v, hs: this.score[0], as: this.score[1] }) })
    this.finalRatings()
  }

  // ----------------------------------------------------------- the minute
  private simMinute() {
    const [H, Aw] = this.sides
    this.fatigue()
    this.aiManage()
    const hm = H.model, am = Aw.model
    const homeAdv = this.ctx.neutral ? 0 : 0.15
    const styleBias = (s: Side) => {
      const t = s.tactics
      let b = t.buildUp === 'Short Passing' ? 0.32 : t.buildUp === 'Counter' ? -0.3 : t.buildUp === 'Long Ball' ? -0.28 : 0
      b += t.defApproach === 'Deep' ? -0.2 : t.defApproach === 'Aggressive' ? 0.12 : t.defApproach === 'High' ? 0.08 : 0
      b += t.chanceCreation === 'Possession' ? 0.15 : 0
      b += (MENT[t.mentality] + s.aiMentality) * 0.05
      return b
    }
    const lead = this.score[0] - this.score[1]
    const lateSit = this.minute > 70 ? clamp(lead, -2, 2) * 0.08 : 0
    const redDiff = (H.model.count - Aw.model.count) * 0.22
    const logit = (hm.ctl - am.ctl) / 17 + styleBias(H) - styleBias(Aw) + homeAdv - lateSit + redDiff + (H.momentum - Aw.momentum) * 0.25
    const pHome = sigmoid(logit)
    H.possMinutes += pHome
    Aw.possMinutes += 1 - pHome
    const pos: 0 | 1 = this.rng.next() < pHome ? 0 : 1
    const turnover = pos !== this.lastPossessor
    this.lastPossessor = pos
    const X = this.sides[pos], Y = this.sides[1 - pos as 0 | 1]
    X.momentum *= 0.92; Y.momentum *= 0.92

    // --- counter-attack after regaining the ball
    if (turnover) {
      const t = X.tactics
      const cf = (t.buildUp === 'Counter' ? 1.9 : t.buildUp === 'Long Ball' ? 1.2 : 1) * (t.chanceCreation === 'Forward Runs' ? 1.3 : 1) * (t.chanceCreation === 'Direct Passing' ? 1.15 : 1)
      const line = Y.tactics.lineHeight / 100
      const paceEdge = Math.exp((X.model.pace - Y.model.def * 0.5 - Y.model.pace * 0.5) / 18)
      const pCounter = 0.032 * cf * (0.6 + line * 0.9) * paceEdge * (1 + MENT[Y.tactics.mentality] * 0.12)
      if (this.rng.next() < pCounter) { this.attack(pos, 'counter'); return }
    }

    // --- defensive error under pressure
    const pErr = 0.0035 * (0.6 + Y.model.press / 120) * (X === this.sides[pos] ? 1 : 1) * (Y.tactics.pressing / 60) * Math.exp((65 - X.model.ctl) / 15)
    if (this.rng.next() < pErr) { this.attack(1 - pos as 0 | 1, 'error'); return }

    // --- main attacking sequence for the possessor
    const t = X.tactics
    const ment = MENT[t.mentality] + X.aiMentality
    const quality = Math.exp(((X.model.att * 0.55 + X.model.cre * 0.45) - Y.model.def) / 29)
    const presence = (0.8 + X.model.attPres * 0.07) / (0.8 + Y.model.defPres * 0.05)
    const tempo = 0.86 + t.tempo / 380
    const mentF = 1 + ment * 0.13
    const oppShape = Y.tactics.defApproach === 'Deep' ? 0.9 : Y.tactics.defApproach === 'Aggressive' ? 1.06 : 1
    const oppMent = 1 + MENT[Y.tactics.mentality] * 0.05
    const cc = t.chanceCreation === 'Possession' ? 0.9 : t.chanceCreation === 'Forward Runs' ? 1.07 : t.chanceCreation === 'Direct Passing' ? 1.04 : 1
    const home = pos === 0 && !this.ctx.neutral ? 1.12 : pos === 1 && !this.ctx.neutral ? 0.92 : 1
    const mom = 1 + X.momentum * 0.15
    const waste = this.timeWastingNow(X) ? 0.55 : 1
    const pShot = clamp(0.155 * quality * presence * tempo * mentF * oppShape * oppMent * cc * home * mom * waste, 0.03, 0.55)
    const r = this.rng.next()
    if (r < pShot) { this.attack(pos, 'open'); return }
    // corners, offsides, fouls, filler
    const r2 = this.rng.next()
    if (r2 < 0.062 * quality * mentF) { this.corner(pos); return }
    if (r2 < 0.062 * quality * mentF + 0.045 * (0.5 + Y.tactics.lineHeight / 100) * (t.chanceCreation === 'Forward Runs' ? 1.3 : 1) * (Y.tactics.offsideTrap ? 1.5 : 1)) { this.offside(pos); return }
    const pFoul = 0.29 * (0.7 + Y.tactics.pressing / 170) * (this.ctx.derby ? 1.15 : 1)
    if (this.rng.next() < pFoul) { this.foul(1 - pos as 0 | 1, pos, false); return }
    this.injuryCheck()
    if (this.ctx.commentary && this.minute - this.lastBuildMinute >= 3 && this.rng.next() < 0.35) {
      this.lastBuildMinute = this.minute
      const p = this.pickPlayer(X, (l) => INV[POSKEY[l.pos]][3] * l.q.ctl + INV[POSKEY[l.pos]][1] * 20)
      const q = this.pickPlayer(X, (l) => INV[POSKEY[l.pos]][0] * 20 + 1, p)
      const key = this.rng.next() < 0.1 ? 'crowd' : this.rng.next() < 0.12 && X.tactics.pressing > 65 ? 'press' : this.rng.next() < 0.08 && ment > 0 && this.minute > 75 ? 'pressure' : 'build'
      this.push({ min: this.minute, add: this.added || undefined, type: 'info', side: pos, player: p?.p.id, text: line(this.rng, key, { p: p ? callName(p.p.name) : '', q: q ? callName(q.p.name) : '', t: X.name, o: Y.name, side: this.rng.next() < 0.5 ? 'left' : 'right', venue: this.ctx.venue }) })
    }
  }

  private timeWastingNow(s: Side) {
    const lead = s.idx === 0 ? this.score[0] - this.score[1] : this.score[1] - this.score[0]
    return s.tactics.timeWasting && lead > 0 && this.minute > 60
  }

  private pickPlayer(s: Side, weight: (l: LP) => number, exclude?: LP): LP | undefined {
    const pool = s.onPitch.filter((l) => l !== exclude)
    if (!pool.length) return undefined
    return this.rng.weighted(pool, weight)
  }

  private gkOf(s: Side): LP | undefined {
    return s.onPitch.find((l) => l.pos === 'GK') || s.onPitch[0]
  }

  // ----------------------------------------------------------- attack resolution
  private attack(side: 0 | 1, source: 'open' | 'counter' | 'error' | 'corner' | 'freekick' | 'penalty' | 'rebound', fixedShooter?: LP) {
    const X = this.sides[side], Y = this.sides[1 - side as 0 | 1]
    const t = X.tactics
    const v = { t: X.name, o: Y.name, venue: this.ctx.venue } as Record<string, any>
    let type: string
    if (source === 'open') {
      const width = t.width / 100
      const wThrough = (t.chanceCreation === 'Direct Passing' ? 1.4 : 1) * (1.2 - Y.tactics.lineHeight / 250 + (Y.tactics.lineHeight > 65 ? 0.35 : 0)) * (X.model.pace / 70)
      const wCross = (0.5 + width * 1.1) * (t.playersInBox / 5) * (Y.tactics.defApproach === 'Deep' ? 1.25 : 1)
      const wCut = 0.7 + width * 0.4
      const wLong = (Y.tactics.defApproach === 'Deep' ? 1.35 : 0.8) * (t.buildUp === 'Long Ball' ? 1.15 : 1)
      const wDrib = 0.7 + (t.chanceCreation === 'Possession' ? 0.3 : 0)
      const opts: [string, number][] = [['through', wThrough * 0.75], ['cross', wCross], ['cutback', wCut * 0.9], ['long', wLong * 1.25], ['dribble', wDrib], ['combo', 1.25]]
      type = this.rng.weighted(opts, (o) => o[1])[0]
    } else type = source
    // pick shooter / creator
    const attackW = (l: LP) => {
      const inv = INV[POSKEY[l.pos]][0] * (ROLE_MOD[l.role]?.[0] || 1) * (FOCUS_MOD[l.focus]?.[0] || 1)
      let w = inv * Math.pow(l.q.att / 60, 2.1)
      if (type === 'cross' || type === 'corner') w = (INV[POSKEY[l.pos]][0] + (l.pos === 'CB' ? 0.35 : 0)) * Math.pow(l.q.aer / 60, 3) * (l.role === 'Target Forward' ? 1.5 : 1)
      if (type === 'long') w = (INV[POSKEY[l.pos]][1] + 0.2) * Math.pow(l.p.attrs[A.longShots] / 60, 3)
      if (l.pos === 'GK') w = 0
      return w
    }
    const shooter = fixedShooter || this.pickPlayer(X, attackW)
    if (!shooter) return
    const creatorW = (l: LP) => {
      let w = INV[POSKEY[l.pos]][1] * (ROLE_MOD[l.role]?.[1] || 1) * Math.pow(l.q.cre / 60, 3)
      if (type === 'cross' || type === 'cutback') w = (['FB', 'WB', 'W', 'WM'].includes(POSKEY[l.pos]) ? 1.3 : 0.3) * Math.pow(l.p.attrs[A.crossing] / 60, 3)
      if (l.pos === 'GK') w *= 0.05
      return w
    }
    const assisted = !['long', 'dribble', 'penalty', 'freekick', 'error'].includes(type) || this.rng.next() < 0.25
    const creator = type === 'corner' ? this.setPieceTaker(X, 'corner') : assisted ? this.pickPlayer(X, creatorW, shooter) : undefined
    const gk = this.gkOf(Y)
    const a = shooter.p.attrs
    const c = this.cond(shooter)
    const defQ = Y.model.def
    // base xG by chance type, scaled by shooter vs defence quality
    const skill = (() => {
      switch (type) {
        case 'cross': case 'corner': return (a[A.heading] * 0.55 + a[A.jumping] * 0.25 + a[A.positioning] * 0.2) * c
        case 'long': return (a[A.longShots] * 0.55 + a[A.shotPower] * 0.3 + a[A.curve] * 0.15) * c
        case 'freekick': return (a[A.fkAccuracy] * 0.6 + a[A.curve] * 0.3 + a[A.shotPower] * 0.1) * c
        case 'penalty': return (a[A.penalties] * 0.7 + a[A.composure] * 0.3) * c
        case 'dribble': return (a[A.dribbling] * 0.35 + a[A.finishing] * 0.4 + a[A.agility] * 0.25) * c
        default: return (a[A.finishing] * 0.6 + a[A.composure] * 0.25 + a[A.positioning] * 0.15) * c
      }
    })()
    const base: Record<string, [number, number]> = {
      through: [0.13, 0.32], counter: [0.12, 0.3], error: [0.22, 0.45], cutback: [0.1, 0.24], cross: [0.035, 0.12], corner: [0.03, 0.1],
      long: [0.018, 0.055], dribble: [0.05, 0.15], combo: [0.05, 0.14], freekick: [0.035, 0.08], penalty: [0.76, 0.79], rebound: [0.14, 0.32],
    }
    const [lo, hi] = base[type] || [0.08, 0.2]
    const edge = clamp(0.5 + (skill - (type === 'penalty' ? 75 : defQ)) / 70 + this.rng.normal(0, 0.2), 0, 1)
    let xg = lo + (hi - lo) * edge
    if (creator && type !== 'corner') xg *= 0.92 + creator.q.cre / 600
    // playstyles
    const ps = shooter.p.playstyles, pp = shooter.p.playstylesPlus
    const has = (n: string) => ps.includes(n) || pp.some((x) => x.startsWith(n))
    if (type === 'long' && (has('Power shot') || has('Finesse shot'))) xg *= 1.25
    if ((type === 'cross' || type === 'corner') && has('Precision header')) xg *= 1.25
    if (type === 'freekick' && has('Dead ball')) xg *= 1.35
    if ((type === 'through' || type === 'counter') && has('Rapid')) xg *= 1.08
    if (creator && (creator.p.playstyles.includes('Incisive pass') || creator.p.playstylesPlus.some((x) => x.startsWith('Incisive'))) && type === 'through') xg *= 1.1
    xg = clamp(xg, 0.01, 0.95)
    X.stats.shots++
    shooter.st.shots++
    X.stats.xg += xg
    shooter.st.xg += xg
    if (xg >= 0.3) X.stats.bigChances++
    if (creator) creator.st.keyPasses++
    shooter.impact += 0.05 + xg * 0.3
    if (creator) creator.impact += 0.08 + xg * 0.4
    // defender blocks
    const blockP = type === 'long' ? 0.28 : type === 'combo' || type === 'dribble' ? 0.18 : type === 'penalty' || type === 'freekick' ? (type === 'freekick' ? 0.2 : 0) : 0.07
    const intro = this.ctx.commentary ? this.chanceIntro(type, shooter, creator, v) : ''
    if (this.rng.next() < blockP * (Y.model.def / 70)) {
      const blocker = this.pickPlayer(Y, (l) => INV[POSKEY[l.pos]][2] * l.q.def)
      if (blocker) { blocker.impact += 0.12; blocker.st.tackles++ }
      this.push({ min: this.minute, add: this.added || undefined, type: 'chance', side, player: shooter.p.id, player2: creator?.p.id, xg, text: `${intro} ${line(this.rng, 'blocked', v)}`.trim() })
      if (this.rng.next() < 0.45) this.corner(side, true)
      X.momentum += 0.04
      return
    }
    // outcome
    const gkQ = gk ? gk.q.gk * (0.8 + 0.2 * this.cond(gk)) : 40
    const gkF = clamp(1 + (72 - gkQ) / 95, 0.7, 1.45)
    const pGoal = clamp(xg * gkF * (0.94 + c * 0.06), 0.005, 0.96)
    const pOn = clamp(0.27 + xg * 0.85 + (skill - 70) / 200, 0.16, 0.9)
    const roll = this.rng.next()
    if (roll < pGoal) {
      X.stats.sot++
      shooter.st.sot++
      // VAR offside for through balls occasionally
      if ((type === 'through' || type === 'counter') && this.rng.next() < 0.045) {
        this.push({ min: this.minute, add: this.added || undefined, type: 'var', side, player: shooter.p.id, text: line(this.rng, 'offsideGoal', { p: callName(shooter.p.name) }) })
        X.stats.offsides++
        return
      }
      this.goal(side, shooter, creator, type, xg, intro)
      return
    }
    if (roll < pOn || type === 'penalty' && roll < pOn + 0.05) {
      X.stats.sot++
      shooter.st.sot++
      Y.stats.saves++
      if (gk) { gk.st.saves++; gk.impact += 0.1 + xg * 0.9 }
      const key = type === 'penalty' ? 'penMiss' : xg > 0.28 ? 'saveGreat' : xg > 0.12 ? 'saveGood' : 'saveEasy'
      this.push({ min: this.minute, add: this.added || undefined, type: type === 'penalty' ? 'penMiss' : 'save', side, player: shooter.p.id, player2: creator?.p.id, xg, big: xg > 0.28, text: `${intro} ${line(this.rng, key, { gk: gk ? callName(gk.p.name) : 'the keeper', p: callName(shooter.p.name) })}`.trim() })
      if (type === 'penalty') shooter.impact -= 0.6
      // rebounds and corners
      if (type !== 'penalty' && this.rng.next() < 0.12) { this.attack(side, 'rebound'); return }
      if (this.rng.next() < 0.3) this.corner(side, true)
      X.momentum += 0.05
      return
    }
    const wood = this.rng.next() < 0.06
    const big = xg > 0.33 && !wood
    if (big) shooter.impact -= 0.2
    this.push({ min: this.minute, add: this.added || undefined, type: wood ? 'woodwork' : type === 'penalty' ? 'penMiss' : 'miss', side, player: shooter.p.id, player2: creator?.p.id, xg, big, text: `${intro} ${line(this.rng, wood ? 'woodwork' : type === 'penalty' ? 'penMiss' : big ? 'missBig' : 'miss', { p: callName(shooter.p.name), gk: gk ? callName(gk.p.name) : '' })}`.trim() })
    X.momentum += 0.03
  }

  private chanceIntro(type: string, s: LP, c: LP | undefined, v: Record<string, any>): string {
    const key: Record<string, string> = { through: 'chanceThrough', cross: 'chanceCross', cutback: 'chanceCutback', long: 'chanceLong', dribble: 'chanceDribble', combo: 'chanceDribble', counter: 'chanceCounter', corner: 'chanceCorner', freekick: 'chanceFreekick', error: 'chanceError', rebound: 'chanceRebound', penalty: 'chanceFreekick' }
    if (type === 'penalty') return `${callName(s.p.name)} steps up...`
    return line(this.rng, c ? key[type] : type === 'through' || type === 'cross' || type === 'cutback' ? 'chanceDribble' : key[type], { ...v, p: callName(s.p.name), a: c ? callName(c.p.name) : '' })
  }

  private goal(side: 0 | 1, shooter: LP, creator: LP | undefined, type: string, xg: number, intro: string) {
    const X = this.sides[side], Y = this.sides[1 - side as 0 | 1]
    const own = type !== 'penalty' && this.rng.next() < 0.025
    this.score[side]++
    const gk = this.gkOf(Y)
    let scorer = shooter
    if (own) {
      const og = this.pickPlayer(Y, (l) => INV[POSKEY[l.pos]][2] + 0.01)
      if (og) { scorer = og; og.impact -= 0.9 }
    }
    if (!own) {
      shooter.st.goals++
      shooter.impact += 1.0
      if (creator) { creator.st.assists++; creator.impact += 0.65 }
    }
    if (gk) gk.impact -= 0.25
    for (const l of Y.onPitch) if (INV[POSKEY[l.pos]][2] > 0.6) l.impact -= 0.12
    X.momentum = clamp(X.momentum + 0.35, -1, 1)
    Y.momentum = clamp(Y.momentum - 0.15, -1, 1)
    const v = { p: callName(scorer.p.name), a: creator ? callName(creator.p.name) : '', t: own ? Y.name : X.name, gk: gk ? callName(gk.p.name) : '', venue: this.ctx.venue }
    let text = ''
    if (this.ctx.commentary) {
      const key = own ? 'goalOwn' : type === 'penalty' ? 'goalPen' : type === 'freekick' ? 'goalFK' : type === 'cross' || type === 'corner' ? 'goalHeader'
        : type === 'long' ? 'goalLong' : type === 'dribble' ? 'goalSolo' : type === 'counter' ? 'goalCounter' : type === 'cutback' || type === 'rebound' ? 'goalTap' : 'goal'
      const lead = this.score[side] - this.score[1 - side]
      const ctx = lead === 0 ? line(this.rng, 'equaliser', { t: X.name }) : lead === 1 ? line(this.rng, 'lead', { t: X.name }) : ''
      const late = this.minute >= 85 && Math.abs(lead) <= 1 ? line(this.rng, 'late', v) : ''
      const goals = own ? 0 : shooter.st.goals
      const hat = goals === 3 ? line(this.rng, 'hattrick', v) : goals === 2 && this.rng.next() < 0.5 ? line(this.rng, 'brace', v) : ''
      text = [intro && type !== 'penalty' ? intro : '', line(this.rng, key, v), ctx, late, hat].filter(Boolean).join(' ')
    }
    this.push({ min: this.minute, add: this.added || undefined, type: own ? 'owngoal' : type === 'penalty' ? 'penGoal' : 'goal', side, player: scorer.p.id, player2: own ? undefined : creator?.p.id, xg, big: true, text })
    if (creator && !own && this.ctx.commentary) {
      this.push({ min: this.minute, add: this.added || undefined, type: 'info', side, player: creator.p.id, text: line(this.rng, 'assist', { a: callName(creator.p.name) }) })
    }
  }

  private setPieceTaker(s: Side, kind: 'corner' | 'freekick' | 'penalty'): LP | undefined {
    const sheet = s.input.sheet
    const id = kind === 'penalty' ? sheet.penalties : kind === 'freekick' ? sheet.freeKicks : this.rng.next() < 0.5 ? sheet.cornersL : sheet.cornersR
    const lp = s.onPitch.find((l) => l.p.id === id)
    if (lp) return lp
    const key = kind === 'penalty' ? A.penalties : kind === 'freekick' ? A.fkAccuracy : A.crossing
    return [...s.onPitch].filter((l) => l.pos !== 'GK').sort((a, b) => b.p.attrs[key] - a.p.attrs[key])[0]
  }

  private corner(side: 0 | 1, silent = false) {
    const X = this.sides[side], Y = this.sides[1 - side as 0 | 1]
    X.stats.corners++
    if (!silent && this.ctx.commentary && this.rng.next() < 0.4) this.push({ min: this.minute, add: this.added || undefined, type: 'corner', side, text: line(this.rng, 'corner', { t: X.name }) })
    const aerialEdge = Math.exp((X.model.aer - Y.model.aer) / 20)
    const style = X.tactics.corners === 'Short' ? 0.6 : 1
    if (this.rng.next() < 0.28 * aerialEdge * style) this.attack(side, 'corner')
  }

  private offside(side: 0 | 1) {
    const X = this.sides[side]
    X.stats.offsides++
    const p = this.pickPlayer(X, (l) => INV[POSKEY[l.pos]][0] * l.q.pace)
    if (this.ctx.commentary && p && this.rng.next() < 0.55) this.push({ min: this.minute, add: this.added || undefined, type: 'offside', side, player: p.p.id, text: line(this.rng, 'offside', { p: callName(p.p.name) }) })
  }

  private foul(foulSide: 0 | 1, victimSide: 0 | 1, _inBox: boolean) {
    const F = this.sides[foulSide], V = this.sides[victimSide]
    const fouler = this.pickPlayer(F, (l) => (INV[POSKEY[l.pos]][2] + 0.25) * Math.pow(l.p.attrs[A.aggression] / 60, 2) * (l.role === 'Stopper' ? 1.4 : 1) * (l.energy < 50 ? 1.3 : 1))
    const victim = this.pickPlayer(V, (l) => INV[POSKEY[l.pos]][0] + INV[POSKEY[l.pos]][1] * 0.5 + l.p.attrs[A.dribbling] / 200)
    if (!fouler || !victim) return
    F.stats.fouls++
    fouler.st.fouls++
    fouler.impact -= 0.03
    victim.impact += 0.03
    const attackingThird = this.rng.next() < 0.3 + MENT[V.tactics.mentality] * 0.05
    const pen = attackingThird && this.rng.next() < 0.05
    const agg = fouler.p.attrs[A.aggression]
    const strict = this.ctx.strictness * (this.ctx.derby ? 1.15 : 1) * (this.minute > 75 ? 1.12 : 1) * (foulSide === 0 && !this.ctx.neutral ? 0.94 : 1)
    const pYellow = 0.13 * Math.pow(agg / 65, 1.1) * strict * (fouler.p.hidden.temperament > 70 ? 1.2 : 1) * (fouler.yellow ? 0.4 : 1)
    const pRed = 0.0011 * strict * (agg / 70)
    let carded = false
    if (this.rng.next() < pRed && !fouler.red) {
      this.sendOff(foulSide, fouler, false)
      carded = true
    } else if (this.rng.next() < pYellow) {
      carded = true
      if (fouler.yellow) this.sendOff(foulSide, fouler, true)
      else {
        fouler.yellow = true
        fouler.st.yellow = true
        fouler.impact -= 0.3
        F.stats.yellows++
        this.push({ min: this.minute, add: this.added || undefined, type: 'yellow', side: foulSide, player: fouler.p.id, player2: victim.p.id, text: line(this.rng, 'yellow', { p: callName(fouler.p.name) }) })
      }
    }
    if (!carded && this.ctx.commentary && this.rng.next() < 0.18) {
      this.push({ min: this.minute, add: this.added || undefined, type: 'foul', side: foulSide, player: fouler.p.id, player2: victim.p.id, text: line(this.rng, 'foul', { p: callName(fouler.p.name), q: callName(victim.p.name) }) })
    }
    if (pen) {
      if (this.ctx.commentary && this.rng.next() < 0.25) this.push({ min: this.minute, add: this.added || undefined, type: 'var', side: victimSide, text: line(this.rng, 'var', {}) })
      this.push({ min: this.minute, add: this.added || undefined, type: 'info', side: victimSide, player: victim.p.id, text: line(this.rng, 'penaltyAwarded', { p: callName(victim.p.name), t: V.name }) })
      const taker = this.setPieceTaker(V, 'penalty')
      if (taker) this.attack(victimSide, 'penalty', taker)
      return
    }
    if (attackingThird && this.rng.next() < 0.35) {
      const taker = this.setPieceTaker(V, 'freekick')
      if (taker && (V.tactics.freeKicks !== 'Cross' && this.rng.next() < 0.55)) this.attack(victimSide, 'freekick', taker)
      else if (this.rng.next() < 0.3) this.attack(victimSide, 'corner')
    }
    // injury from challenges
    if (this.rng.next() < 0.006 * this.ctx.injuryRate) this.injure(victimSide, victim)
  }

  private sendOff(side: 0 | 1, lp: LP, second: boolean) {
    const S = this.sides[side]
    lp.red = true
    lp.st.red = true
    lp.on = false
    lp.subOff = this.minute
    lp.impact -= second ? 1.2 : 1.6
    S.stats.reds++
    if (second) S.stats.yellows++
    this.push({ min: this.minute, add: this.added || undefined, type: second ? 'secondYellow' : 'red', side, player: lp.p.id, text: line(this.rng, second ? 'secondYellow' : 'red', { p: callName(lp.p.name), t: S.name }) })
    S.momentum -= 0.2
    this.rebuild(S)
    // keeper sent off: sacrifice an outfield player for the reserve keeper
    if (lp.pos === 'GK') {
      const gkBench = S.bench.find((b) => b.p.positions[0] === 'GK')
      const victim = S.onPitch.filter((l) => l.pos !== 'GK').sort((a, b) => INV[POSKEY[a.pos]][2] - INV[POSKEY[b.pos]][2])[0]
      if (gkBench && victim && this.canSub(side)) {
        this.substitute(side, victim.p.id, gkBench.p.id)
        const g = S.lps.find((l) => l.p.id === gkBench.p.id)!
        g.pos = 'GK'
        this.computeQ(g)
        this.rebuild(S)
      } else if (victim) {
        victim.pos = 'GK'
        this.computeQ(victim)
        this.rebuild(S)
      }
    }
  }

  private injuryCheck() {
    for (const s of this.sides) {
      for (const lp of s.onPitch) {
        const prone = lp.p.hidden.injuryProne / 100
        const tired = lp.energy < 40 ? 1.8 : lp.energy < 60 ? 1.25 : 1
        const p = 0.000055 * this.ctx.injuryRate * (0.6 + prone * 1.8) * tired * (lp.p.playstyles.includes('Injury prone') ? 1.6 : 1)
        if (this.rng.next() < p) { this.injure(s.idx, lp); return }
      }
    }
  }

  private injure(side: 0 | 1, lp: LP) {
    if (lp.injured || !lp.on) return
    lp.injured = true
    lp.st.injured = true
    this.push({ min: this.minute, add: this.added || undefined, type: 'injury', side, player: lp.p.id, text: line(this.rng, 'injury', { p: callName(lp.p.name), t: this.sides[side].name, part: this.rng.pick(BODY_PARTS) }) })
    const S = this.sides[side]
    const userControlled = S.input.controlledByUser && !this.ctx.assistantSubs
    if (userControlled) {
      this.injuredWaiting.push({ side, lp })
      lp.energy = Math.min(lp.energy, 35)
      this.rebuild(S)
      return
    }
    this.replaceInjured(side, lp)
  }

  private replaceInjured(side: 0 | 1, lp: LP) {
    const S = this.sides[side]
    const sub = this.bestReplacement(S, lp.pos)
    if (sub && this.canSub(side)) this.substitute(side, lp.p.id, sub.p.id, 'injury')
    else {
      lp.on = false
      lp.subOff = this.minute
      this.push({ min: this.minute, add: this.added || undefined, type: 'info', side, player: lp.p.id, text: line(this.rng, 'injuryOff', { p: callName(lp.p.name) }) })
      this.rebuild(S)
    }
    this.injuredWaiting = this.injuredWaiting.filter((x) => x.lp !== lp)
  }

  autoResolveInjuries() {
    for (const { side, lp } of [...this.injuredWaiting]) this.replaceInjured(side, lp)
  }

  bestReplacement(S: Side, pos: Position): LP | undefined {
    const pool = S.bench.filter((b) => (pos === 'GK') === (b.p.positions[0] === 'GK'))
    return pool.sort((a, b) => posRating(b.p, pos) - posRating(a.p, pos))[0]
  }

  private fatigue() {
    for (const s of this.sides) {
      const t = s.tactics
      for (const lp of s.onPitch) {
        lp.st.mins++
        if (lp.pos === 'GK') { lp.energy -= 0.05; continue }
        const stam = lp.p.attrs[A.stamina]
        const roleInt = lp.role === 'Box-to-Box' || lp.role.includes('Wingback') ? 0.14 : lp.role === 'Poacher' || lp.role === 'Classic 10' ? -0.1 : 0
        const relentless = lp.p.playstyles.includes('Relentless') || lp.p.playstylesPlus.some((x) => x.startsWith('Relentless')) ? -0.18 : 0
        const intensity = 1 + (t.pressing - 50) / 190 + (t.tempo - 50) / 320 + roleInt + relentless + (s.model.count < 11 ? 0.08 : 0)
        lp.energy -= 0.26 * (1.38 - stam / 100 * 0.65) * intensity
      }
      if (this.minute % 5 === 0) this.rebuild(s)
    }
  }

  // ----------------------------------------------------------- AI management
  private aiHalfTime() {
    for (const s of this.sides) {
      if (s.input.controlledByUser && !this.ctx.assistantSubs) continue
      const lead = s.idx === 0 ? this.score[0] - this.score[1] : this.score[1] - this.score[0]
      if (lead < 0 && this.rng.next() < 0.6) this.aiAttackingSub(s)
    }
  }

  private aiManage() {
    for (const s of this.sides) {
      const auto = !s.input.controlledByUser || this.ctx.assistantSubs
      const lead = s.idx === 0 ? this.score[0] - this.score[1] : this.score[1] - this.score[0]
      const agg = this.ctx.aggregate ? (s.idx === 0 ? this.ctx.aggregate[0] - this.ctx.aggregate[1] : this.ctx.aggregate[1] - this.ctx.aggregate[0]) : 0
      const effLead = lead + agg
      if (!s.input.controlledByUser) {
        // mentality shifts
        let target = 0
        if (this.minute >= 70 && effLead < 0) target = this.minute >= 83 ? 2 : 1
        else if (this.minute >= 75 && effLead === 1) target = -1
        else if (this.minute >= 85 && effLead >= 1) target = -1
        if (this.ctx.knockout && effLead === 0 && this.minute >= 80) target = 0.5
        if (target !== s.aiMentality) {
          const before = s.aiMentality
          s.aiMentality = target
          if (this.ctx.commentary && Math.abs(target - before) >= 1 && this.rng.next() < 0.7) {
            const x = target > 0 ? 'throwing men forward' : 'shutting up shop'
            this.push({ min: this.minute, type: 'tactic', side: s.idx, text: line(this.rng, 'tactic', { t: s.name, x }) })
          }
          if (target < 0 && effLead > 0 && this.minute > 80 && (s.input.managerVision === 'Park the Bus' || this.rng.next() < 0.3)) s.tactics.timeWasting = true
        }
      }
      if (!auto) continue
      if (this.minute < 56 || !this.canSub(s.idx)) continue
      // subs in windows around 60', 70', 80'
      const windows = [58 + (s.idx * 3), 68 + (s.idx * 2), 79]
      const inWindow = windows.some((wm) => this.minute === wm)
      if (!inWindow) continue
      const tired = s.onPitch.filter((l) => l.pos !== 'GK' && (l.energy < 62 || l.yellow && l.p.attrs[A.aggression] > 70)).sort((a, b) => a.energy - b.energy)
      const n = Math.min(this.rng.int(1, 2), tired.length)
      for (let i = 0; i < n; i++) {
        const out = tired[i]
        let inn = this.bestReplacement(s, out.pos)
        if (effLead < 0 && this.minute >= 65) {
          // chasing: swap a defender/holder for an attacker
          const att = s.bench.filter((b) => POS_GROUP[b.p.positions[0]] === 'ATT').sort((a, b) => b.p.ovr - a.p.ovr)[0]
          if (att && INV[POSKEY[out.pos]][2] > 0.6 && this.rng.next() < 0.5) inn = att
        }
        if (inn && inn.p.ovr >= out.p.ovr - 12) this.substitute(s.idx, out.p.id, inn.p.id)
      }
    }
  }

  private aiAttackingSub(s: Side) {
    const out = s.onPitch.filter((l) => INV[POSKEY[l.pos]][2] > 0.5 && l.pos !== 'GK').sort((a, b) => a.impact - b.impact)[0]
    const att = s.bench.filter((b) => POS_GROUP[b.p.positions[0]] === 'ATT' || POS_GROUP[b.p.positions[0]] === 'MID').sort((a, b) => b.p.ovr - a.p.ovr)[0]
    if (out && att && this.canSub(s.idx)) this.substitute(s.idx, out.p.id, att.p.id)
  }

  // ----------------------------------------------------------- penalties
  private shootout() {
    const order = (s: Side) => {
      const sheet = s.input.sheet
      return [...s.onPitch].sort((a, b) => (b.p.id === sheet.penalties ? 100 : 0) + b.p.attrs[A.penalties] + b.p.attrs[A.composure] * 0.5 - ((a.p.id === sheet.penalties ? 100 : 0) + a.p.attrs[A.penalties] + a.p.attrs[A.composure] * 0.5))
    }
    const lists = [order(this.sides[0]), order(this.sides[1])]
    const sc: [number, number] = [0, 0]
    const taken: [number, number] = [0, 0]
    const kicks: string[] = []
    let round = 0
    const kick = (side: 0 | 1) => {
      const list = lists[side]
      const taker = list[taken[side] % list.length]
      const gk = this.gkOf(this.sides[1 - side as 0 | 1])
      const skill = taker.p.attrs[A.penalties] * 0.6 + taker.p.attrs[A.composure] * 0.4
      const gkq = gk ? gk.p.attrs[A.gkReflexes] * 0.5 + gk.p.attrs[A.gkDiving] * 0.5 : 50
      const p = clamp(0.74 + (skill - 72) / 160 - (gkq - 75) / 260 - (round >= 5 ? 0.03 : 0), 0.45, 0.93)
      const scored = this.rng.next() < p
      taken[side]++
      if (scored) sc[side]++
      kicks.push(`${this.sides[side].name}: ${callName(taker.p.name)} ${scored ? 'scores' : this.rng.next() < 0.6 && gk ? `is denied by ${callName(gk.p.name)}` : 'misses'}`)
      this.push({ min: 120, type: 'shootout', side, player: taker.p.id, text: `${callName(taker.p.name)} ${scored ? 'scores!' : this.rng.next() < 0.6 ? 'sees his penalty saved!' : 'misses the target!'} (${sc[0]}-${sc[1]})` })
    }
    for (round = 0; round < 5; round++) {
      kick(0)
      if (sc[0] > sc[1] + (5 - round - 1) + 1 || sc[1] > sc[0] + (5 - round)) break
      kick(1)
      if (sc[0] > sc[1] + (5 - round - 1) || sc[1] > sc[0] + (5 - round - 1)) break
    }
    while (sc[0] === sc[1]) { round++; kick(0); kick(1); if (round > 30) { sc[0]++; break } }
    this.pens = sc
    const v = { ...this.venueVars(), hs: this.score[0], as: this.score[1] }
    const winner = sc[0] > sc[1] ? this.home.short : this.away.short
    this.phase = 'FT'
    this.push({ min: 120, type: 'ft', side: -1, text: `${winner} win ${Math.max(...sc)}-${Math.min(...sc)} on penalties!` })
    void v
    this.finalRatings()
  }

  // ----------------------------------------------------------- ratings & result
  private finalRatings() {
    for (const s of this.sides) {
      const gf = s.idx === 0 ? this.score[0] : this.score[1]
      const ga = s.idx === 0 ? this.score[1] : this.score[0]
      const win = gf > ga, loss = gf < ga
      const all = [...s.lps, ...s.bench.filter((b) => b.st.mins > 0)]
      for (const lp of all) {
        if (lp.st.mins === 0 && !lp.st.started) continue
        const g = POSKEY[lp.pos]
        let r = 6.0 + lp.impact
        r += win ? 0.35 : loss ? -0.3 : 0
        if (ga === 0 && lp.st.mins >= 60 && (g === 'GK' || INV[g][2] >= 0.6)) r += g === 'GK' ? 0.7 : 0.45
        if (g === 'GK') r += (lp.st.saves - ga) * 0.05
        // quiet involvement proxy
        r += (INV[g][3] * (s.stats.possession - 50)) / 100
        r += this.rng.normal(0, 0.28) * (1 - lp.p.hidden.consistency / 160)
        const minsF = clamp(lp.st.mins / 70, 0.25, 1)
        r = 6.2 + (r - 6.2) * minsF
        lp.st.rating = Math.round(clamp(r, 3.5, 10) * 10) / 10
      }
    }
  }

  result(): MatchResult {
    const tot = this.sides[0].possMinutes + this.sides[1].possMinutes || 1
    const poss0 = Math.round((this.sides[0].possMinutes / tot) * 100)
    const statsOut: [TeamMatchStats, TeamMatchStats] = [this.sides[0].stats, this.sides[1].stats]
    statsOut[0].possession = poss0
    statsOut[1].possession = 100 - poss0
    // passes from possession share and style
    for (const s of this.sides) {
      const st = s.stats
      const poss = st.possession / 100
      const style = s.tactics.buildUp === 'Short Passing' ? 1.18 : s.tactics.buildUp === 'Long Ball' ? 0.8 : s.tactics.buildUp === 'Counter' ? 0.88 : 1
      st.passes = Math.round((330 + 520 * poss) * style * (0.93 + this.rng.next() * 0.14))
      const acc = clamp(0.71 + (s.model.ctl - 68) / 120 + (poss - 0.5) * 0.18 + (style > 1 ? 0.03 : style < 0.9 ? -0.05 : 0), 0.6, 0.94)
      st.passAcc = Math.round(acc * 100)
      st.xg = Math.round(st.xg * 100) / 100
      const on = [...s.lps, ...s.bench.filter((b) => b.st.mins > 0)]
      const wsum = on.reduce((a, l) => a + (INV[POSKEY[l.pos]][3] + 0.15) * l.st.mins, 0) || 1
      for (const l of on) {
        const share = ((INV[POSKEY[l.pos]][3] + 0.15) * l.st.mins) / wsum
        l.st.passes = Math.round(st.passes * share)
        l.st.passesCompleted = Math.round(l.st.passes * clamp(acc + (l.q.ctl - 70) / 200, 0.5, 0.97))
        l.st.tackles += Math.round(INV[POSKEY[l.pos]][2] * (l.st.mins / 90) * (1.2 + this.rng.next() * 2.5))
        l.st.interceptions += Math.round(INV[POSKEY[l.pos]][2] * (l.st.mins / 90) * (0.5 + this.rng.next() * 2) * (l.p.attrs[A.interceptions] / 70))
      }
    }
    // late-bound ratings for players involved (ensure computed)
    const players: MatchPlayerStats[] = []
    for (const s of this.sides) for (const l of [...s.lps, ...s.bench]) if (l.st.mins > 0 || l.st.started) { l.st.energy = Math.round(l.energy); players.push(l.st) }
    const winnerSide = this.pens ? (this.pens[0] > this.pens[1] ? 0 : 1) : this.score[0] > this.score[1] ? 0 : this.score[1] > this.score[0] ? 1 : -1
    const motm = [...players].sort((a, b) => b.rating + (a.side === winnerSide ? 0 : 0) - a.rating + (b.side === winnerSide ? 0.25 : 0) - (a.side === winnerSide ? 0.25 : 0))[0]
    return {
      score: [...this.score] as [number, number],
      ht: this.htScore,
      et: this.regScore,
      pens: this.pens,
      events: this.events,
      stats: statsOut,
      players,
      motm: motm?.id,
      attendance: this.ctx.attendance,
      detail: 'full',
      lineups: [this.sides[0].input.sheet.lineup, this.sides[1].input.sheet.lineup],
      formations: [this.sides[0].formation, this.sides[1].formation],
    }
  }

  // ----------------------------------------------------------- UI helpers
  liveRatings(side: 0 | 1): { id: number; rating: number; energy: number; on: boolean; pos: Position; yellow: boolean; red: boolean; injured: boolean; slot: number }[] {
    const s = this.sides[side]
    return [...s.lps, ...s.bench].map((l) => {
      const minsF = clamp(l.st.mins / 70, 0.25, 1)
      return { id: l.p.id, rating: Math.round(clamp(6.2 + (l.impact) * minsF, 3.5, 10) * 10) / 10, energy: l.energy, on: l.on, pos: l.pos, yellow: l.yellow, red: l.red, injured: l.injured, slot: l.slot }
    })
  }

  liveStats(): [TeamMatchStats, TeamMatchStats] {
    const tot = this.sides[0].possMinutes + this.sides[1].possMinutes || 1
    const p0 = Math.round((this.sides[0].possMinutes / tot) * 100)
    const a = { ...this.sides[0].stats, possession: this.minute ? p0 : 50 }
    const b = { ...this.sides[1].stats, possession: this.minute ? 100 - p0 : 50 }
    for (const [s, st] of [[this.sides[0], a], [this.sides[1], b]] as const) {
      const poss = st.possession / 100
      st.passes = Math.round((330 + 520 * poss) * (this.minute / 90))
      st.passAcc = Math.round(clamp(0.71 + (s.model.ctl - 68) / 120 + (poss - 0.5) * 0.18, 0.6, 0.94) * 100)
      st.xg = Math.round(st.xg * 100) / 100
    }
    return [a, b]
  }

  sideModel(side: 0 | 1) { return this.sides[side].model }
  sideTactics(side: 0 | 1) { return this.sides[side].tactics }
  sideFormation(side: 0 | 1) { return this.sides[side].formation }
  subsLeft(side: 0 | 1) { return (this.phase.startsWith('ET') ? 6 : 5) - this.sides[side].subsUsed }
  onPitchIds(side: 0 | 1) { return this.sides[side].onPitch.sort((a, b) => a.slot - b.slot).map((l) => l.p.id) }
  benchIds(side: 0 | 1) { return this.sides[side].bench.map((l) => l.p.id) }
}

function describeTactic(t: Partial<TeamTactics>): string {
  if (t.defApproach) return `a ${t.defApproach.toLowerCase()} defensive approach`
  if (t.buildUp) return `${t.buildUp.toLowerCase()} build-up`
  if (t.pressing !== undefined) return t.pressing > 65 ? 'a higher press' : 'a lower press'
  if (t.timeWasting) return 'slowing the game down'
  if (t.width !== undefined) return t.width > 60 ? 'stretching the play' : 'a narrower shape'
  if (t.lineHeight !== undefined) return t.lineHeight > 60 ? 'pushing the line higher' : 'dropping deeper'
  return ''
}
