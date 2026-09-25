import { useEffect, useMemo, useState } from 'react'
import { useGame, haptic } from '../../store/game'
import type { RawClub, RawDb, RawLeague } from '../../data/rawTypes'
import type { AvatarConfig, CareerSettings } from '../../domain/types'
import { Icon } from '../icons/Icon'
import { Badge, CompLogo, Face, Flag, Ovr, PosChip, Stars } from '../components/atoms'
import { Portrait, SKINS, HAIR_COLORS, HAIR_STYLES, BEARDS, BROWS, GLASSES } from '../components/Portrait'
import { Screen, Seg, Sheet, Toggle } from '../components/layout'
import { clubRatings, leagueClubs, rawBudget, rawExpectation, rawSquads, starRating } from '../rawHelpers'
import { fmtMoney } from '../../domain/finance'
import { clubAccent } from '../theme'

type Step = 'manager' | 'league' | 'club' | 'inspect' | 'settings' | 'confirm'
const STEPS: Step[] = ['manager', 'league', 'club', 'inspect', 'settings', 'confirm']

const OUTFIT_COLORS = ['#1A2233', '#0E0F12', '#2B3A55', '#4A4F57', '#5B1E2A', '#1F3B2E', '#6B5A45', '#B8BDC6']
const DEFAULT_AVATAR: AvatarConfig = { skin: 1, hair: 2, hairColor: 2, beard: 1, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#1A2233', tie: true }

export function NewCareer({ onExit }: { onExit: () => void }) {
  const raw = useGame((s) => s.raw)
  const dbError = useGame((s) => s.dbError)
  const loadDb = useGame((s) => s.loadDb)
  const startCareer = useGame((s) => s.startCareer)
  const [step, setStep] = useState<Step>('manager')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [nation, setNation] = useState('England')
  const [age, setAge] = useState(42)
  const [avatar, setAvatar] = useState<AvatarConfig>(DEFAULT_AVATAR)
  const [leagueId, setLeagueId] = useState<number>()
  const [clubId, setClubId] = useState<number>()
  const [saveName, setSaveName] = useState('')
  const [settings, setSettings] = useState<CareerSettings>({ difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' })
  const [starting, setStarting] = useState(false)

  useEffect(() => { loadDb() }, [])

  const idx = STEPS.indexOf(step)
  const goBack = () => (idx === 0 ? onExit() : setStep(STEPS[idx - 1]))
  const next = () => { haptic(); setStep(STEPS[idx + 1]) }

  if (!raw) {
    return (
      <Screen title="New Career" back onBack={onExit} noNav>
        <div className="col center" style={{ padding: 60, gap: 14 }}>
          {dbError ? <><Icon name="warning" size={32} color="var(--neg)" /><div className="muted">Could not load the football database. {dbError}</div><button className="btn" onClick={() => loadDb()}>Retry</button></> : <><div className="spinner" /><div className="muted small">Loading EA SPORTS FC 27 database…</div></>}
        </div>
      </Screen>
    )
  }

  const club = clubId ? raw.clubs.find((c) => c.id === clubId) : undefined
  const league = leagueId ? raw.leagues.find((l) => l.id === leagueId) : undefined

  if (starting) {
    return (
      <div className="screen no-nav no-top center" style={{ flexDirection: 'column', gap: 18 }}>
        {club && <div className="pop"><Badge club={club as any} size={110} /></div>}
        <div className="h2" style={{ textAlign: 'center' }}>{club?.name}</div>
        <div className="spinner" />
        <div className="muted small">Building the 2026/27 football world…</div>
      </div>
    )
  }

  const titles: Record<Step, string> = { manager: 'Create Manager', league: 'Choose League', club: 'Choose Club', inspect: 'Club Overview', settings: 'Career Settings', confirm: 'Confirm Career' }

  return (
    <Screen title={titles[step]} sub={`Step ${idx + 1} of ${STEPS.length}`} back onBack={goBack} noNav scrollKey={step}>
      <div className="stepbar pad"><i style={{ width: `${((idx + 1) / STEPS.length) * 100}%` }} /></div>
      {step === 'manager' && (
        <ManagerStep raw={raw} first={first} last={last} setFirst={setFirst} setLast={setLast} nation={nation} setNation={setNation} age={age} setAge={setAge} avatar={avatar} setAvatar={setAvatar} onNext={next} />
      )}
      {step === 'league' && <LeagueStep raw={raw} onPick={(id) => { setLeagueId(id); setClubId(undefined); next() }} />}
      {step === 'club' && league && <ClubStep raw={raw} league={league} onPick={(id) => { setClubId(id); next() }} />}
      {step === 'inspect' && club && <InspectStep raw={raw} club={club} onNext={next} />}
      {step === 'settings' && <SettingsStep settings={settings} setSettings={setSettings} onNext={next} />}
      {step === 'confirm' && club && (
        <div className="pad stack fade-up">
          <div className="hero" style={{ padding: 18, background: `linear-gradient(135deg, ${clubAccent(club)}, #06080d 80%)` }}>
            <div className="row" style={{ gap: 14, position: 'relative', zIndex: 1 }}>
              <Portrait cfg={avatar} size={86} radius={16} />
              <div className="grow">
                <div className="kicker" style={{ color: '#fff', opacity: 0.8 }}>Manager</div>
                <div className="h2">{first} {last}</div>
                <div className="row tight small" style={{ marginTop: 6 }}><Flag code={raw.nations.find((n) => n.name === nation)?.flag} size={13} /> {nation} · {age}</div>
              </div>
              <Badge club={club as any} size={62} />
            </div>
          </div>
          <div className="card pad-card stack" style={{ gap: 8 }}>
            <Line k="Club" v={club.name} />
            <Line k="League" v={league?.name} />
            <Line k="Board expectation" v={rawExpectation(raw, club)} />
            <Line k="Transfer budget" v={fmtMoney(rawBudget(raw, club) * (settings.startingBudget === 'High' ? 1.6 : settings.startingBudget === 'Low' ? 0.6 : 1))} />
            <Line k="Difficulty" v={settings.difficulty} />
            <Line k="Transfers" v={settings.transferDifficulty} />
          </div>
          <div className="field">
            <label className="label">Save name</label>
            <input className="input" value={saveName} placeholder={`${club.short} Career`} maxLength={32} onChange={(e) => setSaveName(e.target.value)} />
          </div>
          <button className="btn primary block" style={{ height: 56, fontSize: 19 }} onClick={() => {
            haptic('heavy')
            setStarting(true)
            window.setTimeout(async () => {
              const born = `${2026 - age}-0${1 + (first.length % 9)}-1${last.length % 9}`
              await startCareer({ clubId: club.id, manager: { firstName: first.trim(), lastName: last.trim(), nationality: nation, dob: born, avatar }, settings, saveName: saveName.trim() || `${club.short} Career` })
            }, 60)
          }}>
            <Icon name="whistle" size={22} /> Start Career
          </button>
        </div>
      )}
    </Screen>
  )
}

function Line({ k, v }: { k: string; v: any }) {
  return <div className="row between"><span className="muted small">{k}</span><span className="b">{v}</span></div>
}

// ----------------------------------------------------------------- manager
function ManagerStep(props: { raw: RawDb; first: string; last: string; setFirst: (s: string) => void; setLast: (s: string) => void; nation: string; setNation: (s: string) => void; age: number; setAge: (n: number) => void; avatar: AvatarConfig; setAvatar: (a: AvatarConfig) => void; onNext: () => void }) {
  const { raw, avatar, setAvatar } = props
  const [natOpen, setNatOpen] = useState(false)
  const [q, setQ] = useState('')
  const [part, setPart] = useState<'face' | 'hair' | 'outfit'>('face')
  const set = (p: Partial<AvatarConfig>) => { haptic(); setAvatar({ ...avatar, ...p }) }
  const nat = raw.nations.find((n) => n.name === props.nation)
  const valid = props.first.trim().length >= 1 && props.last.trim().length >= 2
  const nations = useMemo(() => [...raw.nations].sort((a, b) => a.name.localeCompare(b.name)), [raw])
  return (
    <div className="pad stack fade-up">
      <div className="avatar-stage">
        <Portrait cfg={avatar} size={168} radius={24} bg={['#1d2a40', '#070a10']} />
      </div>
      <Seg items={[{ id: 'face', label: 'Face' }, { id: 'hair', label: 'Hair' }, { id: 'outfit', label: 'Outfit' }]} value={part} onChange={setPart} />
      <div className="card pad-card stack" style={{ gap: 12 }}>
        {part === 'face' && (
          <>
            <Picker label="Skin tone">{SKINS.map((c, i) => <Swatch key={c} color={c} on={avatar.skin === i} onClick={() => set({ skin: i })} />)}</Picker>
            <Picker label="Facial hair">{BEARDS.map((b, i) => <button key={b} className={`chip ${avatar.beard === i ? 'on' : ''}`} onClick={() => set({ beard: i })}>{b}</button>)}</Picker>
            <Picker label="Eyebrows">{BROWS.map((b, i) => <button key={b} className={`chip ${avatar.brows === i ? 'on' : ''}`} onClick={() => set({ brows: i })}>{b}</button>)}</Picker>
            <Picker label="Eyes">{['Brown', 'Blue', 'Narrow'].map((b, i) => <button key={b} className={`chip ${avatar.eyes === i ? 'on' : ''}`} onClick={() => set({ eyes: i })}>{b}</button>)}</Picker>
            <Picker label="Glasses">{GLASSES.map((b, i) => <button key={b} className={`chip ${avatar.glasses === i ? 'on' : ''}`} onClick={() => set({ glasses: i })}>{b}</button>)}</Picker>
          </>
        )}
        {part === 'hair' && (
          <>
            <Picker label="Style">{HAIR_STYLES.map((b, i) => <button key={b} className={`chip ${avatar.hair === i ? 'on' : ''}`} onClick={() => set({ hair: i })}>{b}</button>)}</Picker>
            <Picker label="Colour">{HAIR_COLORS.map((c, i) => <Swatch key={c} color={c} on={avatar.hairColor === i} onClick={() => set({ hairColor: i })} />)}</Picker>
          </>
        )}
        {part === 'outfit' && (
          <>
            <Picker label="Outfit">{(['Suit', 'Coat', 'Smart Casual', 'Tracksuit'] as const).map((b) => <button key={b} className={`chip ${avatar.outfit === b ? 'on' : ''}`} onClick={() => set({ outfit: b })}>{b}</button>)}</Picker>
            <Picker label="Colour">{OUTFIT_COLORS.map((c) => <Swatch key={c} color={c} on={avatar.outfitColor === c} onClick={() => set({ outfitColor: c })} />)}</Picker>
            {(avatar.outfit === 'Suit' || avatar.outfit === 'Coat') && <Toggle label="Tie" on={avatar.tie} onChange={(v) => set({ tie: v })} />}
          </>
        )}
      </div>
      <div className="row">
        <div className="field grow"><label className="label">First name</label><input className="input" value={props.first} maxLength={18} onChange={(e) => props.setFirst(e.target.value)} placeholder="First name" autoComplete="off" /></div>
        <div className="field grow"><label className="label">Last name</label><input className="input" value={props.last} maxLength={20} onChange={(e) => props.setLast(e.target.value)} placeholder="Last name" autoComplete="off" /></div>
      </div>
      <div className="row">
        <div className="field grow">
          <label className="label">Nationality</label>
          <button className="input row" style={{ textAlign: 'left' }} onClick={() => setNatOpen(true)}><Flag code={nat?.flag} size={15} /> <span className="grow ellipsis">{props.nation}</span><Icon name="down" size={16} /></button>
        </div>
        <div className="field" style={{ width: 128 }}>
          <label className="label">Age</label>
          <div className="stepper" style={{ height: 48 }}>
            <button onClick={() => props.setAge(Math.max(30, props.age - 1))} aria-label="Younger"><Icon name="minus" size={18} /></button>
            <div className="num">{props.age}</div>
            <button onClick={() => props.setAge(Math.min(72, props.age + 1))} aria-label="Older"><Icon name="plus" size={18} /></button>
          </div>
        </div>
      </div>
      <button className="btn primary block" disabled={!valid} onClick={props.onNext}>Continue <Icon name="forward" size={18} /></button>
      <Sheet open={natOpen} onClose={() => setNatOpen(false)} title="Nationality">
        <input className="input" style={{ width: '100%', marginBottom: 10 }} placeholder="Search nations" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="list" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          {nations.filter((n) => n.name.toLowerCase().includes(q.toLowerCase())).map((n) => (
            <button key={n.name} className="li tap" style={{ minHeight: 46, width: '100%', textAlign: 'left' }} onClick={() => { props.setNation(n.name); setNatOpen(false); setQ('') }}>
              <Flag code={n.flag} size={16} /><div className="meta">{n.name}</div>{n.name === props.nation && <Icon name="check" size={18} color="var(--acc)" />}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

function Picker({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 7 }}>{label}</div>
      <div className="row wrap" style={{ gap: 7 }}>{children}</div>
    </div>
  )
}
function Swatch({ color, on, onClick }: { color: string; on: boolean; onClick: () => void }) {
  return <button aria-label={color} onClick={onClick} className="swatch" style={{ background: color, boxShadow: on ? '0 0 0 2px var(--bg), 0 0 0 4px var(--acc)' : undefined }} />
}

// ----------------------------------------------------------------- league
const COUNTRY_ORDER = ['England', 'Spain', 'Germany', 'Italy', 'France', 'Portugal', 'Netherlands', 'Belgium', 'Scotland', 'Türkiye', 'Saudi Arabia', 'United States']

function LeagueStep({ raw, onPick }: { raw: RawDb; onPick: (id: number) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, RawLeague[]>()
    for (const l of raw.leagues) { const a = m.get(l.country) || []; a.push(l); m.set(l.country, a) }
    for (const a of m.values()) a.sort((x, y) => x.level - y.level)
    return [...m.entries()].sort((a, b) => {
      const ia = COUNTRY_ORDER.indexOf(a[0]), ib = COUNTRY_ORDER.indexOf(b[0])
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
      return Math.max(...b[1].map((l) => l.prestige)) - Math.max(...a[1].map((l) => l.prestige)) || a[0].localeCompare(b[0])
    })
  }, [raw])
  return (
    <div className="pad stack stagger">
      {groups.map(([country, leagues]) => (
        <div key={country} className="card">
          <div className="card-h"><div className="row tight"><Flag code={leagues[0].flag} size={14} /><span className="label">{country}</span></div></div>
          <div className="list">
            {leagues.map((l) => {
              const clubs = leagueClubs(raw, l)
              const best = clubs[0]
              return (
                <button key={l.id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => { haptic(); onPick(l.id) }}>
                  <div className="logo-tile"><CompLogo k={`L${l.id}`} size={34} name={l.name} /></div>
                  <div className="meta">
                    <div className="t">{l.name}</div>
                    <div className="s">{clubs.length} clubs · Tier {l.level}{best ? ` · Top rated: ${best.short}` : ''}</div>
                  </div>
                  <Stars n={Math.max(0.5, l.prestige / 2)} size={11} />
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ----------------------------------------------------------------- club
function ClubStep({ raw, league, onPick }: { raw: RawDb; league: RawLeague; onPick: (id: number) => void }) {
  const clubs = useMemo(() => leagueClubs(raw, league), [raw, league])
  const [sort, setSort] = useState<'rating' | 'name' | 'budget'>('rating')
  const sorted = useMemo(() => {
    const a = [...clubs]
    if (sort === 'name') a.sort((x, y) => x.name.localeCompare(y.name))
    if (sort === 'budget') a.sort((x, y) => rawBudget(raw, y) - rawBudget(raw, x))
    return a
  }, [clubs, sort])
  return (
    <div className="stack">
      <div className="pad row" style={{ gap: 12 }}>
        <CompLogo k={`L${league.id}`} size={40} name={league.name} />
        <div className="grow"><div className="h3">{league.name}</div><div className="tiny muted">{league.country} · {clubs.length} clubs · {league.rele ? `${league.rele} relegated` : 'No relegation'}</div></div>
      </div>
      <div className="pad"><Seg small items={[{ id: 'rating', label: 'Rating' }, { id: 'budget', label: 'Budget' }, { id: 'name', label: 'A–Z' }]} value={sort} onChange={setSort} /></div>
      <div className="pad club-grid stagger">
        {sorted.map((c) => {
          const r = clubRatings(raw, c.id)
          const acc = clubAccent(c)
          return (
            <button key={c.id} className="club-card tap" style={{ ['--cc' as any]: acc }} onClick={() => { haptic(); onPick(c.id) }}>
              <div className="club-card-top"><Badge club={c as any} size={58} /></div>
              <div className="b ellipsis" style={{ fontSize: 14, marginTop: 8 }}>{c.short}</div>
              <div style={{ marginTop: 4 }}><Stars n={starRating(c.squadAvg)} size={11} /></div>
              <div className="row between tiny" style={{ marginTop: 8, width: '100%' }}>
                <span><span className="dim">ATT</span> <b>{r.att}</b></span>
                <span><span className="dim">MID</span> <b>{r.mid}</b></span>
                <span><span className="dim">DEF</span> <b>{r.def}</b></span>
              </div>
              <div className="tiny muted" style={{ marginTop: 6 }}>{fmtMoney(rawBudget(raw, c), { short: true })}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------- inspect
function InspectStep({ raw, club, onNext }: { raw: RawDb; club: RawClub; onNext: () => void }) {
  const r = clubRatings(raw, club.id)
  const squad = rawSquads(raw).get(club.id) || []
  const lg = raw.leagues.find((l) => l.id === club.leagueId)
  const byId = new Map(raw.clubs.map((c) => [c.id, c]))
  const hist = raw.history[String(club.leagueId)]
  const lastPos = hist ? hist.findIndex((h) => h.clubId === club.id) + 1 : 0
  const acc = clubAccent(club)
  const young = squad.filter((p) => p.age <= 21).sort((a, b) => b.pot - a.pot).slice(0, 3)
  return (
    <div className="stack fade-up">
      <div className="pad">
        <div className="hero club-hero" style={{ background: `linear-gradient(145deg, ${acc} 0%, ${club.kit?.[1] && club.kit[1] !== acc ? club.kit[1] + '44' : '#0a0f18'} 55%, #05070c 100%)` }}>
          <div style={{ position: 'relative', zIndex: 1, padding: 18 }}>
            <div className="row" style={{ gap: 16 }}>
              <Badge club={club as any} size={92} />
              <div className="grow">
                <div className="h1" style={{ fontSize: 30 }}>{club.name}</div>
                <div className="row tight small" style={{ marginTop: 8, opacity: 0.9 }}>{lg && <CompLogo k={`L${lg.id}`} size={18} name={lg.name} />} {lg?.name}</div>
                <div style={{ marginTop: 8 }}><Stars n={starRating(club.squadAvg)} size={14} /></div>
              </div>
            </div>
            <div className="rating-strip">
              {[['OVR', r.ovr], ['ATT', r.att], ['MID', r.mid], ['DEF', r.def]].map(([k, v]) => (
                <div key={k as string}><div className="label" style={{ color: 'rgba(255,255,255,.7)' }}>{k}</div><div className="display" style={{ fontSize: 28 }}>{v}</div></div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="pad grid2">
        <Info icon="objective" k="Board expectation" v={rawExpectation(raw, club)} />
        <Info icon="money" k="Transfer budget" v={fmtMoney(rawBudget(raw, club))} />
        <Info icon="stadium" k={club.stadium || 'Stadium'} v={club.capacity ? `${club.capacity.toLocaleString()} seats` : '—'} />
        <Info icon="history" k="2025/26 finish" v={lastPos ? `${lastPos}${['th', 'st', 'nd', 'rd'][lastPos % 10 > 3 || Math.floor(lastPos / 10) === 1 ? 0 : lastPos % 10]}` : lg?.level === 1 ? 'Promoted' : '—'} />
        <Info icon="globe" k="City" v={club.city || club.country} />
        <Info icon="calendar" k="Founded" v={club.founded || '—'} />
      </div>
      {club.manager && (
        <div className="pad">
          <div className="card pad-card row" style={{ gap: 12 }}>
            <Icon name="manager" size={22} color="var(--t2)" />
            <div className="grow small"><span className="muted">You replace </span><b>{club.manager.name}</b><span className="muted"> ({club.manager.nationality}) · {club.manager.formation}</span></div>
          </div>
        </div>
      )}
      <div className="section-title"><div className="h3">Key Players</div></div>
      <div className="pad"><div className="card list">
        {squad.slice(0, 6).map((p) => (
          <div key={p.id} className="li">
            <Face p={{ id: p.id, nation: p.nation, name: p.name } as any} size={42} radius={10} />
            <div className="meta"><div className="t ellipsis">{p.name}</div><div className="s">{p.age} yrs · {p.nation}</div></div>
            <PosChip pos={p.pos} />
            <Ovr v={p.ovr} size="sm" />
          </div>
        ))}
      </div></div>
      {young.length > 0 && <>
        <div className="section-title"><div className="h3">Top Prospects</div></div>
        <div className="pad"><div className="card list">
          {young.map((p) => (
            <div key={p.id} className="li">
              <Face p={{ id: p.id, nation: p.nation, name: p.name } as any} size={42} radius={10} />
              <div className="meta"><div className="t ellipsis">{p.name}</div><div className="s">{p.age} yrs · POT {p.pot}</div></div>
              <PosChip pos={p.pos} />
              <Ovr v={p.ovr} size="sm" />
            </div>
          ))}
        </div></div>
      </>}
      {club.rivals.length > 0 && <>
        <div className="section-title"><div className="h3">Rivals</div></div>
        <div className="pad"><div className="card list">
          {club.rivals.map(([id, name, lvl]) => byId.get(id) && (
            <div key={id} className="li">
              <Badge club={byId.get(id) as any} size={34} />
              <div className="meta"><div className="t">{byId.get(id)!.name}</div><div className="s">{name}</div></div>
              <span className="row tight">{Array.from({ length: lvl }, (_, i) => <Icon key={i} name="fire" size={15} color="var(--neg)" />)}</span>
            </div>
          ))}
        </div></div>
      </>}
      <div className="pad" style={{ marginTop: 8 }}>
        <button className="btn primary block" onClick={onNext}>Manage {club.short} <Icon name="forward" size={18} /></button>
      </div>
    </div>
  )
}

function Info({ icon, k, v }: { icon: string; k: string; v: any }) {
  return (
    <div className="card pad-card" style={{ padding: 12 }}>
      <div className="row tight"><Icon name={icon} size={16} color="var(--t3)" /><span className="tiny dim ellipsis">{k}</span></div>
      <div className="b" style={{ marginTop: 6, fontSize: 15 }}>{v}</div>
    </div>
  )
}

// ----------------------------------------------------------------- settings
function SettingsStep({ settings, setSettings, onNext }: { settings: CareerSettings; setSettings: (s: CareerSettings) => void; onNext: () => void }) {
  const set = (p: Partial<CareerSettings>) => setSettings({ ...settings, ...p })
  const diffs: CareerSettings['difficulty'][] = ['Beginner', 'Amateur', 'Semi-Pro', 'Professional', 'World Class', 'Legendary', 'Ultimate']
  return (
    <div className="pad stack fade-up">
      <div className="card pad-card stack" style={{ gap: 10 }}>
        <div className="label">Match difficulty</div>
        <div className="row wrap" style={{ gap: 7 }}>{diffs.map((d) => <button key={d} className={`chip ${settings.difficulty === d ? 'on' : ''}`} onClick={() => set({ difficulty: d })}>{d}</button>)}</div>
        <div className="tiny dim">Scales how strongly AI teams perform against you in simulated and live matches.</div>
      </div>
      <div className="card pad-card stack" style={{ gap: 12 }}>
        <div><div className="label" style={{ marginBottom: 6 }}>Transfer negotiations</div><Seg small items={[{ id: 'Easy', label: 'Easy' }, { id: 'Normal', label: 'Normal' }, { id: 'Hard', label: 'Hard' }]} value={settings.transferDifficulty} onChange={(v) => set({ transferDifficulty: v })} /></div>
        <div><div className="label" style={{ marginBottom: 6 }}>Starting budget</div><Seg small items={[{ id: 'Low', label: 'Low' }, { id: 'Default', label: 'Default' }, { id: 'High', label: 'High' }]} value={settings.startingBudget} onChange={(v) => set({ startingBudget: v })} /></div>
        <div><div className="label" style={{ marginBottom: 6 }}>Injury frequency</div><Seg small items={[{ id: 'Low', label: 'Low' }, { id: 'Normal', label: 'Normal' }, { id: 'High', label: 'High' }]} value={settings.injuries} onChange={(v) => set({ injuries: v })} /></div>
        <div><div className="label" style={{ marginBottom: 6 }}>Player growth</div><Seg small items={[{ id: 'Slow', label: 'Slow' }, { id: 'Normal', label: 'Normal' }, { id: 'Fast', label: 'Fast' }]} value={settings.growth} onChange={(v) => set({ growth: v })} /></div>
      </div>
      <div className="card">
        <Toggle label="Manager sacking" sub="The board can dismiss you if confidence collapses" on={settings.sacking} onChange={(v) => set({ sacking: v })} />
        <Toggle label="AI transfers" sub="Other clubs buy, sell and loan players" on={settings.aiTransfers} onChange={(v) => set({ aiTransfers: v })} />
      </div>
      <button className="btn primary block" onClick={onNext}>Continue <Icon name="forward" size={18} /></button>
    </div>
  )
}
