import { useMemo, useState } from 'react'
import { Fx } from '../components/Fx'
import { useGame, useWorld, haptic } from '../../store/game'
import type { ContractOffer, Player, Position, SquadRole, TransferOffer, World } from '../../domain/types'
import { Icon } from '../icons/Icon'
import { Badge, CountUp, Empty, Face, Flag, Ovr, PosChip, Stars } from '../components/atoms'
import { Chips, HubActions, Screen, Seg, Sheet, Stepper, Tabs } from '../components/layout'
import { fmtMoney, roundValue } from '../../domain/finance'
import { addDays, diffDays, fmtDate } from '../../domain/dates'
import { POS_GROUP, SQUAD_ROLES } from '../../domain/constants'
import { allPlayers, rosterOf } from '../../engine/world/roster'
import { knowledge, matchesPosition, potRange, scoutNetwork } from '../../engine/world/scouting'
import { askingPrice, contractDemand, playerInterest, roleForBuyer, sellerStance, yearsLeft } from '../../engine/world/transfers'
import { acceptCounter, delegateTransfer, proposeContract, renewalDemand, renewContract, submitBid, wageRoom, windowLabel } from '../../engine/world/userActions'
import { currentWindow } from '../../engine/competitions/calendar'
import { ageOf, userClub } from '../selectors'
import { Portrait, seededAvatar } from '../components/Portrait'

// ============================================================================ hub
export function TransferHub() {
  const w = useWorld()
  const go = useGame((s) => s.go)
  const open = useGame((s) => s.open)
  const [tab, setTab] = useState<'hub' | 'shortlist' | 'deals'>('hub')
  const club = userClub(w)
  if (w.flags.unemployed) return <Screen title="Transfers" right={<HubActions />}><Empty icon="transfers" title="No club" text="You need a club to do business." /></Screen>
  const win = currentWindow(w)
  const offers = Object.values(w.transfers.offers)
  const outgoing = offers.filter((o) => o.userIsBuyer && !['Completed', 'Negotiations Failed'].includes(o.status))
  const incoming = offers.filter((o) => o.userIsSeller && ['Offer Submitted', 'Counter Offer', 'Awaiting Window'].includes(o.status))
  const deadline = win && diffDays(win.close, w.date) === 0
  return (
    <Screen title="Transfers" sub={windowLabel(w)} right={<HubActions />}>
      <div className="pad">
        <div className={`hero budget-hero ${deadline ? 'deadline' : ''}`}>
          <Fx kind="mesh" />
          <div style={{ position: 'relative', zIndex: 1, padding: 16 }}>
            {deadline && <div className="deadline-banner"><Icon name="deadline" size={16} /> DEADLINE DAY · window closes tonight</div>}
            <div className="row between" style={{ alignItems: 'flex-end' }}>
              <div><div className="label" style={{ color: 'rgba(255,255,255,.75)' }}>Transfer budget</div><div className="display" style={{ fontSize: 34, marginTop: 4 }}><CountUp value={club.finance.transferBudget} format={(v) => fmtMoney(v)} /></div></div>
              <div style={{ textAlign: 'right' }}><div className="label" style={{ color: 'rgba(255,255,255,.75)' }}>Wage room</div><div className="display" style={{ fontSize: 22, marginTop: 4 }}>{fmtMoney(Math.max(0, wageRoom(w)))}<span className="tiny">/wk</span></div></div>
            </div>
            <div className="row tight tiny" style={{ marginTop: 10, opacity: 0.85 }}><Icon name={win ? 'transfers' : 'lock'} size={14} />{win ? `${win.name} window · ${diffDays(win.close, w.date)} days left` : 'Window closed — deals agreed now complete when it reopens'}</div>
          </div>
        </div>
        <div className="grid3" style={{ marginTop: 10 }}>
          <button className="card tap mini-btn" onClick={() => go({ name: 'search' })}><Icon name="search" size={22} color="var(--club2)" /><span>Search</span></button>
          <button className="card tap mini-btn" onClick={() => go({ name: 'scouting' })}><Icon name="scout" size={22} color="var(--club2)" /><span>Scouting</span></button>
          <button className="card tap mini-btn" onClick={() => go({ name: 'transferHistory' })}><Icon name="history" size={22} color="var(--club2)" /><span>History</span></button>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <Tabs items={[{ id: 'hub', label: 'Transfer Hub', badge: incoming.filter((o) => o.status !== 'Awaiting Window').length }, { id: 'shortlist', label: `Shortlist (${w.transfers.shortlist.length})` }, { id: 'deals', label: 'Done Deals' }]} value={tab} onChange={setTab} />
      </div>
      {tab === 'hub' && (
        <div className="pad stack" style={{ marginTop: 12 }}>
          {win && diffDays(win.close, w.date) <= 1 && <DeadlineTicker w={w} />}
          {incoming.length > 0 && <>
            <div className="label">Offers for your players</div>
            <div className="card list">
              {incoming.map((o) => <OfferRow key={o.id} w={w} o={o} incoming onClick={() => o.status === 'Awaiting Window' ? go({ name: 'player', params: { id: o.playerId } }) : open({ name: 'sellNegotiation', params: { offerId: o.id } })} />)}
            </div>
          </>}
          <div className="label">Your targets</div>
          {!outgoing.length && !Object.values(w.transfers.targets).some((t) => t.status === 'Scouting' || t.status === 'Club Approached') ? (
            <div className="card"><Empty icon="handshake" title="No active negotiations" text="Search the market or use your scouting network to find targets." action={<button className="btn club sm" onClick={() => go({ name: 'search' })}>Search players</button>} /></div>
          ) : (
            <div className="card list">
              {outgoing.map((o) => <OfferRow key={o.id} w={w} o={o} onClick={() => open({ name: 'negotiation', params: { playerId: o.playerId, offerId: o.id, stage: o.status === 'Offer Accepted' ? 'contract' : undefined } })} />)}
              {Object.values(w.transfers.targets).filter((t) => (t.status === 'Scouting' || t.status === 'Club Approached') && !outgoing.some((o) => o.playerId === t.playerId)).map((t) => {
                const p = w.players[t.playerId]
                if (!p) return null
                return <PlayerLine key={t.playerId} w={w} p={p} sub={t.status} />
              })}
            </div>
          )}
          <SquadSales w={w} />
        </div>
      )}
      {tab === 'shortlist' && (
        <div className="pad" style={{ marginTop: 12 }}>
          {!w.transfers.shortlist.length ? <Empty icon="shortlist" title="Shortlist is empty" text="Tap the star on any player profile to track him here." /> : (
            <div className="card list">{w.transfers.shortlist.map((id) => w.players[id] && <PlayerLine key={id} w={w} p={w.players[id]} />)}</div>
          )}
        </div>
      )}
      {tab === 'deals' && <DoneDeals w={w} mine />}
    </Screen>
  )
}

function DeadlineTicker({ w }: { w: World }) {
  const go = useGame((s) => s.go)
  const deals = w.transfers.history.filter((h) => h.date >= addDays(w.date, -1) && (h.type === 'transfer' || h.type === 'loan' || h.type === 'free')).slice(0, 12)
  return (
    <div className="card deadline-card">
      <div className="card-h"><div className="row tight"><span className="live-dot" /><span className="label" style={{ color: '#ff8a95' }}>Deadline Day Live</span></div><span className="tiny dim">{deals.length} deals</span></div>
      <div className="list">
        {!deals.length && <div className="li muted small">Phones are ringing across Europe. Deals will appear here as they're confirmed.</div>}
        {deals.map((h, i) => (
          <button key={i} className="li tap" style={{ width: '100%', textAlign: 'left', minHeight: 48 }} onClick={() => w.players[h.playerId] && go({ name: 'player', params: { id: h.playerId } })}>
            <Badge club={w.clubs[h.to]} size={26} />
            <div className="meta"><div className="t small ellipsis">{h.playerName}</div><div className="s row tight">{w.clubs[h.from]?.short || 'Free agent'} <Icon name="forward" size={11} /> {w.clubs[h.to]?.short}</div></div>
            <b className="small">{h.type === 'loan' ? 'Loan' : h.type === 'free' ? 'Free' : fmtMoney(h.fee, { short: true })}</b>
          </button>
        ))}
      </div>
    </div>
  )
}

function SquadSales({ w }: { w: World }) {
  const listed = rosterOf(w, w.userClubId).filter((p) => p.transferListed || p.loanListed)
  if (!listed.length) return null
  return (
    <>
      <div className="label">Listed players</div>
      <div className="card list">{listed.map((p) => <PlayerLine key={p.id} w={w} p={p} sub={p.transferListed ? `Transfer listed · value ${fmtMoney(p.value, { short: true })}` : 'Loan listed'} />)}</div>
    </>
  )
}

function OfferRow({ w, o, incoming, onClick }: { w: World; o: TransferOffer; incoming?: boolean; onClick: () => void }) {
  const p = w.players[o.playerId]
  if (!p) return null
  const other = w.clubs[incoming ? o.fromClubId : o.toClubId]
  const color = o.status === 'Offer Accepted' || o.status === 'Pre-Contract' || o.status === 'Awaiting Window' ? 'var(--pos)' : o.status === 'Counter Offer' ? 'var(--warn)' : o.status === 'Offer Rejected' ? 'var(--neg)' : 'var(--info)'
  return (
    <button className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => { haptic(); onClick() }}>
      <Face p={p} size={42} radius={10} club={w.clubs[p.clubId]} />
      <div className="meta">
        <div className="t small ellipsis">{p.name}</div>
        <div className="s row tight">{other && <Badge club={other} size={14} />}{incoming ? `${other?.short} bid` : other?.short || 'Free agent'} · {o.type.startsWith('loan') ? 'Loan' : fmtMoney(o.counterFee && o.status === 'Counter Offer' ? o.counterFee : o.fee, { short: true })}</div>
      </div>
      <span className="pill" style={{ background: 'rgba(255,255,255,.06)', color }}>{o.status}</span>
    </button>
  )
}

export function PlayerLine({ w, p, sub, right }: { w: World; p: Player; sub?: string; right?: React.ReactNode }) {
  const go = useGame((s) => s.go)
  const [lo, hi] = potRange(w, p)
  return (
    <button className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => { haptic(); go({ name: 'player', params: { id: p.id } }) }}>
      <Face p={p} size={42} radius={10} club={w.clubs[p.clubId]} />
      <div className="meta">
        <div className="t small ellipsis">{p.name}</div>
        <div className="s row tight">{w.clubs[p.clubId] ? <><Badge club={w.clubs[p.clubId]} size={14} />{w.clubs[p.clubId].short}</> : 'Free agent'} · {ageOf(w, p)} · {sub || fmtMoney(p.value, { short: true })}</div>
      </div>
      {right ?? <>
        <PosChip pos={p.positions[0]} />
        <div className="col" style={{ alignItems: 'center' }}><Ovr v={p.ovr} size="sm" /><span className="tiny dim num">{p.clubId === w.userClubId ? p.pot : lo === hi ? lo : `${lo}-${hi}`}</span></div>
      </>}
    </button>
  )
}

function DoneDeals({ w, mine }: { w: World; mine?: boolean }) {
  const go = useGame((s) => s.go)
  const [f, setF] = useState<'mine' | 'all' | 'big'>(mine ? 'mine' : 'all')
  const list = w.transfers.history.filter((h) => h.season === w.season && (f === 'all' ? true : f === 'mine' ? h.from === w.userClubId || h.to === w.userClubId : h.fee >= 20e6)).slice(0, 150)
  return (
    <div className="pad" style={{ marginTop: 12 }}>
      <Seg small items={[{ id: 'mine', label: 'My club' }, { id: 'big', label: '€20M+' }, { id: 'all', label: 'All' }]} value={f} onChange={setF} />
      {!list.length && <Empty icon="history" title="No transfers yet" />}
      <div className="card list" style={{ marginTop: 10 }}>
        {list.map((h, i) => {
          const p = w.players[h.playerId]
          return (
            <button key={i} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => p && go({ name: 'player', params: { id: h.playerId } })}>
              {p ? <Face p={p} size={38} radius={10} club={w.clubs[h.to]} /> : <div style={{ width: 38 }} />}
              <div className="meta">
                <div className="t small ellipsis">{h.playerName}</div>
                <div className="s row tight"><Badge club={w.clubs[h.from]} size={14} /><Icon name="forward" size={12} color="var(--t3)" /><Badge club={w.clubs[h.to]} size={14} />{w.clubs[h.to]?.short || 'Released'} · {fmtDate(h.date, 'dm')}</div>
              </div>
              <span className="b small">{h.type === 'loan' ? 'Loan' : h.type === 'free' ? 'Free' : h.type === 'loan-return' ? 'Loan end' : h.type === 'release' ? 'Released' : h.type === 'retire' ? 'Retired' : fmtMoney(h.fee, { short: true })}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function TransferHistory() {
  const w = useWorld()
  return <Screen title="Transfer History" sub="This season" back><DoneDeals w={w} /></Screen>
}

// ============================================================================ search
interface Filters { q: string; pos: string; ageMin: number; ageMax: number; ovrMin: number; potMin: number; valueMax: number; league: string; nation: string; special: 'all' | 'free' | 'expiring' | 'listed' | 'loan' }
const DEF: Filters = { q: '', pos: 'Any', ageMin: 16, ageMax: 40, ovrMin: 60, potMin: 0, valueMax: 0, league: 'Any', nation: 'Any', special: 'all' }
const POS_OPTS = ['Any', 'GK', 'CB', 'FB', 'CDM', 'CM', 'CAM', 'W', 'ST', 'DEF', 'MID', 'ATT']

export function Search() {
  const w = useWorld()
  const [f, setF] = useState<Filters>(() => ({ ...DEF, ...(w.flags.searchFilters || {}) }))
  const [open, setOpen] = useState(false)
  const [sort, setSort] = useState<'ovr' | 'pot' | 'value' | 'age'>('ovr')
  const set = (p: Partial<Filters>) => { const n = { ...f, ...p }; setF(n); w.flags.searchFilters = n }
  const results = useMemo(() => {
    const q = f.q.trim().toLowerCase()
    const out: Player[] = []
    for (const p of allPlayers(w)) {
      if (p.clubId === w.userClubId || p.academy || p.retiringAtSeasonEnd && ageOf(w, p) >= 36) continue
      if (q && !p.name.toLowerCase().includes(q) && !p.fullName.toLowerCase().includes(q)) continue
      if (!q) {
        if (p.ovr < f.ovrMin) continue
        const age = ageOf(w, p)
        if (age < f.ageMin || age > f.ageMax) continue
        if (f.pos !== 'Any' && !matchesPosition(p, f.pos)) continue
        if (f.valueMax && p.value > f.valueMax) continue
        if (f.potMin && potRange(w, p)[1] < f.potMin) continue
        if (f.league !== 'Any' && String(w.clubs[p.clubId]?.leagueId) !== f.league) continue
        if (f.nation !== 'Any' && p.nation !== f.nation) continue
        if (f.special === 'free' && p.clubId) continue
        if (f.special === 'expiring' && (!p.clubId || yearsLeft(w, p) > 1)) continue
        if (f.special === 'listed' && !p.transferListed) continue
        if (f.special === 'loan' && !p.loanListed) continue
      }
      out.push(p)
    }
    const key = (p: Player) => sort === 'ovr' ? p.ovr : sort === 'pot' ? potRange(w, p)[1] : sort === 'value' ? p.value : -ageOf(w, p)
    return out.sort((a, b) => key(b) - key(a)).slice(0, 120)
  }, [f, sort, w.date, useGame.getState().v])
  const leagues = Object.values(w.leagues).sort((a, b) => b.prestige - a.prestige || a.level - b.level)
  const nations = useMemo(() => Object.keys(w.nations).sort(), [])
  return (
    <Screen title="Player Search" back right={<button className="iconbtn" onClick={() => setOpen(true)} aria-label="Filters"><Icon name="filter" size={20} /></button>}>
      <div className="pad">
        <div className="search-box"><Icon name="search" size={18} color="var(--t3)" /><input placeholder="Search by name" value={f.q} onChange={(e) => set({ q: e.target.value })} /></div>
      </div>
      <Chips items={[{ id: 'all', label: 'All players' }, { id: 'free', label: 'Free agents' }, { id: 'expiring', label: 'Expiring' }, { id: 'listed', label: 'Transfer listed' }, { id: 'loan', label: 'Loan listed' }]} value={f.special} onChange={(v) => set({ special: v as Filters['special'] })} />
      <div className="chips" style={{ marginTop: 6 }}>{POS_OPTS.map((p) => <button key={p} className={`chip ${f.pos === p ? 'on' : ''}`} style={{ height: 26 }} onClick={() => set({ pos: p })}>{p}</button>)}</div>
      <div className="pad row between" style={{ marginTop: 10 }}>
        <span className="tiny dim">{results.length >= 120 ? '120+ results' : `${results.length} results`} · OVR {f.ovrMin}+ · Age {f.ageMin}–{f.ageMax}{f.valueMax ? ` · ≤ ${fmtMoney(f.valueMax, { short: true })}` : ''}</span>
        <div className="seg" style={{ width: 180 }}>{(['ovr', 'pot', 'value', 'age'] as const).map((s) => <button key={s} className={sort === s ? 'on' : ''} style={{ height: 26, fontSize: 11 }} onClick={() => setSort(s)}>{s.toUpperCase()}</button>)}</div>
      </div>
      <div className="pad" style={{ marginTop: 8 }}>
        {!results.length ? <Empty icon="search" title="No players match" text="Loosen your filters." /> : <div className="card list">{results.map((p) => <PlayerLine key={p.id} w={w} p={p} />)}</div>}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Filters">
        <div className="stack" style={{ gap: 14 }}>
          <div><div className="label" style={{ marginBottom: 6 }}>Minimum OVR · {f.ovrMin}</div><input type="range" min={40} max={90} value={f.ovrMin} style={{ ['--p' as any]: `${((f.ovrMin - 40) / 50) * 100}%` }} onChange={(e) => set({ ovrMin: Number(e.target.value) })} /></div>
          <div><div className="label" style={{ marginBottom: 6 }}>Minimum potential · {f.potMin || 'Any'}</div><input type="range" min={0} max={95} value={f.potMin} style={{ ['--p' as any]: `${(f.potMin / 95) * 100}%` }} onChange={(e) => set({ potMin: Number(e.target.value) })} /></div>
          <div className="row">
            <div className="grow"><div className="label" style={{ marginBottom: 6 }}>Min age</div><Stepper value={f.ageMin} min={15} max={f.ageMax} onChange={(v) => set({ ageMin: v })} /></div>
            <div className="grow"><div className="label" style={{ marginBottom: 6 }}>Max age</div><Stepper value={f.ageMax} min={f.ageMin} max={45} onChange={(v) => set({ ageMax: v })} /></div>
          </div>
          <div><div className="label" style={{ marginBottom: 6 }}>Max value</div><div className="row wrap" style={{ gap: 6 }}>{[0, 1e6, 5e6, 10e6, 25e6, 50e6, 100e6].map((v) => <button key={v} className={`chip ${f.valueMax === v ? 'on' : ''}`} onClick={() => set({ valueMax: v })}>{v ? fmtMoney(v, { short: true }) : 'Any'}</button>)}</div></div>
          <div className="field"><label className="label">League</label><select className="input" value={f.league} onChange={(e) => set({ league: e.target.value })}><option value="Any">Any league</option>{leagues.map((l) => <option key={l.id} value={String(l.id)}>{l.name} ({l.country})</option>)}<option value="0">Rest of world</option></select></div>
          <div className="field"><label className="label">Nationality</label><select className="input" value={f.nation} onChange={(e) => set({ nation: e.target.value })}><option value="Any">Any nation</option>{nations.map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
          <div className="row"><button className="btn grow" onClick={() => set({ ...DEF })}>Reset</button><button className="btn primary grow" onClick={() => setOpen(false)}>Show results</button></div>
        </div>
      </Sheet>
    </Screen>
  )
}

// ============================================================================ scouting (Global Transfer Network)
const REGIONS = ['Anywhere', 'England', 'Spain', 'Germany', 'Italy', 'France', 'Portugal', 'Netherlands', 'Belgium', 'Brazil', 'Argentina', 'Scandinavia', 'Eastern Europe', 'Africa', 'South America', 'Rest of World']
const FOCUS = ['Balanced', 'High Potential', 'Ready Now', 'Bargain']

export function Scouting() {
  const w = useWorld()
  const mutate = useGame((s) => s.mutate)
  const notify = useGame((s) => s.notify)
  const [assign, setAssign] = useState<number>()
  const [hire, setHire] = useState(false)
  const [cfg, setCfg] = useState({ region: 'Anywhere', position: 'Any', ageMax: 23, focus: 'High Potential', months: 2 })
  return (
    <Screen title="Scouting Network" sub="Global Transfer Network" back>
      <div className="pad stack">
        <div className="art-banner">
          <Fx kind="radar" />
          <div className="content"><div className="kicker">Global Transfer Network</div><div className="h2" style={{ marginTop: 6 }}>{w.scouts.length} scout{w.scouts.length === 1 ? '' : 's'} active</div><div className="small muted" style={{ marginTop: 4, maxWidth: 230 }}>{w.scouts.filter((s) => s.assignment).length} on assignment · {Object.keys(w.transfers.knowledge).length} players known</div></div>
        </div>
        <div className="card pad-card small muted">Assign scouts to search a region for a type of player. Reports reveal attributes, PlayStyles and a narrowed potential range. Knowledge grows faster with experienced scouts; judgement improves how accurately they spot potential.</div>
        {w.scouts.map((s) => {
          const a = s.assignment
          const found = a?.foundIds.map((id) => w.players[id]).filter(Boolean) || []
          return (
            <div key={s.id} className="card">
              <div className="row" style={{ padding: 12, gap: 12 }}>
                <Portrait cfg={{ ...seededAvatar(s.faceSeed, s.nationality), outfit: 'Coat' }} size={48} radius={12} />
                <div className="grow">
                  <div className="b">{s.name}</div>
                  <div className="tiny dim row tight"><Flag w={w} nation={s.nationality} size={10} />{s.nationality} · {fmtMoney(s.wage)}/wk</div>
                  <div className="row tight tiny" style={{ marginTop: 4 }}><span className="dim">EXP</span><Stars n={s.experience} size={10} /><span className="dim">JDG</span><Stars n={s.judgement} size={10} /></div>
                </div>
                <button className="btn xs club" onClick={() => setAssign(s.id)}>{a ? 'Reassign' : 'Assign'}</button>
              </div>
              {a && (
                <div style={{ padding: '0 12px 12px' }}>
                  <div className="row between tiny"><span className="muted">{a.kind === 'player' ? `Scouting ${w.players[a.playerId!]?.name}` : `${a.region} · ${a.position} · U${a.ageMax} · ${a.focus}`}</span><span className="b">{Math.round(a.progress)}%</span></div>
                  <div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${a.progress}%`, background: 'var(--acc)' }} /></div>
                  {found.length > 0 && <div className="card list" style={{ marginTop: 10 }}>{found.slice(-6).reverse().map((p) => <PlayerLine key={p.id} w={w} p={p} sub={`${knowledge(w, p)}% known`} />)}</div>}
                </div>
              )}
            </div>
          )
        })}
        {w.scouts.length < 3 && <button className="btn block" onClick={() => setHire(true)}><Icon name="plus" size={18} /> Hire scout ({w.scouts.length}/3)</button>}
      </div>
      <Sheet open={assign !== undefined} onClose={() => setAssign(undefined)} title="Scouting instructions">
        <div className="stack" style={{ gap: 12 }}>
          <div className="field"><label className="label">Region</label><select className="input" value={cfg.region} onChange={(e) => setCfg({ ...cfg, region: e.target.value })}>{REGIONS.map((r) => <option key={r}>{r}</option>)}</select></div>
          <div><div className="label" style={{ marginBottom: 6 }}>Position</div><div className="row wrap" style={{ gap: 6 }}>{POS_OPTS.map((p) => <button key={p} className={`chip ${cfg.position === p ? 'on' : ''}`} onClick={() => setCfg({ ...cfg, position: p })}>{p}</button>)}</div></div>
          <div><div className="label" style={{ marginBottom: 6 }}>Max age · {cfg.ageMax}</div><Stepper value={cfg.ageMax} min={17} max={35} onChange={(v) => setCfg({ ...cfg, ageMax: v })} /></div>
          <div><div className="label" style={{ marginBottom: 6 }}>Focus</div><Seg small items={FOCUS.map((x) => ({ id: x, label: x }))} value={cfg.focus} onChange={(v) => setCfg({ ...cfg, focus: v })} /></div>
          <div><div className="label" style={{ marginBottom: 6 }}>Duration</div><Seg small items={[1, 2, 3, 6].map((m) => ({ id: m, label: `${m} mo` }))} value={cfg.months} onChange={(v) => setCfg({ ...cfg, months: v })} /></div>
          <button className="btn primary block" onClick={() => { mutate((w) => scoutNetwork(w, assign!, cfg.region, cfg.position, cfg.ageMax, cfg.focus, cfg.months)); notify('Scout dispatched', 'ok'); setAssign(undefined) }}>Send scout</button>
        </div>
      </Sheet>
      <HireSheet open={hire} onClose={() => setHire(false)} youth={false} />
    </Screen>
  )
}

export function HireSheet({ open, onClose, youth }: { open: boolean; onClose: () => void; youth: boolean }) {
  const w = useWorld()
  const mutate = useGame((s) => s.mutate)
  const pool = youth ? w.youthScoutPool : w.scoutPool
  return (
    <Sheet open={open} onClose={onClose} title={youth ? 'Hire youth scout' : 'Hire scout'}>
      <div className="card list">
        {pool.slice(0, 12).map((s) => (
          <div key={s.id} className="li">
            <Portrait cfg={{ ...seededAvatar(s.faceSeed, s.nationality), outfit: 'Coat' }} size={40} radius={10} />
            <div className="meta"><div className="t small">{s.name}</div><div className="s row tight"><Flag w={w} nation={s.nationality} size={10} />{s.nationality} · {fmtMoney(s.wage)}/wk</div><div className="row tight tiny" style={{ marginTop: 3 }}><span className="dim">EXP</span><Stars n={s.experience} size={10} /><span className="dim">JDG</span><Stars n={s.judgement} size={10} /></div></div>
            <button className="btn xs club" onClick={() => { mutate((w) => { const pl = youth ? w.youthScoutPool : w.scoutPool; const list = youth ? w.youthScouts : w.scouts; const i = pl.findIndex((x) => x.id === s.id); if (i >= 0 && list.length < 3) (list as any[]).push(pl.splice(i, 1)[0]) }); onClose() }}>Hire</button>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

// ============================================================================ negotiation room
export function Negotiation({ params }: { params: { playerId: number; offerId?: string; stage?: 'contract' } }) {
  const w = useWorld()
  const mutate = useGame((s) => s.mutate)
  const close = useGame((s) => s.close)
  const notify = useGame((s) => s.notify)
  const p = w.players[params.playerId]
  const club = userClub(w)
  const [offerId, setOfferId] = useState(params.offerId)
  const offer = offerId ? w.transfers.offers[offerId] : undefined
  const free = p && !p.clubId
  const [stage, setStage] = useState<'offer' | 'contract' | 'done'>(params.stage === 'contract' || free || offer?.status === 'Offer Accepted' ? 'contract' : 'offer')
  const ask = p && p.clubId ? askingPrice(w, p, club.id) : 0
  const [type, setType] = useState<TransferOffer['type']>(offer?.type || (p?.loanListed ? 'loan' : 'transfer'))
  const [fee, setFee] = useState(() => offer?.counterFee || offer?.fee || Math.min(club.finance.transferBudget, roundValue(ask * 0.9)))
  const [sellOn, setSellOn] = useState(0)
  const [swap, setSwap] = useState<number>()
  const [split, setSplit] = useState(60)
  const [option, setOption] = useState(() => roundValue((p?.value || 0) * 1.1))
  const [log, setLog] = useState<{ by: 'me' | 'them' | 'agent'; text: string }[]>(() => offer ? offer.history.map((h) => ({ by: h.by === 'buyer' ? 'me' as const : 'them' as const, text: h.text })) : [])
  const [delOpen, setDelOpen] = useState(false)
  const [maxFee, setMaxFee] = useState(() => roundValue(Math.min(club.finance.transferBudget, ask * 1.1)))
  // contract
  const role0: SquadRole = p ? roleForBuyer(w, p, club.id) : 'Rotation'
  const demand0 = p ? contractDemand(w, p, club.id, role0) : undefined
  const [c, setC] = useState<ContractOffer | undefined>(() => demand0 ? { ...demand0, wage: roundValue(demand0.wage * 0.9) } : undefined)
  const [attempt, setAttempt] = useState(1)
  if (!p || !c) return <Screen title="Negotiation" back onBack={close} noNav><Empty icon="handshake" title="Player unavailable" /></Screen>
  const seller = w.clubs[p.clubId]
  const stance = p.clubId ? sellerStance(w, p, club.id) : { willing: true }
  const interest = playerInterest(w, p, club.id)
  const step = (v: number) => v >= 50e6 ? 1e6 : v >= 10e6 ? 5e5 : v >= 2e6 ? 1e5 : 25e3
  const isLoan = type.startsWith('loan')
  const swaps = rosterOf(w, club.id).filter((q) => !q.untouchable).sort((a, b) => b.ovr - a.ovr)

  const bid = () => {
    haptic('medium')
    let r: any
    mutate((w) => { r = submitBid(w, w.players[p.id], { type, fee: isLoan ? 0 : fee, sellOn, swapPlayerId: swap, loanWageSplit: isLoan ? split : undefined, optionFee: type !== 'loan' && isLoan ? option : undefined }, offerId) })
    setOfferId(r.offerId)
    setLog((l) => [...l, { by: 'me', text: isLoan ? `Loan proposal · we pay ${split}% of wages${type !== 'loan' ? ` · ${type === 'loan-obligation' ? 'obligation' : 'option'} to buy ${fmtMoney(option)}` : ''}` : `Offer: ${fmtMoney(fee)}${sellOn ? ` + ${sellOn}% sell-on` : ''}${swap ? ` + ${w.players[swap].name}` : ''}` }, { by: 'them', text: r.text }])
    if (r.status === 'Offer Accepted') { haptic('heavy'); setTimeout(() => setStage('contract'), 700) }
    if (r.counter) setFee(r.counter)
  }
  const acceptC = () => {
    let r: any
    mutate((w) => { r = acceptCounter(w, offerId!) })
    setLog((l) => [...l, { by: 'me', text: `We accept ${fmtMoney(offer!.counterFee!)}.` }, { by: 'them', text: r.text }])
    if (r.ok) setStage('contract')
    else notify(r.text, 'err')
  }
  const propose = () => {
    haptic('medium')
    let r: any
    mutate((w) => { r = proposeContract(w, offerId, w.players[p.id], c, attempt) }, { roster: true })
    setLog((l) => [...l, { by: 'me', text: `${fmtMoney(c.wage)}/wk · ${c.years} yrs · ${c.role}${c.signingBonus ? ` · ${fmtMoney(c.signingBonus, { short: true })} bonus` : ''}${c.releaseClause ? ` · RC ${fmtMoney(c.releaseClause, { short: true })}` : ''}` }, { by: 'agent', text: r.text }])
    setAttempt(attempt + 1)
    if (r.ok) { setStage('done'); haptic('heavy') }
    else if (r.status === 'reject') setStage('done')
    else if (r.demand && !r.text.startsWith('The ')) setC({ ...c, role: r.demand.role })
  }
  return (
    <Screen title="Negotiation Room" sub={seller ? `${seller.name}` : 'Free agent'} back onBack={close} noNav>
      <div className="pad stack fade-up">
        <div className="negotiation-top">
          <Fx kind="mesh" />
          <div className="col center" style={{ gap: 6 }}><Badge club={club} size={46} /><span className="tiny b">{club.short}</span></div>
          <div className="col center grow" style={{ gap: 6 }}>
            <Face p={p} size={80} radius={18} club={seller} />
            <div className="b">{p.name}</div>
            <div className="row tight"><PosChip pos={p.positions[0]} /><Ovr v={p.ovr} size="sm" /><span className="tiny dim">{ageOf(w, p)} yrs</span></div>
          </div>
          <div className="col center" style={{ gap: 6 }}>{seller ? <Badge club={seller} size={46} /> : <Icon name="contract" size={34} />}<span className="tiny b">{seller?.short || 'Free'}</span></div>
        </div>
        <div className="grid3">
          <div className="card pad-card" style={{ padding: 10 }}><div className="tiny dim">Value</div><div className="b small">{fmtMoney(p.value, { short: true })}</div></div>
          <div className="card pad-card" style={{ padding: 10 }}><div className="tiny dim">Contract</div><div className="b small">{p.clubId ? `to ${p.contract.until + 1}` : 'None'}</div></div>
          <div className="card pad-card" style={{ padding: 10 }}><div className="tiny dim">Interest</div><div className="b small" style={{ color: interest >= 60 ? 'var(--pos)' : interest >= 35 ? 'var(--warn)' : 'var(--neg)' }}>{interest >= 70 ? 'Keen' : interest >= 50 ? 'Open' : interest >= 30 ? 'Unsure' : 'Reluctant'}</div></div>
        </div>
        {!stance.willing && !p.contract.releaseClause && <div className="card pad-card small row tight" style={{ borderColor: 'rgba(255,77,94,.4)' }}><Icon name="lock" size={16} color="var(--neg)" />{stance.reason}</div>}
        {log.length > 0 && <div className="stack" style={{ gap: 8 }}>{log.map((l, i) => <div key={i} className={`bubble ${l.by === 'me' ? 'me' : 'them'}`}>{l.by === 'agent' && <div className="tiny dim b" style={{ marginBottom: 3 }}>Agent</div>}{l.by === 'them' && seller && <div className="tiny dim b" style={{ marginBottom: 3 }}>{seller.short}</div>}{l.text}</div>)}</div>}

        {stage === 'offer' && (
          <div className="card pad-card stack" style={{ gap: 12 }}>
            <Seg small items={[{ id: 'transfer', label: 'Transfer' }, { id: 'loan', label: 'Loan' }, { id: 'loan-option', label: 'Loan + option' }, { id: 'loan-obligation', label: 'Loan + oblig.' }]} value={type} onChange={(v) => setType(v as TransferOffer['type'])} />
            {!isLoan ? (
              <>
                <div className="row between"><span className="label">Transfer fee</span><span className="tiny dim">Asking ~{fmtMoney(ask, { short: true })}{p.contract.releaseClause ? ` · RC ${fmtMoney(p.contract.releaseClause, { short: true })}` : ''}</span></div>
                <Stepper value={fee} min={0} max={Math.max(club.finance.transferBudget, fee)} step={step(fee)} onChange={setFee} fmt={(v) => fmtMoney(v)} />
                <div className="row wrap" style={{ gap: 6 }}>{[0.8, 0.9, 1, 1.1].map((m) => <button key={m} className="chip" onClick={() => setFee(Math.min(club.finance.transferBudget, roundValue(ask * m)))}>{Math.round(m * 100)}%</button>)}{p.contract.releaseClause > 0 && <button className="chip" onClick={() => setFee(p.contract.releaseClause)}>Release clause</button>}</div>
                <div><div className="label" style={{ marginBottom: 6 }}>Sell-on clause</div><Seg small items={[0, 10, 15, 20, 25].map((x) => ({ id: x, label: x ? `${x}%` : 'None' }))} value={sellOn} onChange={setSellOn} /></div>
                <div className="field"><label className="label">Player exchange</label><select className="input" value={swap || ''} onChange={(e) => setSwap(e.target.value ? Number(e.target.value) : undefined)}><option value="">None</option>{swaps.map((q) => <option key={q.id} value={q.id}>{q.name} ({q.ovr}, {fmtMoney(q.value, { short: true })})</option>)}</select></div>
              </>
            ) : (
              <>
                <div><div className="label" style={{ marginBottom: 6 }}>Wages you cover · {split}%</div><Seg small items={[25, 50, 75, 100].map((x) => ({ id: x, label: `${x}%` }))} value={split} onChange={setSplit} /></div>
                {type !== 'loan' && <><div className="label">{type === 'loan-obligation' ? 'Obligation' : 'Option'} to buy</div><Stepper value={option} min={0} max={Math.max(option, p.value * 4)} step={step(option)} onChange={setOption} fmt={(v) => fmtMoney(v)} /></>}
                <div className="tiny dim">Loans run until {fmtDate(`${w.season + 1}-06-30`, 'long')}. Clubs loan out players who aren't key to their plans.</div>
              </>
            )}
            <div className="row">
              <button className="btn grow" onClick={() => setDelOpen(true)}><Icon name="manager" size={16} /> Delegate</button>
              <button className="btn club grow" onClick={bid} disabled={(!stance.willing && !p.contract.releaseClause) || (!isLoan && fee > club.finance.transferBudget)}>Submit Offer</button>
            </div>
            {offer?.status === 'Counter Offer' && offer.counterFee && <button className="btn primary block" onClick={acceptC}>Accept counter · {fmtMoney(offer.counterFee)}</button>}
          </div>
        )}

        {stage === 'contract' && (
          <div className="card pad-card stack" style={{ gap: 12 }}>
            <div className="row between"><span className="h3">Personal terms</span><span className="tiny dim">Wage room {fmtMoney(Math.max(0, wageRoom(w)))}/wk</span></div>
            <div className="row between"><span className="label">Weekly wage</span><span className="tiny dim">Agent expects ~{fmtMoney(demand0!.wage)}</span></div>
            <Stepper value={c.wage} min={500} max={Math.max(c.wage, demand0!.wage * 3)} step={c.wage >= 100000 ? 5000 : c.wage >= 20000 ? 1000 : 250} onChange={(v) => setC({ ...c, wage: v })} fmt={(v) => `${fmtMoney(v)}/wk`} />
            {!offer?.type.startsWith('loan') && <>
              <div><div className="label" style={{ marginBottom: 6 }}>Contract length</div><Seg small items={[1, 2, 3, 4, 5].map((y) => ({ id: y, label: `${y} yr` }))} value={c.years} onChange={(v) => setC({ ...c, years: v })} /></div>
              <div><div className="label" style={{ marginBottom: 6 }}>Squad role</div><Seg small items={SQUAD_ROLES.map((r) => ({ id: r, label: r === 'Sparingly' ? 'Spare' : r }))} value={c.role} onChange={(v) => setC({ ...c, role: v as SquadRole })} /></div>
              <div className="label">Signing bonus</div>
              <Stepper value={c.signingBonus} min={0} max={Math.max(c.signingBonus, demand0!.signingBonus * 4)} step={step(c.signingBonus || 1e5)} onChange={(v) => setC({ ...c, signingBonus: v })} fmt={(v) => fmtMoney(v)} />
              <div className="label">Release clause</div>
              <div className="row wrap" style={{ gap: 6 }}>{[0, 1.5, 2, 3, 5].map((m) => <button key={m} className={`chip ${c.releaseClause === (m ? roundValue(p.value * m) : 0) ? 'on' : ''}`} onClick={() => setC({ ...c, releaseClause: m ? roundValue(p.value * m) : 0 })}>{m ? `${fmtMoney(roundValue(p.value * m), { short: true })}` : 'None'}</button>)}</div>
              <div className="row tight tiny dim">Performance bonuses: goal {fmtMoney(c.bonusGoal)}, clean sheet {fmtMoney(c.bonusCleanSheet)}, appearance {fmtMoney(c.bonusApp)}</div>
            </>}
            <button className="btn club block" onClick={propose}>Offer contract</button>
          </div>
        )}

        {stage === 'done' && <button className="btn primary block" onClick={close}>Done</button>}
      </div>
      <Sheet open={delOpen} onClose={() => setDelOpen(false)} title="Delegate to Sporting Director">
        <div className="stack" style={{ gap: 12 }}>
          <div className="muted small">Your director handles fee and contract talks and reports back within a couple of days.</div>
          {!isLoan && <><div className="label">Maximum fee</div><Stepper value={maxFee} min={0} max={club.finance.transferBudget} step={step(maxFee)} onChange={setMaxFee} fmt={(v) => fmtMoney(v)} /></>}
          <button className="btn club block" onClick={() => { let r: any; mutate((w) => { r = delegateTransfer(w, w.players[p.id], isLoan ? 0 : maxFee, isLoan ? 'loan' : 'transfer') }); notify(r.text, r.ok ? 'ok' : 'err'); if (r.ok) close() }}>Delegate</button>
        </div>
      </Sheet>
    </Screen>
  )
}

// ============================================================================ renewal
export function Renewal({ params }: { params: { id: number } }) {
  const w = useWorld()
  const mutate = useGame((s) => s.mutate)
  const close = useGame((s) => s.close)
  const p = w.players[params.id]
  const demand = p ? renewalDemand(w, p) : undefined
  const [c, setC] = useState<ContractOffer | undefined>(() => demand ? { ...demand, wage: Math.max(p!.contract.wage, roundValue(demand.wage * 0.92)) } : undefined)
  const [attempt, setAttempt] = useState(1)
  const [log, setLog] = useState<{ me: boolean; text: string }[]>([])
  const [done, setDone] = useState(false)
  if (!p || !c || !demand) return <Screen title="Contract" back onBack={close} noNav><Empty icon="contract" title="Player unavailable" /></Screen>
  const club = w.clubs[p.clubId]
  return (
    <Screen title="Contract Renewal" sub={p.name} back onBack={close} noNav>
      <div className="pad stack fade-up">
        <div className="card pad-card row" style={{ gap: 12 }}>
          <Face p={p} size={60} radius={14} club={club} />
          <div className="grow"><div className="b">{p.name}</div><div className="tiny dim">Current: {fmtMoney(p.contract.wage)}/wk · until {p.contract.until + 1} · {p.contract.role}</div><div className="tiny dim">Morale: {Math.round(p.morale)} · {yearsLeft(w, p) <= 1 ? 'Final year' : `${yearsLeft(w, p)} years left`}</div></div>
          <Ovr v={p.ovr} />
        </div>
        {log.map((l, i) => <div key={i} className={`bubble ${l.me ? 'me' : 'them'}`}>{l.text}</div>)}
        {!done && (
          <div className="card pad-card stack" style={{ gap: 12 }}>
            <div className="row between"><span className="label">Weekly wage</span><span className="tiny dim">Expects ~{fmtMoney(demand.wage)}</span></div>
            <Stepper value={c.wage} min={Math.round(p.contract.wage * 0.8)} max={Math.max(c.wage, demand.wage * 3)} step={c.wage >= 100000 ? 5000 : c.wage >= 20000 ? 1000 : 250} onChange={(v) => setC({ ...c, wage: v })} fmt={(v) => `${fmtMoney(v)}/wk`} />
            <div><div className="label" style={{ marginBottom: 6 }}>Length</div><Seg small items={[1, 2, 3, 4, 5].map((y) => ({ id: y, label: `${y} yr` }))} value={c.years} onChange={(v) => setC({ ...c, years: v })} /></div>
            <div><div className="label" style={{ marginBottom: 6 }}>Squad role</div><Seg small items={SQUAD_ROLES.map((r) => ({ id: r, label: r === 'Sparingly' ? 'Spare' : r }))} value={c.role} onChange={(v) => setC({ ...c, role: v as SquadRole })} /></div>
            <div className="label">Loyalty bonus</div>
            <Stepper value={c.signingBonus} min={0} max={Math.max(c.signingBonus, demand.signingBonus * 4)} step={c.signingBonus >= 5e6 ? 5e5 : 1e5} onChange={(v) => setC({ ...c, signingBonus: v })} fmt={(v) => fmtMoney(v)} />
            <div className="label">Release clause</div>
            <div className="row wrap" style={{ gap: 6 }}>{[0, 1.5, 2, 3, 5].map((m) => <button key={m} className={`chip ${c.releaseClause === (m ? roundValue(p.value * m) : 0) ? 'on' : ''}`} onClick={() => setC({ ...c, releaseClause: m ? roundValue(p.value * m) : 0 })}>{m ? fmtMoney(roundValue(p.value * m), { short: true }) : 'None'}</button>)}</div>
            <button className="btn club block" onClick={() => {
              haptic('medium')
              let r: any
              mutate((w) => { r = renewContract(w, w.players[p.id], c, attempt) })
              setAttempt(attempt + 1)
              setLog((l) => [...l, { me: true, text: `${fmtMoney(c.wage)}/wk · ${c.years} years · ${c.role}` }, { me: false, text: r.text }])
              if (r.ok || r.status === 'reject') setDone(true)
            }}>Offer new contract</button>
          </div>
        )}
        {done && <button className="btn primary block" onClick={close}>Done</button>}
      </div>
    </Screen>
  )
}

void POS_GROUP
void (0 as unknown as Position)
