import type { Club, World } from '../../domain/types'
import { Rng, clamp } from '../../domain/rng'
import { addDays, fmtDate } from '../../domain/dates'
import { positionOf } from '../competitions/tables'
import { expectedRank } from './board'
import { postNews, sendInbox, staffNames } from './messages'

/** Weekly AI manager review: underperforming managers get sacked and replaced. */
export function aiManagerReview(w: World, rng: Rng) {
  for (const club of Object.values(w.clubs)) {
    if (club.id === w.userClubId || !club.leagueId) continue
    const mgr = w.managers[club.managerId]
    if (!mgr) continue
    const comp = w.competitions[`L${club.leagueId}-${w.season}`]
    const row = comp?.table?.find((r) => r.clubId === club.id)
    if (!row || row.p < 9) continue
    const pos = positionOf(w, comp, club.id)
    const exp = expectedRank(w, club)
    const n = comp.clubs.length
    const gap = (pos - exp) / n
    const ppg = row.pts / row.p
    let risk = 0
    if (gap > 0.35) risk += 0.05
    if (gap > 0.5) risk += 0.08
    const rel = comp.rules.rele ? pos > n - comp.rules.rele : false
    if (rel && exp < n - 3) risk += 0.06
    if (ppg < 1 && exp <= n / 2) risk += 0.04
    if (row.form.slice(-5).filter((x) => x === 'L').length >= 4) risk += 0.05
    if (mgr.appointed && mgr.appointed > addDays(w.date, -90)) risk *= 0.3
    if (rng.next() < risk) sackManager(w, club, rng)
  }
}

export function sackManager(w: World, club: Club, rng: Rng) {
  const old = w.managers[club.managerId]
  if (old) { old.clubId = 0; old.reputation = clamp(old.reputation - 4, 5, 99) }
  const pool = Object.values(w.managers).filter((m) => m.clubId === 0 && !m.retired)
  const fit = pool.sort((a, b) => Math.abs(a.reputation - club.reputation) - Math.abs(b.reputation - club.reputation))
  const next = fit[Math.floor(rng.next() * Math.min(3, fit.length))]
  // user job offer opportunity
  const userEligible = w.user.clubId !== club.id && w.user.reputation >= club.reputation - 12 && rng.next() < 0.55
  if (userEligible) {
    w.user.jobOffers.push({ clubId: club.id, date: w.date, expires: addDays(w.date, 7) })
    sendInbox(w, {
      from: `${club.name} Board`, fromRole: 'Chairman', category: 'Board', subject: `Job offer: ${club.name}`,
      body: `Following the departure of ${old?.name ?? 'their manager'}, ${club.name} would like to offer you the manager's job. The offer stands until ${fmtDate(addDays(w.date, 7), 'dm')}.`,
      actions: [{ label: 'View Offer', action: 'openJobOffer', payload: club.id, primary: true }], clubId: club.id, urgent: true, image: { kind: 'club', id: club.id },
    })
  }
  if (next) {
    next.clubId = club.id
    next.appointed = w.date
    club.managerId = next.id
    // new manager may bring a new shape
    const sheet = club.sheets[0]
    if (sheet) sheet.formation = next.formation
  }
  postNews(w, {
    headline: `${club.short} part company with ${old?.name ?? 'manager'}`,
    body: `${club.name} have dismissed ${old?.name ?? 'their manager'} following a run of poor results.${next ? ` ${next.name} has been appointed as the new head coach.` : ''}`,
    kind: 'manager', playerIds: [], clubIds: [club.id], importance: club.reputation >= 70 ? 4 : 2, userRelated: false,
  })
}

/** Board patience with the user: dismissal when confidence collapses. */
export function userJobSecurity(w: World): boolean {
  if (!w.settings.sacking) return false
  const threshold = w.settings.difficulty === 'Beginner' ? 8 : w.settings.difficulty === 'Legendary' || w.settings.difficulty === 'Ultimate' ? 25 : 16
  if (w.board.overall < threshold && w.date > addDays(w.seasonStart, 100)) {
    fireUser(w)
    return true
  }
  if (w.board.overall < threshold + 12 && !w.flags.boardWarned) {
    w.flags.boardWarned = w.date
    w.board.warnings++
    const staff = staffNames(w)
    sendInbox(w, { from: staff.chairman, fromRole: 'Chairman', category: 'Board', subject: 'A warning from the board', body: `The board is extremely concerned with the club's direction. Results and objectives must improve immediately, or we will be forced to act.`, actions: [{ label: 'View Objectives', action: 'openBoard', primary: true }], urgent: true })
  }
  return false
}

export function fireUser(w: World) {
  const club = w.clubs[w.userClubId]
  const h = w.user.history[w.user.history.length - 1]
  if (h) h.to = w.date
  w.user.sacked = w.date
  w.user.reputation = clamp(w.user.reputation - 10, 5, 100)
  // AI caretaker takes over
  const pool = Object.values(w.managers).filter((m) => m.clubId === 0 && !m.retired)
  const m = pool.sort((a, b) => b.reputation - a.reputation)[0]
  if (m) { m.clubId = club.id; club.managerId = m.id; m.appointed = w.date }
  w.flags.unemployed = true
  sendInbox(w, { from: `${club.name} Board`, fromRole: 'Chairman', category: 'Board', subject: 'You have been dismissed', body: `The board has decided to relieve you of your duties as manager of ${club.name}. We thank you for your service.`, actions: [{ label: 'Find a new job', action: 'openJobs', primary: true }], urgent: true })
  postNews(w, { headline: `${club.short} sack ${w.user.firstName} ${w.user.lastName}`, body: `${club.name} have dismissed ${w.user.firstName} ${w.user.lastName} after a disappointing run.`, kind: 'manager', playerIds: [], clubIds: [club.id], importance: 5, userRelated: true })
}

export function acceptJob(w: World, clubId: number) {
  const club = w.clubs[clubId]
  const prev = w.clubs[w.userClubId]
  if (!club) return
  const h = w.user.history[w.user.history.length - 1]
  if (h && !h.to) h.to = w.date
  // incumbent leaves
  const inc = w.managers[club.managerId]
  if (inc) inc.clubId = 0
  if (prev && prev.managerId === -1) {
    const pool = Object.values(w.managers).filter((m) => m.clubId === 0 && !m.retired && m.id !== inc?.id)
    const m = pool.sort((a, b) => b.reputation - a.reputation)[0]
    if (m) { m.clubId = prev.id; prev.managerId = m.id; m.appointed = w.date }
  }
  club.managerId = -1
  w.userClubId = clubId
  w.user.clubId = clubId
  w.user.jobOffers = []
  w.user.sacked = undefined
  w.flags.unemployed = false
  w.user.history.push({ clubId, from: w.date, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, trophies: [] })
  w.transfers.targets = {}
  w.transfers.shortlist = []
  for (const f of Object.values(w.fixtures)) f.userInvolved = f.home === clubId || f.away === clubId
  w.flags.staff = undefined
  w.flags.newJob = w.date
  postNews(w, { headline: `${club.short} appoint ${w.user.firstName} ${w.user.lastName}`, body: `${club.name} have appointed ${w.user.firstName} ${w.user.lastName} as their new manager.`, kind: 'manager', playerIds: [], clubIds: [clubId], importance: 4, userRelated: true })
}

export function vacancies(w: World): Club[] {
  return Object.values(w.clubs).filter((c) => c.leagueId && c.id !== w.userClubId && (!w.managers[c.managerId] || w.user.jobOffers.some((o) => o.clubId === c.id)))
}

export function applyForJob(w: World, clubId: number, rng: Rng): boolean {
  const club = w.clubs[clubId]
  const chance = clamp(0.6 + (w.user.reputation - club.reputation) / 40, 0.05, 0.95)
  return rng.next() < chance
}
