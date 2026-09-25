import { create } from 'zustand'
import type { World } from '../domain/types'
import type { RawDb } from '../data/rawTypes'
import { createWorld, type NewCareerOptions } from '../data/createWorld'
import { advance as advanceWorld, careerIntro, type StopReason } from '../engine/world/advance'
import { loadCareer as loadSave, saveCareer, listSaves, deleteSave, getKV, setKV, type SaveMeta } from '../services/saves'
import { positionOf } from '../engine/competitions/tables'
import type { MatchSim } from '../engine/match/engine'
import { touchRoster } from '../engine/world/roster'

export type Tab = 'central' | 'squad' | 'transfers' | 'academy' | 'season'
export interface Route { name: string; params?: any }

export interface LiveMatch {
  sim: MatchSim
  fixtureId: string
  speed: number
  running: boolean
  tick: number
  finished: boolean
  applied: boolean
}

export interface AppPrefs { haptics: boolean; matchSpeed: number; sound: boolean; reduceMotion: boolean; assistantSubs: boolean }

interface GameState {
  raw?: RawDb
  dbError?: string
  loadingDb: boolean
  world?: World
  v: number
  saveId?: string
  tab: Tab
  stacks: Record<Tab, Route[]>
  overlay: Route[]
  live?: LiveMatch
  advancing: boolean
  advanceLabel?: string
  lastStop?: StopReason
  toast?: { id: number; text: string; kind: 'ok' | 'err' | 'info' }
  prefs: AppPrefs
  saves: SaveMeta[]
  loadDb: () => Promise<RawDb | undefined>
  refreshSaves: () => Promise<void>
  startCareer: (opts: NewCareerOptions) => Promise<void>
  loadCareer: (id: string) => Promise<boolean>
  deleteCareer: (id: string) => Promise<void>
  exitToMenu: () => void
  save: (auto?: boolean) => Promise<void>
  mutate: (fn: (w: World) => void, opts?: { save?: boolean; roster?: boolean }) => void
  bump: () => void
  setTab: (t: Tab) => void
  go: (r: Route) => void
  back: () => void
  resetTab: () => void
  open: (r: Route) => void
  close: () => void
  closeAll: () => void
  advance: () => Promise<StopReason | undefined>
  setLive: (l?: LiveMatch) => void
  notify: (text: string, kind?: 'ok' | 'err' | 'info') => void
  setPrefs: (p: Partial<AppPrefs>) => void
}

const emptyStacks = (): Record<Tab, Route[]> => ({ central: [], squad: [], transfers: [], academy: [], season: [] })
let saveTimer: number | undefined
let toastN = 0

export function haptic(kind: 'light' | 'medium' | 'heavy' = 'light') {
  try {
    if (!useGame.getState().prefs.haptics) return
    const ms = kind === 'light' ? 8 : kind === 'medium' ? 16 : 30
    navigator.vibrate?.(ms)
  } catch { /* unsupported */ }
}

export const useGame = create<GameState>((set, get) => ({
  loadingDb: false,
  v: 0,
  tab: 'central',
  stacks: emptyStacks(),
  overlay: [],
  advancing: false,
  prefs: { haptics: true, matchSpeed: 1, sound: false, reduceMotion: false, assistantSubs: false },
  saves: [],

  async loadDb() {
    if (get().raw) return get().raw
    set({ loadingDb: true })
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}data/world.json`)
      const raw = (await res.json()) as RawDb
      set({ raw, loadingDb: false })
      return raw
    } catch (e: any) {
      set({ loadingDb: false, dbError: String(e?.message || e) })
      return undefined
    }
  },

  async refreshSaves() {
    try { set({ saves: await listSaves() }) } catch { set({ saves: [] }) }
    const p = await getKV<AppPrefs>('prefs').catch(() => undefined)
    if (p) set({ prefs: { ...get().prefs, ...p } })
  },

  async startCareer(opts) {
    const raw = await get().loadDb()
    if (!raw) return
    const w = createWorld(raw, opts)
    careerIntro(w)
    w.flags.assistantSubs = get().prefs.assistantSubs
    set({ world: w, saveId: w.meta.id, v: get().v + 1, tab: 'central', stacks: emptyStacks(), overlay: [] })
    await get().save(false)
  },

  async loadCareer(id) {
    const w = await loadSave(id)
    if (!w) return false
    touchRoster(w)
    set({ world: w, saveId: id, v: get().v + 1, tab: 'central', stacks: emptyStacks(), overlay: [], live: undefined })
    await setKV('lastSave', id)
    return true
  },

  async deleteCareer(id) {
    await deleteSave(id)
    await get().refreshSaves()
  },

  exitToMenu() {
    set({ world: undefined, saveId: undefined, live: undefined, overlay: [], stacks: emptyStacks(), tab: 'central' })
    get().refreshSaves()
  },

  async save(auto = true) {
    const w = get().world
    if (!w) return
    const club = w.clubs[w.userClubId]
    const comp = Object.values(w.competitions).find((c) => c.season === w.season && c.format === 'league' && c.clubs.includes(w.userClubId))
    try {
      await saveCareer(w, {
        id: get().saveId || w.meta.id, name: w.meta.saveName || `${club.name} Career`, managerName: `${w.user.firstName} ${w.user.lastName}`,
        clubId: club.id, clubName: club.name, date: w.date, season: w.season, playTimeMin: w.meta.playTimeMin,
        leagueName: w.leagues[club.leagueId]?.short || club.country, position: comp ? positionOf(w, comp, club.id) : undefined, auto,
      })
      if (!auto) get().notify('Career saved', 'ok')
    } catch (e) {
      get().notify('Save failed — storage unavailable', 'err')
    }
  },

  mutate(fn, opts = {}) {
    const w = get().world
    if (!w) return
    fn(w)
    if (opts.roster) touchRoster(w)
    set({ v: get().v + 1 })
    if (opts.save !== false) {
      window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(() => get().save(true), 2500)
    }
  },

  bump() { set({ v: get().v + 1 }) },

  setTab(t) {
    if (get().tab === t) { set({ stacks: { ...get().stacks, [t]: [] } }); return }
    set({ tab: t })
    haptic()
  },
  go(r) {
    const t = get().tab
    set({ stacks: { ...get().stacks, [t]: [...get().stacks[t], r] } })
    haptic()
  },
  back() {
    if (get().overlay.length) { get().close(); return }
    const t = get().tab
    const s = get().stacks[t]
    if (s.length) set({ stacks: { ...get().stacks, [t]: s.slice(0, -1) } })
  },
  resetTab() { set({ stacks: { ...get().stacks, [get().tab]: [] } }) },
  open(r) { set({ overlay: [...get().overlay, r] }); haptic() },
  close() { set({ overlay: get().overlay.slice(0, -1) }) },
  closeAll() { set({ overlay: [] }) },

  async advance() {
    const w = get().world
    if (!w || get().advancing) return
    set({ advancing: true })
    let stop: StopReason = 'limit'
    const started = Date.now()
    try {
      // step day by day so the calendar animates and the UI stays responsive
      for (let i = 0; i < 120; i++) {
        const r = advanceWorld(w, 1)
        set({ v: get().v + 1, advanceLabel: w.date })
        stop = r.stop
        if (stop !== 'limit') break
        await new Promise((res) => setTimeout(res, get().prefs.reduceMotion ? 0 : 90))
      }
    } finally {
      w.meta.playTimeMin += Math.round((Date.now() - started) / 60000)
      set({ advancing: false, lastStop: stop, v: get().v + 1 })
    }
    if (stop === 'match') get().open({ name: 'prematch' })
    else if (stop === 'season-end') get().open({ name: 'seasonReview', params: { season: w.season - 1 } })
    else if (stop === 'sacked') get().open({ name: 'jobs' })
    get().save(true)
    return stop
  },

  setLive(l) { set({ live: l, v: get().v + 1 }) },

  notify(text, kind = 'info') {
    const id = ++toastN
    set({ toast: { id, text, kind } })
    window.setTimeout(() => { if (get().toast?.id === id) set({ toast: undefined }) }, 2600)
  },

  setPrefs(p) {
    set({ prefs: { ...get().prefs, ...p } })
    setKV('prefs', get().prefs).catch(() => {})
    const w = get().world
    if (w && p.assistantSubs !== undefined) w.flags.assistantSubs = p.assistantSubs
  },
}))

export function useWorld(): World {
  useGame((s) => s.v)
  return useGame.getState().world as World
}
