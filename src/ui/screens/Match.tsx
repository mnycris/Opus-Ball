import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Fx } from '../components/Fx'
import { useGame, useWorld, haptic } from '../../store/game'
import type { Fixture, MatchEvent, MatchResult, Player, TeamMatchStats, TeamTactics, World } from '../../domain/types'
import { Icon } from '../icons/Icon'
import { Badge, CompLogo, Face, FormPips, Ovr, PosChip } from '../components/atoms'
import { Screen, Seg, Sheet, Tabs } from '../components/layout'
import { Pitch } from '../components/Pitch'
import { FORMATIONS, formationOf, MENTALITIES } from '../../domain/constants'
import { fmtDate } from '../../domain/dates'
import { createSim, sideInput } from '../../engine/world/matchRunner'
import { validateSheet } from '../../engine/match/selection'
import { aggregateBefore } from '../../engine/competitions/cups'
import { userFixtureOn } from '../../engine/world/advance'
import type { MatchSim } from '../../engine/match/engine'
import { compLogoKey, fixturesOf, leagueOf, outcomeFor, scoreLine } from '../selectors'
import { sortTable } from '../../engine/competitions/tables'
import { callName } from '../../engine/match/commentary'
import { posRating } from '../../domain/ratings'
import { ordinal } from './Menu'

// ============================================================================ helpers
const EVENT_ICON: Record<string, [string, string]> = {
  goal: ['ball', '#fff'], penGoal: ['ball', '#fff'], owngoal: ['ball', 'var(--neg)'], penMiss: ['close', 'var(--neg)'], yellow: ['yellow', '#F5D33F'],
  red: ['red', 'var(--neg)'], secondYellow: ['red', 'var(--neg)'], sub: ['sub', 'var(--acc)'], injury: ['injury', 'var(--neg)'], save: ['glove', 'var(--info)'],
  chance: ['target', 'var(--t2)'], miss: ['target', 'var(--t3)'], woodwork: ['goal', 'var(--warn)'], corner: ['corner', 'var(--t3)'], freekick: ['whistle', 'var(--t3)'],
  offside: ['flag', 'var(--t3)'], foul: ['whistle', 'var(--t3)'], var: ['var', 'var(--info)'], tactic: ['tactics', 'var(--t2)'], ht: ['whistle', '#fff'], ft: ['whistle', '#fff'],
  kickoff: ['whistle', '#fff'], info: ['info', 'var(--t3)'], et: ['clock', '#fff'], pens: ['ball', '#fff'], shootout: ['ball', '#fff'],
}
const KEY_EVENTS = new Set(['goal', 'penGoal', 'owngoal', 'penMiss', 'red', 'secondYellow', 'yellow', 'injury', 'sub', 'var', 'woodwork', 'ht', 'ft', 'pens', 'et'])
const minLabel = (e: MatchEvent) => `${e.min}${e.add ? `+${e.add}` : ''}'`

function phaseLabel(sim: MatchSim) {
  switch (sim.phase) {
    case 'pre': return 'Kick-off'
    case '1H': return '1st Half'
    case 'HT': return 'Half-time'
    case '2H': return '2nd Half'
    case 'ET1': case 'ET2': return 'Extra time'
    case 'ETHT': return 'ET break'
    case 'PENS': return 'Penalties'
    case 'FT': return 'Full-time'
  }
}
function clock(sim: MatchSim) {
  if (sim.phase === 'pre') return "0'"
  if (sim.phase === 'HT') return 'HT'
  if (sim.phase === 'FT') return 'FT'
  if (sim.phase === 'ETHT') return 'ET HT'
  if (sim.phase === 'PENS') return 'PENS'
  return `${sim.minute}${sim.added ? `+${sim.added}` : ''}'`
}

function momentum(events: MatchEvent[], minute: number): number {
  let a = 0, b = 0
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.min < minute - 12) break
    const wgt = e.type === 'goal' || e.type === 'penGoal' ? 5 : e.type === 'chance' || e.type === 'save' || e.type === 'woodwork' ? 2.2 : e.type === 'miss' ? 1.6 : e.type === 'corner' ? 1 : e.type === 'freekick' ? 0.6 : 0
    const recency = 1 - (minute - e.min) / 14
    if (e.side === 0) a += wgt * recency
    if (e.side === 1) b += wgt * recency
  }
  const t = a + b
  return t ? (a - b) / Math.max(t, 6) : 0
}

function userSideOf(w: World, f: Fixture): 0 | 1 { return f.home === w.userClubId ? 0 : 1 }

function goalScorers(w: World, r: MatchResult, side: 0 | 1) {
  const map = new Map<number, string[]>()
  for (const e of r.events) {
    if (!(e.type === 'goal' || e.type === 'penGoal' || e.type === 'owngoal')) continue
    const scoringSide = e.side
    if (scoringSide !== side) continue
    const id = e.player!
    const arr = map.get(id) || []
    arr.push(`${minLabel(e)}${e.type === 'penGoal' ? ' (P)' : e.type === 'owngoal' ? ' (OG)' : ''}`)
    map.set(id, arr)
  }
  return [...map.entries()].map(([id, mins]) => `${callName(w.players[id]?.name || '')} ${mins.join(', ')}`)
}

// ============================================================================ pre-match
export function PreMatch() {
  const w = useWorld()
  const close = useGame((s) => s.close)
  const closeAll = useGame((s) => s.closeAll)
  const open = useGame((s) => s.open)
  const go = useGame((s) => s.go)
  const setLive = useGame((s) => s.setLive)
  const prefs = useGame((s) => s.prefs)
  const finish = useGame((s) => s.finishUserMatch)
  const [tab, setTab] = useState<'preview' | 'lineups'>('preview')
  const f = userFixtureOn(w, w.date)
  if (!f) {
    return <Screen title="Match Day" back onBack={close} noNav><div className="pad muted">No match today.</div></Screen>
  }
  const comp = w.competitions[f.compId]
  const home = w.clubs[f.home], away = w.clubs[f.away]
  const us = userSideOf(w, f)
  const club = w.clubs[w.userClubId]
  const sheet = club.sheets.find((s) => s.id === club.activeSheet) || club.sheets[0]
  const { sheet: valid, issues } = validateSheet(w, club, sheet, comp)
  const oppId = us === 0 ? f.away : f.home
  const oppSheet = sideInput(w, oppId, comp, false).sheet
  const agg = aggregateBefore(w, f)
  const form = (id: number) => fixturesOf(w, id).filter((x) => x.played && x.result).slice(-5).map((x) => outcomeFor(x, id)!)
  const h2h = fixturesOf(w, f.home).filter((x) => x.played && x.result && (x.home === f.away || x.away === f.away)).slice(-5).reverse()
  const pos = (id: number) => { const c = leagueOf(w, id); if (!c?.table?.some((r) => r.p)) return undefined; return sortTable(w, c).findIndex((r) => r.clubId === id) + 1 }
  const danger = oppSheet.lineup.map((id) => w.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr).slice(0, 3)

  const start = (mode: 'live' | 'sim') => {
    haptic('medium')
    // commit auto-fixes to the saved sheet so the lineup the user sees is the one that plays
    Object.assign(sheet, valid)
    const sim = createSim(w, f, true)
    if (mode === 'sim') {
      sim.ctx.assistantSubs = true
      const r = sim.runToEnd()
      finish(f.id, r)
      closeAll()
      open({ name: 'postmatch', params: { id: f.id } })
      return
    }
    setLive({ sim, fixtureId: f.id, speed: prefs.matchSpeed, running: true, tick: 0, finished: false, applied: false })
    closeAll()
    open({ name: 'match' })
  }

  return (
    <Screen title="Match Day" sub={`${comp?.name} · ${f.roundName}`} back onBack={close} noNav>
      <div className="pad">
        <div className="hero prematch-hero">
          <Fx kind="tunnel" />
          <div style={{ position: 'relative', zIndex: 1, padding: 16 }}>
            <div className="row tight" style={{ justifyContent: 'center' }}>{comp && <CompLogo k={compLogoKey(comp)} size={28} name={comp.name} />}</div>
            <div className="row" style={{ marginTop: 12, alignItems: 'flex-start' }}>
              <TeamCol w={w} id={home.id} pos={pos(home.id)} />
              <div className="col center" style={{ minWidth: 76, paddingTop: 18 }}>
                <div className="display" style={{ fontSize: 30 }}>{f.time}</div>
                <div className="tiny" style={{ opacity: 0.8 }}>{fmtDate(f.date, 'dm')}</div>
                {agg && <div className="pill" style={{ marginTop: 6, background: 'rgba(0,0,0,.4)' }}>1st leg {agg[1]}–{agg[0]}</div>}
              </div>
              <TeamCol w={w} id={away.id} pos={pos(away.id)} />
            </div>
            <div className="row tight tiny" style={{ justifyContent: 'center', marginTop: 10, opacity: 0.85 }}>
              <Icon name="stadium" size={14} /> {f.venue || (f.neutral ? 'Neutral venue' : home.stadium)}
              {f.derby && <><span>·</span><Icon name="fire" size={14} color="#ff8a5c" /> {f.derby}</>}
            </div>
          </div>
        </div>
      </div>
      {issues.length > 0 && (
        <div className="pad" style={{ marginTop: 10 }}>
          <div className="card pad-card small" style={{ borderColor: 'rgba(255,176,32,.35)' }}>
            <div className="row tight b warn"><Icon name="warning" size={16} /> Team sheet auto-adjusted</div>
            {issues.map((i) => <div key={i} className="muted" style={{ marginTop: 4 }}>{i}</div>)}
          </div>
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <Tabs items={[{ id: 'preview', label: 'Preview' }, { id: 'lineups', label: 'Line-ups' }]} value={tab} onChange={setTab} />
      </div>
      {tab === 'preview' ? (
        <div className="pad stack" style={{ marginTop: 12 }}>
          <div className="card pad-card">
            <div className="label" style={{ marginBottom: 10 }}>Form</div>
            <div className="row between"><div className="row tight"><Badge club={home} size={22} /><FormPips form={form(home.id)} /></div><div className="row tight"><FormPips form={form(away.id)} /><Badge club={away} size={22} /></div></div>
          </div>
          <div className="card">
            <div className="card-h"><span className="label">Danger men · {w.clubs[oppId].short}</span></div>
            <div className="list">
              {danger.map((p) => (
                <button key={p.id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => go({ name: 'player', params: { id: p.id } })}>
                  <Face p={p} size={40} radius={10} club={w.clubs[oppId]} />
                  <div className="meta"><div className="t">{p.name}</div><div className="s">{p.playstylesPlus.length ? `${p.playstylesPlus[0]}+` : p.playstyles[0] || p.positions.join(' / ')}</div></div>
                  <PosChip pos={p.positions[0]} /><Ovr v={p.ovr} size="sm" />
                </button>
              ))}
            </div>
          </div>
          {h2h.length > 0 && (
            <div className="card">
              <div className="card-h"><span className="label">Recent meetings</span></div>
              <div className="list">{h2h.map((x) => <FixtureRow key={x.id} w={w} f={x} />)}</div>
            </div>
          )}
          <div className="card pad-card small">
            <div className="label" style={{ marginBottom: 8 }}>Your plan</div>
            <div className="row between"><span className="muted">Formation</span><b>{formationOf(valid.formation).name}</b></div>
            <div className="row between" style={{ marginTop: 6 }}><span className="muted">Mentality</span><b>{valid.tactics.mentality}</b></div>
            <div className="row between" style={{ marginTop: 6 }}><span className="muted">Build-up · Defence</span><b>{valid.tactics.buildUp} · {valid.tactics.defApproach}</b></div>
            <div className="row between" style={{ marginTop: 6 }}><span className="muted">Captain</span><b>{w.players[valid.captain]?.name}</b></div>
          </div>
        </div>
      ) : (
        <div className="pad stack" style={{ marginTop: 12 }}>
          <LineupPitch w={w} lineup={valid.lineup} formation={valid.formation} clubId={club.id} title={`${club.short} · ${formationOf(valid.formation).name}`} />
          <LineupPitch w={w} lineup={oppSheet.lineup} formation={oppSheet.formation} clubId={oppId} title={`${w.clubs[oppId].short} · predicted ${formationOf(oppSheet.formation).name}`} />
        </div>
      )}
      <div className="pad stack" style={{ marginTop: 16 }}>
        <div className="row">
          <button className="btn grow" onClick={() => go({ name: 'tactics' })}><Icon name="tactics" size={18} /> Team Sheet</button>
          <button className="btn grow" onClick={() => open({ name: 'press', params: { kind: 'pre', fixtureId: f.id } })} disabled={!!w.flags.pressDone?.[`pre:${f.id}`]}><Icon name="chat" size={18} /> Press</button>
        </div>
        <button className="btn primary block" style={{ height: 56, fontSize: 19 }} onClick={() => start('live')}><Icon name="play" size={22} /> Play Match</button>
        <button className="btn block" onClick={() => start('sim')}><Icon name="skip" size={18} /> Quick Sim</button>
      </div>
    </Screen>
  )
}

function TeamCol({ w, id, pos }: { w: World; id: number; pos?: number }) {
  const c = w.clubs[id]
  return (
    <div className="col center grow" style={{ gap: 6 }}>
      <Badge club={c} size={70} />
      <div className="b" style={{ textAlign: 'center' }}>{c.short}</div>
      {pos ? <div className="tiny" style={{ opacity: 0.75 }}>{ordinal(pos)}</div> : null}
    </div>
  )
}

export function FixtureRow({ w, f, clubId }: { w: World; f: Fixture; clubId?: number }) {
  const go = useGame((s) => s.go)
  const comp = w.competitions[f.compId]
  const o = clubId ? outcomeFor(f, clubId) : undefined
  return (
    <button className="li tap fixture-row" style={{ width: '100%' }} onClick={() => f.played ? go({ name: 'fixture', params: { id: f.id } }) : go({ name: 'club', params: { id: clubId && f.home === clubId ? f.away : f.home } })}>
      <div className="col" style={{ width: 44, alignItems: 'center', gap: 2 }}>
        {comp && <CompLogo k={compLogoKey(comp)} size={18} name={comp.name} />}
        <span className="tiny dim">{fmtDate(f.date, 'dm')}</span>
      </div>
      <div className="grow row" style={{ gap: 6, minWidth: 0 }}>
        <span className="grow ellipsis small b" style={{ textAlign: 'right' }}>{w.clubs[f.home]?.short}</span>
        <Badge club={w.clubs[f.home]} size={20} />
        <span className={`score-pill sm ${o || ''}`}>{f.played ? scoreLine(f) : f.time}</span>
        <Badge club={w.clubs[f.away]} size={20} />
        <span className="grow ellipsis small b">{w.clubs[f.away]?.short}</span>
      </div>
    </button>
  )
}

function LineupPitch({ w, lineup, formation, clubId, title }: { w: World; lineup: number[]; formation: string; clubId: number; title: string }) {
  const f = formationOf(formation)
  const club = w.clubs[clubId]
  return (
    <div className="card" style={{ padding: 10 }}>
      <div className="row tight" style={{ marginBottom: 8 }}><Badge club={club} size={20} /><span className="label">{title}</span></div>
      <Pitch formation={f} compact render={(i) => {
        const p = w.players[lineup[i]]
        if (!p) return null
        return (
          <>
            <Face p={p} size={34} radius={17} club={club} />
            <div className="slot-name">{callName(p.name)}</div>
            <div className="slot-sub">{p.ovr}</div>
          </>
        )
      }} />
    </div>
  )
}

// ============================================================================ live match centre
export function LiveMatch() {
  const w = useWorld()
  const live = useGame((s) => s.live)
  const setLive = useGame((s) => s.setLive)
  const finish = useGame((s) => s.finishUserMatch)
  const closeAll = useGame((s) => s.closeAll)
  const open = useGame((s) => s.open)
  const [, force] = useReducer((x: number) => x + 1, 0)
  const [tab, setTab] = useState<'feed' | 'stats' | 'players'>('feed')
  const [manage, setManage] = useState(false)
  const [celebrate, setCelebrate] = useState<MatchEvent>()
  const [reveal, setReveal] = useState<number>(-1)
  const timer = useRef<number>(undefined)
  const seekRef = useRef<'event' | 'ht' | null>(null)

  const sim = live?.sim
  const f = live ? w.fixtures[live.fixtureId] : undefined
  const us: 0 | 1 = f ? userSideOf(w, f) : 0

  const running = !!live?.running && !manage
  const speed = live?.speed || 1

  // main clock: 1 real second per match minute at 1×
  useEffect(() => {
    if (!sim || !running || sim.finished) return
    const interval = seekRef.current ? 40 : 1000 / speed
    timer.current = window.setInterval(() => tick(), interval)
    return () => window.clearInterval(timer.current)
  }, [sim, running, speed, seekRef.current])

  const tick = () => {
    if (!sim || !live) return
    const before = sim.phase
    const evs = sim.step()
    for (const e of evs) {
      if ((e.type === 'goal' || e.type === 'penGoal' || e.type === 'owngoal')) {
        setCelebrate(e)
        haptic('heavy')
        window.setTimeout(() => setCelebrate((c) => (c === e ? undefined : c)), 2400)
      }
    }
    const pauseFor = (why: string) => { live.running = false; seekRef.current = null; void why }
    // user needs to replace an injured player
    if (sim.injuredWaiting.some((x) => x.side === us)) { pauseFor('injury'); setManage(true) }
    if (sim.phase === 'HT' && before !== 'HT') pauseFor('ht')
    if (sim.phase === 'ETHT' && before !== 'ETHT') pauseFor('etht')
    if (sim.phase === 'PENS' && before !== 'PENS') pauseFor('pens')
    if (sim.finished) {
      live.running = false
      seekRef.current = null
      if (sim.pens) setReveal(0)
    }
    if (seekRef.current === 'event' && evs.some((e) => KEY_EVENTS.has(e.type) || e.big)) { seekRef.current = null }
    force()
  }

  // shoot-out reveal, one kick at a time
  const shootout = sim ? sim.events.filter((e) => e.type === 'shootout') : []
  useEffect(() => {
    if (reveal < 0 || reveal >= shootout.length) return
    const t = window.setTimeout(() => { haptic(); setReveal(reveal + 1) }, 1300 / speed)
    return () => window.clearTimeout(t)
  }, [reveal, shootout.length])

  if (!sim || !f || !live) {
    return <Screen title="Match" back onBack={() => closeAll()} noNav><div className="pad muted">No live match.</div></Screen>
  }

  const home = w.clubs[f.home], away = w.clubs[f.away]
  const comp = w.competitions[f.compId]
  const stats = sim.liveStats()
  const agg = sim.ctx.aggregate
  const mom = momentum(sim.events, sim.minute)
  const penDone = !sim.pens || reveal >= shootout.length
  const visibleShoot = sim.pens ? shootout.slice(0, Math.max(0, reveal)) : []
  const penScore: [number, number] = [visibleShoot.filter((e) => e.side === 0 && /scores/.test(e.text)).length, visibleShoot.filter((e) => e.side === 1 && /scores/.test(e.text)).length]
  const hidePens = (e: MatchEvent) => sim.pens && !penDone && (e.type === 'shootout' || (e.type === 'ft'))

  const setRunning = (v: boolean) => { live.running = v; force() }
  const togglePlay = () => {
    haptic()
    if (sim.finished) return
    if (sim.phase === 'HT' || sim.phase === 'ETHT' || sim.phase === 'PENS') { tick(); live.running = true; force(); return }
    setRunning(!live.running)
  }
  const setSpeed = (s: number) => { live.speed = s; force() }
  const nextEvent = () => { haptic(); if (sim.phase === 'HT' || sim.phase === 'ETHT') tick(); seekRef.current = 'event'; live.running = true; force() }
  const toHT = () => {
    haptic()
    // fast-forward to the next break
    let guard = 0
    const stopAt = sim.phase === '1H' || sim.phase === 'pre' ? 'HT' : null
    while (!sim.finished && guard++ < 200) {
      if (sim.injuredWaiting.some((x) => x.side === us)) break
      tick()
      if (stopAt && sim.phase === 'HT') break
      if (!stopAt && (sim.phase === 'ETHT' || sim.phase === 'PENS' || sim.phase === 'FT')) break
    }
    live.running = false
    force()
  }
  const simToEnd = () => {
    haptic('medium')
    sim.ctx.assistantSubs = true
    let guard = 0
    while (!sim.finished && guard++ < 400) {
      if (sim.injuredWaiting.length) sim.autoResolveInjuries()
      sim.step()
    }
    live.running = false
    if (sim.pens) setReveal(shootout.length + 99)
    force()
  }
  const complete = () => {
    haptic('medium')
    const result = sim.result()
    finish(f.id, result)
    setLive(undefined)
    closeAll()
    open({ name: 'postmatch', params: { id: f.id } })
  }

  const feed = sim.events.filter((e) => e.text && !hidePens(e)).slice().reverse()
  const brk = sim.phase === 'HT' || sim.phase === 'ETHT'
  const scoreNow = sim.score

  return (
    <div className="match-screen">
      <div className="match-top">
        <div className="row between" style={{ padding: '0 4px' }}>
          <div className="row tight">{comp && <CompLogo k={compLogoKey(comp)} size={18} name={comp.name} />}<span className="tiny b upper" style={{ opacity: 0.8 }}>{comp?.short} · {f.roundName}</span></div>
          <span className="tiny dim">{sim.ctx.venue}</span>
        </div>
        <div className="scoreboard">
          <div className="sb-team"><Badge club={home} size={48} /><div className="sb-name">{home.short}</div></div>
          <div className="col center" style={{ minWidth: 118 }}>
            <div className="sb-score num"><span key={`h${scoreNow[0]}`} className="pop">{scoreNow[0]}</span><span className="sb-sep">–</span><span key={`a${scoreNow[1]}`} className="pop">{scoreNow[1]}</span></div>
            <div className={`sb-clock ${live.running && !sim.finished ? 'live' : ''}`}>{clock(sim)}</div>
            {sim.pens && reveal >= 0 && <div className="tiny b" style={{ marginTop: 3 }}>Pens {penScore[0]}–{penScore[1]}</div>}
            {agg && <div className="tiny dim" style={{ marginTop: 2 }}>Agg {sim.score[0] + agg[0]}–{sim.score[1] + agg[1]}</div>}
          </div>
          <div className="sb-team"><Badge club={away} size={48} /><div className="sb-name">{away.short}</div></div>
        </div>
        <div className="row between tiny" style={{ padding: '0 6px', minHeight: 16 }}>
          <div className="ellipsis" style={{ maxWidth: '46%' }}>{goalScorers(w, { events: sim.events } as any, 0).join(' · ')}</div>
          <div className="ellipsis" style={{ maxWidth: '46%', textAlign: 'right' }}>{goalScorers(w, { events: sim.events } as any, 1).join(' · ')}</div>
        </div>
        <div className="momentum" title="Momentum">
          <i style={{ left: '50%', width: `${Math.max(0, mom) * 50}%`, background: `var(--home-c)` }} />
          <i style={{ right: '50%', width: `${Math.max(0, -mom) * 50}%`, background: `var(--away-c)` }} />
        </div>
        <MiniTracker sim={sim} />
      </div>

      <Tabs items={[{ id: 'feed', label: 'Commentary' }, { id: 'stats', label: 'Stats' }, { id: 'players', label: 'Ratings' }]} value={tab} onChange={setTab} />

      <div className="match-body">
        {brk && (
          <div className="card pad-card" style={{ margin: '12px 16px 0', textAlign: 'center' }}>
            <div className="kicker">{sim.phase === 'HT' ? 'Half-time' : 'Extra-time break'}</div>
            <div className="muted small" style={{ marginTop: 6 }}>Make changes now — substitutions at the break don't use a window.</div>
          </div>
        )}
        {tab === 'feed' && (
          <div className="feed">
            {feed.map((e, i) => <FeedItem key={sim.events.length - i} e={e} w={w} home={home.id} away={away.id} />)}
            {!feed.length && <div className="muted small" style={{ padding: 20, textAlign: 'center' }}>{sim.ctx.derby ? `${sim.ctx.derby} · ` : ''}{sim.ctx.attendance.toLocaleString()} expected at {sim.ctx.venue}. Press play to kick off.</div>}
          </div>
        )}
        {tab === 'stats' && <StatsPanel stats={stats} homeId={home.id} awayId={away.id} w={w} />}
        {tab === 'players' && <RatingsPanel sim={sim} w={w} />}
      </div>

      <div className="match-controls">
        {sim.finished && penDone ? (
          <button className="btn primary block" style={{ height: 54 }} onClick={complete}><Icon name="check" size={20} /> Full-time · Continue</button>
        ) : (
          <>
            <div className="row" style={{ gap: 8 }}>
              <button className="ctl-btn big" onClick={togglePlay} aria-label={live.running ? 'Pause' : 'Play'} disabled={sim.finished}>
                <Icon name={live.running && !brk ? 'pause' : 'play'} size={26} />
              </button>
              <div className="seg grow" style={{ height: 48 }}>
                {[1, 2, 4].map((s) => <button key={s} className={speed === s ? 'on' : ''} style={{ height: 40 }} onClick={() => setSpeed(s)}>{s}×</button>)}
              </div>
              <button className="ctl-btn manage" onClick={() => { haptic(); setManage(true) }} disabled={sim.finished}>
                <Icon name="tactics" size={22} /><span>Manage</span>
              </button>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn sm grow" onClick={nextEvent} disabled={sim.finished}><Icon name="skip" size={16} /> Next Event</button>
              <button className="btn sm grow" onClick={toHT} disabled={sim.finished}><Icon name="ffwd" size={16} /> {sim.phase === '1H' || sim.phase === 'pre' ? 'To Half-time' : 'Next Break'}</button>
              <button className="btn sm grow" onClick={simToEnd} disabled={sim.finished}><Icon name="whistle" size={16} /> Sim to End</button>
            </div>
          </>
        )}
      </div>

      {celebrate && <GoalFlash e={celebrate} w={w} />}
      <ManageSheet open={manage} onClose={() => { setManage(false); force() }} sim={sim} side={us} w={w} />
    </div>
  )
}

function MiniTracker({ sim }: { sim: MatchSim }) {
  // ball position driven by the latest attacking event and possession side
  const last = [...sim.events].reverse().find((e) => e.side !== -1 && ['goal', 'penGoal', 'chance', 'miss', 'save', 'woodwork', 'corner', 'freekick', 'offside', 'foul'].includes(e.type))
  let x = 50, y = 50
  if (last && sim.minute - last.min <= 2) {
    const deep = ['goal', 'penGoal', 'chance', 'miss', 'save', 'woodwork', 'corner'].includes(last.type)
    x = last.side === 0 ? (deep ? 90 : 72) : (deep ? 10 : 28)
    y = last.type === 'corner' ? (sim.minute % 2 ? 6 : 94) : 30 + ((last.min * 37) % 40)
  } else {
    const t = sim.minute * 13
    x = 35 + ((t * 7) % 30)
    y = 25 + ((t * 11) % 50)
  }
  return (
    <div className="tracker">
      <svg viewBox="0 0 100 50" preserveAspectRatio="none">
        <g fill="none" stroke="rgba(255,255,255,.18)" strokeWidth=".5">
          <rect x="1" y="1" width="98" height="48" rx="1" />
          <line x1="50" y1="1" x2="50" y2="49" />
          <circle cx="50" cy="25" r="7" />
          <rect x="1" y="13" width="13" height="24" /><rect x="86" y="13" width="13" height="24" />
        </g>
      </svg>
      <span className="tracker-ball" style={{ left: `${x}%`, top: `${y}%` }} />
      {last?.type === 'goal' && sim.minute - last.min <= 1 && <span className="tracker-flash" style={{ left: last.side === 0 ? '93%' : '7%' }} />}
    </div>
  )
}

function FeedItem({ e, w, home, away }: { e: MatchEvent; w: World; home: number; away: number }) {
  const [ic, col] = EVENT_ICON[e.type] || ['info', 'var(--t3)']
  const key = e.type === 'goal' || e.type === 'penGoal' || e.type === 'owngoal'
  const big = key || e.type === 'red' || e.type === 'secondYellow' || e.type === 'ht' || e.type === 'ft'
  const club = e.side === 0 ? w.clubs[home] : e.side === 1 ? w.clubs[away] : undefined
  const p = e.player ? w.players[e.player] : undefined
  return (
    <div className={`feed-item ${key ? 'goal' : ''} ${big ? 'big' : ''} fade-up`}>
      <div className="feed-min">{e.type === 'kickoff' || e.type === 'ht' || e.type === 'ft' ? '' : minLabel(e)}</div>
      <div className="feed-ic" style={{ color: col }}><Icon name={ic} size={key ? 20 : 16} /></div>
      <div className="grow" style={{ minWidth: 0 }}>
        {key && <div className="row tight" style={{ marginBottom: 4 }}>{club && <Badge club={club} size={18} />}<span className="display" style={{ fontSize: 18 }}>{e.type === 'owngoal' ? 'Own goal' : 'Goal'}{e.score ? ` · ${e.score[0]}–${e.score[1]}` : ''}</span></div>}
        <div className={key ? 'b' : 'small'} style={{ color: big ? 'var(--t1)' : 'var(--t2)' }}>{e.text}</div>
        {key && p && <div className="tiny dim" style={{ marginTop: 3 }}>{e.player2 && w.players[e.player2] ? `Assist: ${w.players[e.player2].name}` : ''}{e.xg ? `${e.player2 ? ' · ' : ''}xG ${e.xg.toFixed(2)}` : ''}</div>}
      </div>
      {key && p && club && <Face p={p} size={38} radius={10} club={club} />}
    </div>
  )
}

function GoalFlash({ e, w }: { e: MatchEvent; w: World }) {
  const p = e.player ? w.players[e.player] : undefined
  const club = p ? w.clubs[p.clubId] : undefined
  return (
    <div className="goal-flash">
      <div className="goal-flash-inner">
        <div className="goal-word">{e.type === 'owngoal' ? 'OWN GOAL' : 'GOAL!'}</div>
        {p && <div className="row" style={{ gap: 10, justifyContent: 'center', marginTop: 10 }}>{club && <Badge club={club} size={30} />}<span className="h3">{p.name}</span><span className="display" style={{ fontSize: 20, opacity: 0.8 }}>{minLabel(e)}</span></div>}
      </div>
    </div>
  )
}

function StatsPanel({ stats, homeId, awayId, w }: { stats: [TeamMatchStats, TeamMatchStats]; homeId: number; awayId: number; w: World }) {
  const rows: [string, keyof TeamMatchStats, (v: number) => string][] = [
    ['Possession', 'possession', (v) => `${v}%`], ['Expected goals (xG)', 'xg', (v) => v.toFixed(2)], ['Shots', 'shots', String], ['Shots on target', 'sot', String],
    ['Big chances', 'bigChances', String], ['Passes', 'passes', String], ['Pass accuracy', 'passAcc', (v) => `${v}%`], ['Corners', 'corners', String],
    ['Saves', 'saves', String], ['Fouls', 'fouls', String], ['Offsides', 'offsides', String], ['Yellow cards', 'yellows', String], ['Red cards', 'reds', String],
  ]
  return (
    <div className="pad" style={{ paddingTop: 12 }}>
      <div className="row between" style={{ marginBottom: 6 }}><Badge club={w.clubs[homeId]} size={24} /><span className="label">Match stats</span><Badge club={w.clubs[awayId]} size={24} /></div>
      {rows.map(([label, k, fmt]) => {
        const a = stats[0][k] as number, b = stats[1][k] as number
        const t = a + b || 1
        return (
          <div key={k} className="statbar">
            <div className="row between small"><b className="num">{fmt(a)}</b><span className="muted">{label}</span><b className="num">{fmt(b)}</b></div>
            <div className="statbar-track">
              <i style={{ width: `${(a / t) * 100}%`, background: a >= b ? 'var(--home-c)' : 'rgba(255,255,255,.25)' }} />
              <i style={{ width: `${(b / t) * 100}%`, background: b >= a ? 'var(--away-c)' : 'rgba(255,255,255,.25)' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RatingsPanel({ sim, w }: { sim: MatchSim; w: World }) {
  const [side, setSide] = useState<0 | 1>(0)
  const list = sim.liveRatings(side).filter((r) => r.on || w.players[r.id] && (sim.events.some((e) => e.type === 'sub' && (e.player === r.id || e.player2 === r.id))))
  const clubId = side === 0 ? sim.home.clubId : sim.away.clubId
  return (
    <div className="pad" style={{ paddingTop: 12 }}>
      <Seg small items={[{ id: 0, label: sim.home.short }, { id: 1, label: sim.away.short }]} value={side} onChange={(v) => setSide(v as 0 | 1)} />
      <div className="card list" style={{ marginTop: 10 }}>
        {list.sort((a, b) => (b.on ? 1 : 0) - (a.on ? 1 : 0) || a.slot - b.slot).map((r) => {
          const p = w.players[r.id]
          if (!p) return null
          return (
            <div key={r.id} className="li" style={{ opacity: r.on ? 1 : 0.55 }}>
              <PosChip pos={r.pos} />
              <div className="meta">
                <div className="t ellipsis">{p.name} {r.yellow && <span className="card-y" />}{r.red && <span className="card-r" />}{r.injured && <Icon name="injury" size={13} color="var(--neg)" />}</div>
                <div className="row tight" style={{ marginTop: 4 }}><div className="energy"><i style={{ width: `${r.energy}%`, background: r.energy > 70 ? 'var(--pos)' : r.energy > 50 ? 'var(--warn)' : 'var(--neg)' }} /></div><span className="tiny dim">{Math.round(r.energy)}%</span></div>
              </div>
              <RatingBadge v={r.rating} />
            </div>
          )
        })}
      </div>
      <div className="tiny dim" style={{ marginTop: 8 }}>{w.clubs[clubId].short} · {sim.subsLeft(side)} substitutions left</div>
    </div>
  )
}

export function RatingBadge({ v, motm }: { v: number; motm?: boolean }) {
  const c = v >= 8 ? '#18c26b' : v >= 7 ? '#7bd148' : v >= 6 ? '#e6c22e' : v >= 5 ? '#f08c2e' : '#e2414f'
  return <span className="rating-badge num" style={{ background: c }}>{motm && <Icon name="star" size={10} />}{v.toFixed(1)}</span>
}

// ---------------------------------------------------------------------------- manage sheet
function ManageSheet({ open, onClose, sim, side, w }: { open: boolean; onClose: () => void; sim: MatchSim; side: 0 | 1; w: World }) {
  const [tab, setTab] = useState<'subs' | 'tactics' | 'formation'>('subs')
  const [out, setOut] = useState<number>()
  const [, force] = useReducer((x: number) => x + 1, 0)
  const waiting = sim.injuredWaiting.filter((x) => x.side === side).map((x) => x.lp.p.id)
  useEffect(() => { if (open && waiting.length) { setTab('subs'); setOut(waiting[0]) } }, [open, waiting.join(',')])
  const t = sim.sideTactics(side)
  const setT = (p: Partial<TeamTactics>) => { sim.setTactics(side, p); haptic(); force() }
  const ratings = sim.liveRatings(side)
  const onIds = sim.onPitchIds(side)
  const bench = sim.benchIds(side)
  const clubId = side === 0 ? sim.home.clubId : sim.away.clubId
  const club = w.clubs[clubId]
  const r = (id: number) => ratings.find((x) => x.id === id)!
  const outR = out ? r(out) : undefined
  const doSub = (inId: number) => {
    if (!out) return
    const ok = sim.substitute(side, out, inId, waiting.includes(out) ? 'injury' : 'tactical')
    if (ok) { haptic('medium'); setOut(undefined) } else useGame.getState().notify('No substitutions or windows left', 'err')
    force()
  }
  const curForm = formationOf(sim.sideFormation(side))
  return (
    <Sheet open={open} onClose={() => { if (waiting.length && sim.canSub(side) && bench.length) { useGame.getState().notify('Replace the injured player first', 'err'); return } ; if (waiting.length) sim.autoResolveInjuries(); onClose() }} title="Manage Team">
      <Seg items={[{ id: 'subs', label: `Subs (${sim.subsLeft(side)})` }, { id: 'tactics', label: 'Tactics' }, { id: 'formation', label: 'Shape' }]} value={tab} onChange={setTab} />
      {tab === 'subs' && (
        <div style={{ marginTop: 12 }}>
          {waiting.length > 0 && <div className="card pad-card small" style={{ borderColor: 'rgba(255,77,94,.5)', marginBottom: 10 }}><b className="neg">Injury:</b> {waiting.map((id) => w.players[id]?.name).join(', ')} can't continue. Choose a replacement.</div>}
          <div className="label" style={{ marginBottom: 6 }}>{out ? 'Bring on' : 'Take off'}</div>
          {!out ? (
            <div className="card list">
              {onIds.map((id) => {
                const p = w.players[id], x = r(id)
                return (
                  <button key={id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => setOut(id)} disabled={!sim.canSub(side) || !bench.length}>
                    <PosChip pos={x.pos} />
                    <div className="meta"><div className="t ellipsis">{p.name} {x.yellow && <span className="card-y" />}{x.injured && <Icon name="injury" size={13} color="var(--neg)" />}</div>
                      <div className="row tight" style={{ marginTop: 4 }}><div className="energy"><i style={{ width: `${x.energy}%`, background: x.energy > 70 ? 'var(--pos)' : x.energy > 50 ? 'var(--warn)' : 'var(--neg)' }} /></div><span className="tiny dim">{Math.round(x.energy)}%</span></div></div>
                    <RatingBadge v={x.rating} />
                  </button>
                )
              })}
            </div>
          ) : (
            <>
              <div className="card pad-card row" style={{ gap: 10, marginBottom: 8 }}>
                <Icon name="arrowDown" size={18} color="var(--neg)" />
                <div className="grow"><b>{w.players[out].name}</b> <span className="tiny dim">{outR?.pos} · {Math.round(outR?.energy || 0)}%</span></div>
                {!waiting.includes(out) && <button className="btn xs" onClick={() => setOut(undefined)}>Change</button>}
              </div>
              <div className="card list">
                {[...bench].sort((a, b) => (outR ? posRating(w.players[b], outR.pos) - posRating(w.players[a], outR.pos) : 0)).map((id) => {
                  const p = w.players[id]
                  const fit = outR ? posRating(p, outR.pos) : p.ovr
                  return (
                    <button key={id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => doSub(id)}>
                      <Face p={p} size={36} radius={9} club={club} />
                      <div className="meta"><div className="t ellipsis">{p.name}</div><div className="s">{p.positions.join(' / ')} · {Math.round(p.fitness)}% energy</div></div>
                      <div className="col" style={{ alignItems: 'flex-end' }}><Ovr v={fit} size="sm" /><span className="tiny dim">at {outR?.pos}</span></div>
                    </button>
                  )
                })}
                {!bench.length && <div className="li muted small">No substitutes available.</div>}
              </div>
            </>
          )}
          {!sim.canSub(side) && <div className="tiny warn" style={{ marginTop: 8 }}>All substitution windows used.</div>}
        </div>
      )}
      {tab === 'tactics' && (
        <div className="stack" style={{ marginTop: 12, gap: 14 }}>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Mentality</div>
            <div className="mentality">
              {MENTALITIES.map((m, i) => <button key={m} className={t.mentality === m ? 'on' : ''} onClick={() => setT({ mentality: m })}><span className="display">{['UD', 'D', 'B', 'A', 'UA'][i]}</span><span className="tiny">{m.replace('Ultra ', 'Ultra ')}</span></button>)}
            </div>
          </div>
          <div><div className="label" style={{ marginBottom: 6 }}>Defensive approach</div><Seg small items={(['Deep', 'Balanced', 'High', 'Aggressive'] as const).map((x) => ({ id: x, label: x }))} value={t.defApproach} onChange={(v) => setT({ defApproach: v, lineHeight: v === 'Deep' ? 30 : v === 'Balanced' ? 50 : v === 'High' ? 68 : 75, pressing: v === 'Deep' ? 30 : v === 'Balanced' ? 50 : v === 'High' ? 68 : 85 })} /></div>
          <div><div className="label" style={{ marginBottom: 6 }}>Build-up play</div><Seg small items={(['Balanced', 'Short Passing', 'Counter', 'Long Ball'] as const).map((x) => ({ id: x, label: x.replace(' Passing', '') }))} value={t.buildUp} onChange={(v) => setT({ buildUp: v })} /></div>
          <div><div className="label" style={{ marginBottom: 6 }}>Chance creation</div><Seg small items={(['Balanced', 'Possession', 'Direct Passing', 'Forward Runs'] as const).map((x) => ({ id: x, label: x.replace(' Passing', '').replace('Forward ', '') }))} value={t.chanceCreation} onChange={(v) => setT({ chanceCreation: v })} /></div>
          <div className="row" style={{ gap: 8 }}>
            <button className={`chip ${t.timeWasting ? 'on' : ''}`} onClick={() => setT({ timeWasting: !t.timeWasting })}><Icon name="clock" size={14} /> Time wasting</button>
            <button className={`chip ${t.offsideTrap ? 'on' : ''}`} onClick={() => setT({ offsideTrap: !t.offsideTrap })}><Icon name="flag" size={14} /> Offside trap</button>
          </div>
          <div className="tiny dim">Changes take effect immediately and alter every remaining minute of the simulation.</div>
        </div>
      )}
      {tab === 'formation' && (
        <div style={{ marginTop: 12 }}>
          <div className="label" style={{ marginBottom: 6 }}>Current: {curForm.name}</div>
          <div className="row wrap" style={{ gap: 7 }}>
            {FORMATIONS.map((fm) => (
              <button key={fm.id} className={`chip ${fm.id === curForm.id ? 'on' : ''}`} onClick={() => {
                const players = onIds.map((id) => w.players[id]).filter(Boolean)
                sim.setFormation(side, fm.id, assignToFormation(players, fm.id))
                haptic('medium'); force()
              }}>{fm.name}</button>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <Pitch formation={curForm} compact render={(i) => {
              const id = onIds[i]
              const p = w.players[id]
              if (!p) return null
              return <><Face p={p} size={30} radius={15} club={club} /><div className="slot-name">{callName(p.name)}</div></>
            }} />
          </div>
        </div>
      )}
    </Sheet>
  )
}

/** Best assignment of the players on the pitch to the slots of a new formation. */
export function assignToFormation(players: Player[], formationId: string): number[] {
  const f = formationOf(formationId)
  const left = [...players]
  const out: number[] = new Array(f.slots.length).fill(0)
  const order = f.slots.map((_, i) => i).sort((a, b) => (f.slots[a].pos === 'GK' ? -1 : 0) - (f.slots[b].pos === 'GK' ? -1 : 0))
  for (const i of order) {
    let best = -1, bs = -1e9
    left.forEach((p, k) => {
      if ((f.slots[i].pos === 'GK') !== (p.positions[0] === 'GK') && left.some((q) => (f.slots[i].pos === 'GK') === (q.positions[0] === 'GK'))) return
      const s = posRating(p, f.slots[i].pos)
      if (s > bs) { bs = s; best = k }
    })
    if (best >= 0) { out[i] = left[best].id; left.splice(best, 1) }
  }
  return out.filter(Boolean)
}

// ============================================================================ post-match & match report
export function PostMatch({ params }: { params: { id: string } }) {
  const w = useWorld()
  const closeAll = useGame((s) => s.closeAll)
  const open = useGame((s) => s.open)
  const f = w.fixtures[params.id]
  const others = useMemo(() => f ? Object.values(w.fixtures).filter((x) => x.date === f.date && x.compId === f.compId && x.id !== f.id && x.played) : [], [params.id, w.date])
  if (!f?.result) return <Screen title="Result" back onBack={closeAll} noNav><div className="pad muted">Result not available.</div></Screen>
  const press = !w.flags.pressDone?.[`post:${f.id}`]
  return (
    <Screen title="Full-time" back onBack={closeAll} noNav>
      <MatchReportBody w={w} f={f} />
      {others.length > 0 && (
        <>
          <div className="section-title"><div className="h3">Other results</div></div>
          <div className="pad"><div className="card list">{others.map((x) => <FixtureRow key={x.id} w={w} f={x} />)}</div></div>
        </>
      )}
      <div className="pad stack" style={{ marginTop: 16 }}>
        {press && <button className="btn block" onClick={() => open({ name: 'press', params: { kind: 'post', fixtureId: f.id } })}><Icon name="chat" size={18} /> Post-match Press Conference</button>}
        <button className="btn primary block" onClick={() => closeAll()}><Icon name="check" size={18} /> Continue</button>
      </div>
    </Screen>
  )
}

export function FixtureReport({ params }: { params: { id: string } }) {
  const w = useWorld()
  const f = w.fixtures[params.id]
  const comp = f ? w.competitions[f.compId] : undefined
  return (
    <Screen title="Match Report" sub={comp ? `${comp.short} · ${f.roundName}` : ''} back>
      {f?.result ? <MatchReportBody w={w} f={f} /> : <div className="pad muted">This match hasn't been played yet.</div>}
    </Screen>
  )
}

function MatchReportBody({ w, f }: { w: World; f: Fixture }) {
  const go = useGame((s) => s.go)
  const [tab, setTab] = useState<'summary' | 'stats' | 'ratings'>('summary')
  const r = f.result!
  const home = w.clubs[f.home], away = w.clubs[f.away]
  const comp = w.competitions[f.compId]
  const motm = r.motm ? w.players[r.motm] : undefined
  const motmStat = r.players.find((x) => x.id === r.motm)
  const keyEv = r.events.filter((e) => ['goal', 'penGoal', 'owngoal', 'penMiss', 'red', 'secondYellow', 'yellow', 'sub', 'injury'].includes(e.type))
  return (
    <>
      <div className="pad">
        <div className="hero" style={{ padding: 16 }}>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div className="row tight" style={{ justifyContent: 'center' }}>{comp && <CompLogo k={compLogoKey(comp)} size={22} name={comp.name} />}<span className="label" style={{ color: 'rgba(255,255,255,.85)' }}>{comp?.short} · {f.roundName}</span></div>
            <div className="row" style={{ marginTop: 12 }}>
              <div className="col center grow" style={{ gap: 6 }}><Badge club={home} size={58} /><b>{home.short}</b></div>
              <div className="col center" style={{ minWidth: 100 }}>
                <div className="display num" style={{ fontSize: 48 }}>{r.score[0]}–{r.score[1]}</div>
                <div className="tiny" style={{ opacity: 0.8 }}>{r.pens ? `${r.pens[0]}–${r.pens[1]} on penalties` : r.et ? 'After extra time' : `HT ${r.ht[0]}–${r.ht[1]}`}</div>
              </div>
              <div className="col center grow" style={{ gap: 6 }}><Badge club={away} size={58} /><b>{away.short}</b></div>
            </div>
            <div className="row between tiny" style={{ marginTop: 10, opacity: 0.85, alignItems: 'flex-start' }}>
              <div style={{ maxWidth: '48%' }}>{goalScorers(w, r, 0).map((s) => <div key={s}>{s}</div>)}</div>
              <div style={{ maxWidth: '48%', textAlign: 'right' }}>{goalScorers(w, r, 1).map((s) => <div key={s}>{s}</div>)}</div>
            </div>
            <div className="tiny" style={{ textAlign: 'center', marginTop: 10, opacity: 0.7 }}>{f.venue || (f.neutral ? 'Neutral venue' : home.stadium)} · Att. {r.attendance.toLocaleString()} · {fmtDate(f.date, 'long')}</div>
          </div>
        </div>
      </div>
      {motm && (
        <div className="pad" style={{ marginTop: 10 }}>
          <button className="card tap row" style={{ padding: 12, gap: 12, width: '100%', textAlign: 'left' }} onClick={() => go({ name: 'player', params: { id: motm.id } })}>
            <Face p={motm} size={48} radius={12} club={w.clubs[motm.clubId]} />
            <div className="grow"><div className="kicker gold">Player of the Match</div><div className="b" style={{ marginTop: 2 }}>{motm.name}</div><div className="tiny dim">{motmStat ? `${motmStat.goals ? `${motmStat.goals} goal${motmStat.goals > 1 ? 's' : ''} · ` : ''}${motmStat.assists ? `${motmStat.assists} assist${motmStat.assists > 1 ? 's' : ''} · ` : ''}${motmStat.mins}'` : ''}</div></div>
            {motmStat && <RatingBadge v={motmStat.rating} motm />}
          </button>
        </div>
      )}
      <div style={{ marginTop: 12 }}><Tabs items={[{ id: 'summary', label: 'Summary' }, { id: 'stats', label: 'Stats' }, { id: 'ratings', label: 'Ratings' }]} value={tab} onChange={setTab} /></div>
      {tab === 'summary' && (
        <div className="pad" style={{ marginTop: 10 }}>
          <div className="card list">
            {keyEv.length === 0 && <div className="li muted small">No key events.</div>}
            {keyEv.map((e, i) => {
              const [ic, col] = EVENT_ICON[e.type] || ['info', 'var(--t3)']
              const p = e.player ? w.players[e.player] : undefined
              const p2 = e.player2 ? w.players[e.player2] : undefined
              const left = e.side === 0
              const label = e.type === 'sub' ? `${p?.name} ↔ ${p2?.name}` : `${p?.name || ''}${e.type === 'penGoal' ? ' (pen)' : e.type === 'owngoal' ? ' (OG)' : ''}${(e.type === 'goal') && p2 ? ` · ${callName(p2.name)}` : ''}`
              return (
                <div key={i} className="li" style={{ minHeight: 42, flexDirection: left ? 'row' : 'row-reverse', textAlign: left ? 'left' : 'right' }}>
                  <span className="tiny b dim" style={{ width: 34 }}>{minLabel(e)}</span>
                  <Icon name={ic} size={16} color={col} />
                  <span className="grow small ellipsis">{label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {tab === 'stats' && <StatsPanel stats={r.stats} homeId={home.id} awayId={away.id} w={w} />}
      {tab === 'ratings' && (
        <div className="pad" style={{ marginTop: 10 }}>
          {[0, 1].map((side) => (
            <div key={side} className="card list" style={{ marginBottom: 10 }}>
              <div className="card-h"><div className="row tight"><Badge club={side === 0 ? home : away} size={20} /><span className="label">{(side === 0 ? home : away).short}</span></div></div>
              {r.players.filter((x) => x.side === side).sort((a, b) => (b.started ? 1 : 0) - (a.started ? 1 : 0) || b.rating - a.rating).map((x) => {
                const p = w.players[x.id]
                if (!p) return null
                return (
                  <button key={x.id} className="li tap" style={{ width: '100%', textAlign: 'left', minHeight: 48 }} onClick={() => go({ name: 'player', params: { id: p.id } })}>
                    <PosChip pos={x.pos} />
                    <div className="meta"><div className="t small ellipsis">{p.name}{!x.started && <span className="tiny dim"> · sub {x.subOn}'</span>}</div>
                      <div className="s">{x.goals ? `${x.goals} goal${x.goals > 1 ? 's' : ''} · ` : ''}{x.assists ? `${x.assists} assist${x.assists > 1 ? 's' : ''} · ` : ''}{x.shots} shots · {x.passesCompleted}/{x.passes} passes{x.saves ? ` · ${x.saves} saves` : ''}</div></div>
                    <RatingBadge v={x.rating} motm={x.id === r.motm} />
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
