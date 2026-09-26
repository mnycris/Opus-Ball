import type { Club, ContractOffer, Player, SquadRole, TransferOffer, TransferRecord, World } from '../../domain/types'
import { Rng, clamp } from '../../domain/rng'
import { addDays, ageOn, diffDays, fmtDate } from '../../domain/dates'
import { POS_GROUP } from '../../domain/constants'
import { dynamicValue, fmtMoney, roundValue, wageDemand } from '../../domain/finance'
import { allPlayers, rosterOf, setPlayerClub, touchRoster } from './roster'
import { postNews, sendInbox, staffNames } from './messages'
import { isWindowOpen } from '../competitions/calendar'
import { emptyLine } from './matchRunner'
import { bidBlock, clubLine, clubRelation, adjustRelation, sellerFloor, snubPenalty } from './negotiation'
import { callName } from '../match/commentary'

// how much above market value a club asks for a player, by his importance to them
const ROLE_MULT: Record<SquadRole, number> = { Crucial: 1.35, Important: 1.2, Rotation: 1.05, Sparingly: 0.9, Prospect: 1.15 }

export function yearsLeft(w: World, p: Player): number {
  const seasonEndYear = w.season + 1
  return p.contract.until - seasonEndYear + 1
}

export function askingPrice(w: World, p: Player, buyerId?: number): number {
  const club = w.clubs[p.clubId]
  if (!club) return 0
  // current market value (anchored to the real valuation, with contract length, form and injuries applied)
  let v = dynamicValue(p, w.date, p.valueCalib ?? 1)
  v *= ROLE_MULT[p.contract.role] || 1.2
  const yl = yearsLeft(w, p)
  if (yl === 2) v *= 0.92
  else if (yl >= 4) v *= 1.05
  if (p.transferListed) v *= 0.82
  if (buyerId && club.rivals.some((r) => r[0] === buyerId)) v *= 1.15
  v *= 0.95 + club.prestige.intl * 0.012
  if (p.joinedDate && diffDays(w.date, p.joinedDate) < 180) v *= 1.12
  if (buyerId) v *= 1 - clubRelation(w, club.id) / 500
  if (w.settings.transferDifficulty === 'Hard') v *= 1.12
  if (w.settings.transferDifficulty === 'Easy') v *= 0.9
  if (p.contract.releaseClause && v > p.contract.releaseClause) v = p.contract.releaseClause
  return roundValue(v)
}

/** Would the selling club even consider selling? */
export function sellerStance(w: World, p: Player, buyerId: number): { willing: boolean; reason?: string } {
  const club = w.clubs[p.clubId]
  if (!club) return { willing: true }
  if (p.untouchable) return { willing: false, reason: `${club.short} consider ${p.name} untouchable.` }
  const blocked = buyerId === w.userClubId ? bidBlock(w, p.id) : undefined
  if (blocked) return { willing: false, reason: `${club.short} refuse to discuss ${p.name} again until ${fmtDate(blocked.until, 'dm')} after the last talks collapsed.` }
  if (p.joinedDate && diffDays(w.date, p.joinedDate) < 60) return { willing: false, reason: `${p.name} only recently joined ${club.short}.` }
  const buyer = w.clubs[buyerId]
  const squad = rosterOf(w, club.id)
  const samePos = squad.filter((q) => POS_GROUP[q.positions[0]] === POS_GROUP[p.positions[0]] && q.id !== p.id).length
  if (samePos < 3 && p.contract.role === 'Crucial') return { willing: false, reason: `${club.short} have no cover for ${p.name}.` }
  if (p.contract.role === 'Crucial' && buyer && buyer.reputation < club.reputation - 5 && !p.contract.releaseClause) return { willing: false, reason: `${club.short} will not sell a key player to a smaller club.` }
  return { willing: true }
}

/** Player's interest in joining a club (0..100). */
export function playerInterest(w: World, p: Player, clubId: number): number {
  const to = w.clubs[clubId], from = w.clubs[p.clubId]
  if (!to) return 0
  const repDiff = to.reputation - (from?.reputation || 25)
  const lgTo = w.leagues[to.leagueId]?.prestige || 3, lgFrom = w.leagues[from?.leagueId || 0]?.prestige || 3
  let s = 55 + repDiff * 1.1 + (lgTo - lgFrom) * 3
  if (from && from.rivals.some((r) => r[0] === clubId)) s -= 25 + p.hidden.loyalty * 0.2
  if (p.contract.role === 'Sparingly' || p.contract.role === 'Rotation') s += 10
  if (p.morale < 40) s += 12
  s += (p.hidden.ambition - 50) * (repDiff > 0 ? 0.25 : -0.25)
  s -= (p.hidden.loyalty - 50) * 0.2
  const age = ageOn(p.dob, w.date)
  if (age >= 32 && (w.leagues[to.leagueId]?.wealth || 3) >= 8) s += 8
  if (to.id === w.userClubId) s += (w.user.reputation - 50) * 0.25 - snubPenalty(w, p.id)
  return clamp(Math.round(s), 0, 100)
}

export function roleForBuyer(w: World, p: Player, clubId: number): SquadRole {
  const squad = rosterOf(w, clubId).filter((q) => q.id !== p.id).sort((a, b) => b.ovr - a.ovr)
  const rank = squad.filter((q) => q.ovr > p.ovr).length
  const age = ageOn(p.dob, w.date)
  if (age <= 20 && p.pot - p.ovr >= 8 && rank > 8) return 'Prospect'
  if (rank < 3) return 'Crucial'
  if (rank < 9) return 'Important'
  if (rank < 16) return 'Rotation'
  return 'Sparingly'
}

export function contractDemand(w: World, p: Player, clubId: number, role: SquadRole): ContractOffer {
  const club = w.clubs[clubId]
  const wage = wageDemand(p, club, w.leagues[club.leagueId], role, w.date)
  const age = ageOn(p.dob, w.date)
  const years = age <= 23 ? 5 : age <= 27 ? 4 : age <= 30 ? 3 : age <= 32 ? 2 : 1
  return {
    wage, years, role, signingBonus: roundValue(wage * (3 + p.intlRep * 1.5)), releaseClause: 0,
    bonusGoal: POS_GROUP[p.positions[0]] === 'ATT' ? roundValue(wage * 0.08) : 0,
    bonusCleanSheet: POS_GROUP[p.positions[0]] === 'GK' || POS_GROUP[p.positions[0]] === 'DEF' ? roundValue(wage * 0.06) : 0,
    bonusApp: roundValue(wage * 0.04),
  }
}

// ---------------------------------------------------------------- user offers
export function makeOffer(w: World, o: Partial<TransferOffer> & { playerId: number; fee: number; type: TransferOffer['type'] }): TransferOffer {
  const p = w.players[o.playerId]
  const offer: TransferOffer = {
    id: `o${w.nextIds.offer++}`, playerId: p.id, fromClubId: o.fromClubId ?? w.userClubId, toClubId: p.clubId, type: o.type,
    fee: o.fee, sellOn: o.sellOn || 0, swapPlayerId: o.swapPlayerId, loanWageSplit: o.loanWageSplit, loanUntil: o.loanUntil,
    optionFee: o.optionFee, status: 'Offer Submitted', history: [{ date: w.date, by: 'buyer', text: offerText(w, o as TransferOffer), fee: o.fee }],
    patience: o.patience ?? 100, created: w.date, respondBy: addDays(w.date, 1), userIsBuyer: (o.fromClubId ?? w.userClubId) === w.userClubId,
    userIsSeller: p.clubId === w.userClubId, delegated: o.delegated,
  }
  w.transfers.offers[offer.id] = offer
  if (offer.userIsBuyer) {
    w.transfers.targets[p.id] = { playerId: p.id, added: w.transfers.targets[p.id]?.added || w.date, status: 'Offer Submitted', offerId: offer.id }
  }
  return offer
}

function offerText(w: World, o: TransferOffer) {
  const swap = o.swapPlayerId ? ` + ${w.players[o.swapPlayerId]?.name}` : ''
  if (o.type.startsWith('loan')) return `Loan offer${o.optionFee ? ` with ${o.type === 'loan-obligation' ? 'obligation' : 'option'} to buy for ${fmtMoney(o.optionFee)}` : ''}, ${o.loanWageSplit ?? 50}% wages`
  return `${fmtMoney(o.fee)}${swap}${o.sellOn ? `, ${o.sellOn}% sell-on` : ''}`
}

/** Selling club (AI) evaluates an offer. Mutates the offer with the response. */
export function evaluateOffer(w: World, o: TransferOffer, rng: Rng): 'accept' | 'counter' | 'reject' | 'walk' {
  const p = w.players[o.playerId]
  if (!p || p.clubId !== o.toClubId) { o.status = 'Negotiations Failed'; return 'walk' }
  const stance = sellerStance(w, p, o.fromClubId)
  const seller = w.clubs[o.toClubId]
  if (!stance.willing) {
    o.status = 'Offer Rejected'
    o.history.push({ date: w.date, by: 'seller', text: stance.reason || 'Not for sale.' })
    o.patience -= 40
    return o.patience <= 0 ? 'walk' : 'reject'
  }
  if (o.type.startsWith('loan')) {
    const age = ageOn(p.dob, w.date)
    const ok = (p.contract.role === 'Sparingly' || p.contract.role === 'Prospect' || p.loanListed || (p.contract.role === 'Rotation' && age <= 23)) && (o.loanWageSplit ?? 50) >= 40
    if (ok) { o.status = 'Offer Accepted'; o.history.push({ date: w.date, by: 'seller', text: `${seller.short} accept the loan proposal.` }); return 'accept' }
    o.status = 'Offer Rejected'
    o.history.push({ date: w.date, by: 'seller', text: `${seller.short} are not prepared to loan ${p.name}.` })
    o.patience -= 30
    return 'reject'
  }
  const ask = askingPrice(w, p, o.fromClubId)
  const floor = sellerFloor(w, o, ask, rng)
  let offered = o.fee + (o.sellOn ? ask * o.sellOn / 100 * 0.35 : 0)
  if (o.swapPlayerId) {
    const sp = w.players[o.swapPlayerId]
    if (sp) offered += sp.value * (seller.squadAvg <= sp.ovr + 2 ? 0.9 : 0.5)
  }
  if (p.contract.releaseClause && o.fee >= p.contract.releaseClause) {
    o.status = 'Offer Accepted'
    o.history.push({ date: w.date, by: 'seller', text: `Release clause of ${fmtMoney(p.contract.releaseClause)} met. ${seller.short} have no choice but to let him talk to you.` })
    return 'accept'
  }
  o.round = (o.round || 0) + 1
  const used = (o.used ||= [])
  const v = { seller: seller.short, p: callName(p.name) }
  const say = (key: Parameters<typeof clubLine>[1], fee?: number) => o.history.push({ date: w.date, by: 'seller', text: clubLine(rng, key, used, { ...v, fee: fee ? fmtMoney(fee) : '' }), fee })
  // their current position: first the asking price, then converging towards the hidden floor
  const position = o.counterFee || roundValue(Math.max(floor, ask * (1 + rng.next() * 0.05)))
  if (offered >= floor && (offered >= position * 0.975 || rng.next() < 0.25 + o.round * 0.2)) {
    o.status = 'Offer Accepted'
    say('accept')
    if (o.userIsBuyer) adjustRelation(w, seller.id, 2)
    return 'accept'
  }
  const ratio = offered / Math.max(1, floor)
  const repeat = o.history.filter((h) => h.by === 'buyer' && h.fee === o.fee).length > 1
  o.patience -= ratio < 0.6 ? 42 : ratio < 0.8 ? 24 : ratio < 0.95 ? 12 : 6
  if (repeat) o.patience -= 12
  if (o.patience <= 0) {
    o.status = 'Negotiations Failed'
    say('walk')
    if (o.userIsBuyer) {
      ;((w.flags.bidBlocked ||= {}) as Record<number, { until: string; reason: string; clubId: number }>)[p.id] = { until: addDays(w.date, 28 + Math.round(rng.next() * 20)), reason: 'Talks collapsed', clubId: seller.id }
      adjustRelation(w, seller.id, -12)
    }
    return 'walk'
  }
  if (ratio < 0.55) {
    o.status = 'Offer Rejected'
    say('insult')
    if (o.userIsBuyer) adjustRelation(w, seller.id, -4)
    return 'reject'
  }
  // concede part of the way towards the bid, never below the floor
  const concession = seller.finance.balance < 0 ? 0.42 : p.transferListed ? 0.5 : 0.3
  const next = o.counterFee ? roundValue(Math.max(floor, position - (position - offered) * concession)) : position
  const moved = !!o.counterFee && next < o.counterFee
  o.counterFee = Math.max(next, roundValue(o.fee * 1.02))
  o.status = 'Counter Offer'
  say(ratio < 0.8 ? 'low' : moved ? 'counterMove' : 'counter', o.counterFee)
  if (o.patience < 30) say('warn')
  return 'counter'
}

/** Player evaluates contract terms from the buying/renewing club. */
export function evaluateContract(w: World, p: Player, clubId: number, c: ContractOffer, attempt: number, rng: Rng): { result: 'accept' | 'counter' | 'reject'; demand: ContractOffer; mood: number; text: string } {
  const role = c.role
  const demand = contractDemand(w, p, clubId, roleForBuyer(w, p, clubId) === 'Crucial' ? 'Crucial' : role)
  const interest = clubId === p.clubId ? 60 + (p.morale - 50) * 0.5 : playerInterest(w, p, clubId)
  if (interest < 18) return { result: 'reject', demand, mood: 0, text: `${p.name} is not interested in joining ${w.clubs[clubId].short}.` }
  const expectedRole = roleForBuyer(w, p, clubId)
  const roleGap = rankOf(expectedRole) - rankOf(role) // positive: offering a smaller role than expected
  const wageRatio = c.wage / demand.wage
  const bonusValue = c.signingBonus / Math.max(1, demand.signingBonus)
  let score = 50 + (wageRatio - 1) * 160 + (bonusValue - 1) * 12 - roleGap * 14 + (interest - 55) * 0.4
  const age = ageOn(p.dob, w.date)
  const yearsPref = demand.years
  score -= Math.abs(c.years - yearsPref) * (age >= 30 && c.years < yearsPref ? 8 : 3)
  if (c.releaseClause > 0) score += 4 + (c.releaseClause < p.value * 1.5 ? 6 : 0)
  score += (c.bonusGoal + c.bonusCleanSheet + c.bonusApp) / Math.max(1, demand.wage) * 20
  score -= (attempt - 1) * 3
  score += rng.normal(0, 4)
  if (score >= 55) return { result: 'accept', demand, mood: score, text: `${p.name}'s agent: "We have a deal."` }
  if (attempt >= 3 && score < 45) return { result: 'reject', demand, mood: score, text: `${p.name}'s agent: "We're too far apart. My client has decided to walk away."` }
  const need = roleGap > 0 ? `a ${expectedRole.toLowerCase()} role and ` : ''
  return { result: 'counter', demand, mood: score, text: `${p.name}'s agent: "My client expects ${need}${fmtMoney(demand.wage)}/wk over ${demand.years} years."` }
}

const rankOf = (r: SquadRole) => ({ Crucial: 0, Important: 1, Rotation: 2, Sparingly: 3, Prospect: 3 } as Record<SquadRole, number>)[r]

// ---------------------------------------------------------------- execution
export function executeTransfer(w: World, o: TransferOffer, terms?: ContractOffer) {
  const p = w.players[o.playerId]
  const from = w.clubs[o.toClubId], to = w.clubs[o.fromClubId]
  if (!p || !to) return
  const isLoan = o.type.startsWith('loan')
  const fee = isLoan ? 0 : o.fee
  if (from) {
    from.finance.balance += fee
    from.finance.transferBudget += Math.round(fee * (from.id === w.userClubId ? boardReinvest(w) : 0.8))
    if (from.id === w.userClubId && fee) from.finance.ledger.push({ date: w.date, label: `Sale of ${p.name}`, amount: fee, kind: 'transfer' })
  }
  to.finance.balance -= fee
  to.finance.transferBudget = Math.max(0, to.finance.transferBudget - fee)
  if (to.id === w.userClubId && fee) to.finance.ledger.push({ date: w.date, label: `Signing of ${p.name}`, amount: -fee, kind: 'transfer' })
  // swap player
  if (o.swapPlayerId && from) {
    const sp = w.players[o.swapPlayerId]
    if (sp) {
      recordHistory(w, sp, sp.clubId, from.id, 0, 'transfer')
      setPlayerClub(w, sp, from.id)
      sp.contract = { ...sp.contract, role: roleForBuyer(w, sp, from.id), signedOn: w.date }
      sp.joinedDate = w.date
    }
  }
  const prevClub = p.clubId
  recordHistory(w, p, prevClub, to.id, fee, isLoan ? 'loan' : prevClub ? 'transfer' : 'free')
  closeCareerEntry(w, p)
  if (isLoan) {
    p.loan = { fromClubId: prevClub, until: `${w.season + 1}-06-30`, wageSplit: o.loanWageSplit ?? 50, optionFee: o.optionFee, obligation: o.type === 'loan-obligation', recallable: true, expectation: terms?.role }
  } else {
    p.loan = undefined
    const role = terms?.role || roleForBuyer(w, p, to.id)
    const c = terms || contractDemand(w, p, to.id, role)
    p.contract = {
      until: w.season + (w.date >= `${w.season}-07-01` && w.date < `${w.season + 1}-01-01` ? c.years : c.years), wage: c.wage, role, releaseClause: c.releaseClause,
      signedOn: w.date, signingBonus: c.signingBonus, bonuses: { goal: c.bonusGoal, cleanSheet: c.bonusCleanSheet, appearance: c.bonusApp },
    }
    p.wage = c.wage
    if (c.signingBonus && to.id === w.userClubId) {
      to.finance.balance -= c.signingBonus
      to.finance.ledger.push({ date: w.date, label: `Signing bonus: ${p.name}`, amount: -c.signingBonus, kind: 'bonus' })
    }
  }
  setPlayerClub(w, p, to.id)
  p.joinedDate = w.date
  p.transferListed = false
  p.loanListed = false
  p.untouchable = false
  p.jersey = freeNumber(w, to.id, p)
  p.morale = clamp(p.morale + 12, 0, 100)
  p.yellowAccum = {}
  o.status = 'Completed'
  if (o.userIsBuyer) w.transfers.targets[p.id] = { ...(w.transfers.targets[p.id] || { playerId: p.id, added: w.date }), status: 'Completed' }
  w.transfers.shortlist = w.transfers.shortlist.filter((id) => id !== p.id || o.userIsBuyer === false)
  // remove from team sheets of the old club
  if (from) for (const s of from.sheets) {
    s.lineup = s.lineup.map((id) => (id === p.id ? 0 : id))
    s.bench = s.bench.filter((id) => id !== p.id)
  }
  // news
  const big = fee >= 30_000_000 || p.ovr >= 82 || to.id === w.userClubId || from?.id === w.userClubId
  if (big || fee >= 8_000_000) {
    const verb = isLoan ? 'joins on loan' : fee ? `completes ${fmtMoney(fee)} move` : 'signs on a free transfer'
    postNews(w, {
      headline: `${p.name} ${verb} to ${to.short}`,
      body: isLoan ? `${to.name} have agreed a season-long loan for ${p.name} from ${from?.name}.` : fee
        ? `${to.name} have completed the signing of ${p.name} from ${from?.name ?? 'free agency'} for a reported ${fmtMoney(fee)}. The ${ageOn(p.dob, w.date)}-year-old ${p.positions[0]} has signed a ${p.contract.until - w.season}-year contract.`
        : `${p.name} has joined ${to.name} as a free agent.`,
      kind: 'transfer', playerIds: [p.id], clubIds: [to.id, ...(from ? [from.id] : [])], importance: fee >= 60_000_000 ? 5 : fee >= 25_000_000 ? 4 : 3,
      userRelated: to.id === w.userClubId || from?.id === w.userClubId,
    })
  }
  if (!o.userIsBuyer && !o.userIsSeller) delete w.transfers.offers[o.id]
  if (o.userIsBuyer) {
    const staff = staffNames(w)
    sendInbox(w, {
      from: staff.director, fromRole: 'Sporting Director', category: 'Transfers', subject: `${p.name} has signed!`,
      body: `${p.name} has officially completed ${isLoan ? 'a loan move' : 'his transfer'} to ${to.name}${fee ? ` for ${fmtMoney(fee)}` : ''}. He's available for selection immediately.`,
      actions: [{ label: 'View Player', action: 'openPlayer', payload: p.id, primary: true }], playerId: p.id, image: { kind: 'player', id: p.id },
    })
  }
}

function boardReinvest(w: World) {
  const d = w.settings.difficulty
  return d === 'Beginner' || d === 'Amateur' ? 1 : d === 'Legendary' || d === 'Ultimate' ? 0.6 : 0.8
}

function freeNumber(w: World, clubId: number, p: Player): number {
  const used = new Set(rosterOf(w, clubId).filter((q) => q.id !== p.id).map((q) => q.jersey))
  if (p.jersey && !used.has(p.jersey)) return p.jersey
  const g = POS_GROUP[p.positions[0]]
  const pref = g === 'GK' ? [1, 13, 31] : g === 'DEF' ? [2, 3, 4, 5, 6, 15, 22, 24] : g === 'MID' ? [8, 10, 6, 14, 16, 17, 18, 20] : [9, 7, 11, 19, 10, 17, 18, 29]
  for (const n of pref) if (!used.has(n)) return n
  for (let n = 21; n < 99; n++) if (!used.has(n)) return n
  return 99
}

function recordHistory(w: World, p: Player, from: number, to: number, fee: number, type: TransferRecord['type']) {
  w.transfers.history.unshift({ date: w.date, playerId: p.id, playerName: p.name, from, to, fee, type, season: w.season })
  if (w.transfers.history.length > 1500) w.transfers.history.length = 1500
}

export function closeCareerEntry(w: World, p: Player) {
  const apps = Object.values(p.season).reduce((a, s) => a + s.apps, 0)
  if (!apps || !p.clubId) return
  const sum = Object.values(p.season).reduce((a, s) => ({ goals: a.goals + s.goals, assists: a.assists + s.assists, cs: a.cs + s.cleanSheets, r: a.r + s.ratingSum, n: a.n + s.rated }), { goals: 0, assists: 0, cs: 0, r: 0, n: 0 })
  p.career.push({ season: w.season, clubId: p.clubId, loan: !!p.loan, apps, goals: sum.goals, assists: sum.assists, cleanSheets: sum.cs, ratingAvg: sum.n ? Math.round((sum.r / sum.n) * 100) / 100 : 0, ovr: p.ovr })
  p.season = {}
}

export function releasePlayer(w: World, p: Player, compensation = true) {
  const club = w.clubs[p.clubId]
  if (club && compensation) {
    const remaining = Math.max(0, p.contract.until - w.season) * p.contract.wage * 52 * 0.5
    club.finance.balance -= remaining
    if (club.id === w.userClubId) club.finance.ledger.push({ date: w.date, label: `Contract termination: ${p.name}`, amount: -remaining, kind: 'other' })
  }
  recordHistory(w, p, p.clubId, 0, 0, 'release')
  closeCareerEntry(w, p)
  setPlayerClub(w, p, 0)
  p.contract = { ...p.contract, until: 0, role: 'Rotation' }
  p.transferListed = false
  p.loanListed = false
}

// ---------------------------------------------------------------- AI market
interface Need { group: string; pos?: string; minOvr: number; maxAge: number; priority: number }

export function clubNeeds(w: World, club: Club): Need[] {
  const squad = rosterOf(w, club.id)
  const needs: Need[] = []
  const avg = club.squadAvg
  const by = (g: string) => squad.filter((p) => POS_GROUP[p.positions[0]] === g && !p.injury?.totalDays || POS_GROUP[p.positions[0]] === g && (p.injury?.totalDays || 0) < 60)
  const want: Record<string, number> = { GK: 3, DEF: 8, MID: 8, ATT: 5 }
  for (const g of ['GK', 'DEF', 'MID', 'ATT']) {
    const list = by(g).sort((a, b) => b.ovr - a.ovr)
    const starters = g === 'GK' ? 1 : g === 'DEF' ? 4 : g === 'MID' ? 3 : 3
    const weakest = list[starters - 1]
    if (list.length < want[g]) needs.push({ group: g, minOvr: Math.round(avg - 5), maxAge: 30, priority: 2 + (want[g] - list.length) })
    if (!weakest || weakest.ovr < avg - 4) needs.push({ group: g, minOvr: Math.round(avg - 1), maxAge: 29, priority: 3 })
    const old = list.slice(0, starters).filter((p) => ageOn(p.dob, w.date) >= 33)
    if (old.length) needs.push({ group: g, minOvr: Math.round(avg - 2), maxAge: 27, priority: 2 })
  }
  return needs.sort((a, b) => b.priority - a.priority)
}

export function aiTransferDay(w: World, rng: Rng) {
  if (!w.settings.aiTransfers || !isWindowOpen(w)) return
  const win = w.windows.find((x) => w.date >= x.open && w.date <= x.close)!
  const daysLeft = diffDays(win.close, w.date)
  const deadline = daysLeft === 0
  const intensity = deadline ? 3.5 : daysLeft <= 3 ? 1.8 : win.name === 'Summer' ? 1 : 0.55
  const clubs = Object.values(w.clubs).filter((c) => c.id !== w.userClubId)
  const n = Math.round(clubs.length * 0.018 * intensity)
  for (let i = 0; i < n; i++) {
    const club = rng.pick(clubs)
    const needs = clubNeeds(w, club)
    if (!needs.length) { aiSellSurplus(w, club, rng); continue }
    const need = needs[0]
    const target = findTarget(w, club, need, rng)
    if (!target) continue
    if (target.clubId === w.userClubId) { aiBidForUserPlayer(w, club, target, rng); continue }
    const ask = target.clubId ? askingPrice(w, target, club.id) : 0
    if (ask > club.finance.transferBudget) continue
    const stance = target.clubId ? sellerStance(w, target, club.id) : { willing: true }
    if (!stance.willing) continue
    if (playerInterest(w, target, club.id) < 40) continue
    const fee = target.clubId ? roundValue(ask * (0.92 + rng.next() * 0.12)) : 0
    const o = makeOffer(w, { playerId: target.id, fee, type: target.clubId ? 'transfer' : 'free', fromClubId: club.id })
    o.userIsBuyer = false
    executeTransfer(w, o)
    club.transferPolicy = { lastActivity: w.date }
  }
  // rumours
  if (rng.next() < 0.35 * intensity) rumour(w, rng)
}

function aiSellSurplus(w: World, club: Club, rng: Rng) {
  const squad = rosterOf(w, club.id)
  if (squad.length <= 28) return
  const surplus = squad.filter((p) => p.contract.role === 'Sparingly').sort((a, b) => a.ovr - b.ovr)[0]
  if (surplus && rng.next() < 0.5) surplus.transferListed = true
}

function findTarget(w: World, club: Club, need: Need, rng: Rng): Player | undefined {
  const lg = w.leagues[club.leagueId]
  const budget = club.finance.transferBudget
  let best: Player | undefined, bs = -1
  // sample the market for performance
  const all = allPlayers(w)
  for (let k = 0; k < 900; k++) {
    const p = all[Math.floor(rng.next() * all.length)]
    if (p.clubId === club.id || p.academy || p.loan || p.retiringAtSeasonEnd) continue
    if (p.ovr < need.minOvr || p.ovr > club.squadAvg + 7) continue
    if (POS_GROUP[p.positions[0]] !== need.group) continue
    const age = ageOn(p.dob, w.date)
    if (age > need.maxAge) continue
    const cost = p.clubId ? p.value * 1.4 : 0
    if (cost > budget) continue
    const from = w.clubs[p.clubId]
    if (from && from.reputation > club.reputation + 12) continue
    const score = p.ovr + (p.pot - p.ovr) * 0.3 - cost / Math.max(1, budget) * 6 + rng.next() * 3 + (lg && from?.leagueId === lg.id ? 1 : 0)
    if (score > bs) { bs = score; best = p }
  }
  return best
}

function aiBidForUserPlayer(w: World, club: Club, p: Player, rng: Rng) {
  if (Object.values(w.transfers.offers).some((o) => o.playerId === p.id && o.userIsSeller && ['Offer Submitted', 'Counter Offer'].includes(o.status))) return
  if (p.untouchable) return
  const ask = askingPrice(w, p, club.id)
  const fee = roundValue(ask * (0.75 + rng.next() * 0.3))
  if (fee > club.finance.transferBudget * 1.1) return
  const o = makeOffer(w, { playerId: p.id, fee, type: 'transfer', fromClubId: club.id })
  o.userIsBuyer = false
  o.userIsSeller = true
  o.status = 'Offer Submitted'
  o.respondBy = addDays(w.date, 3)
  const staff = staffNames(w)
  sendInbox(w, {
    from: staff.director, fromRole: 'Sporting Director', category: 'Transfers', subject: `Offer received for ${p.name}`,
    body: `${club.name} have submitted an offer of ${fmtMoney(fee)} for ${p.name}. His current market value is ${fmtMoney(p.value)}. We need to respond by ${fmtDate(o.respondBy!, 'dm')}.`,
    actions: [
      { label: 'Accept', action: 'acceptBid', payload: o.id, primary: true },
      { label: 'Negotiate', action: 'negotiateBid', payload: o.id },
      { label: 'Reject', action: 'rejectBid', payload: o.id, danger: true },
    ],
    playerId: p.id, clubId: club.id, urgent: true, expires: o.respondBy, image: { kind: 'club', id: club.id },
  })
}

function rumour(w: World, rng: Rng) {
  const top = Object.values(w.players).filter((p) => p.ovr >= 80 && p.clubId)
  const p = rng.pick(top)
  const clubs = Object.values(w.clubs).filter((c) => c.reputation >= (w.clubs[p.clubId]?.reputation || 50) - 3 && c.id !== p.clubId && c.leagueId)
  if (!clubs.length) return
  const c = rng.pick(clubs)
  p.interestedClubs = [...new Set([...(p.interestedClubs || []), c.id])].slice(-4)
  postNews(w, {
    headline: rng.pick([`${c.short} monitoring ${p.name}`, `${p.name} emerges as ${c.short} target`, `${c.short} weigh up move for ${p.name}`, `Scouts from ${c.short} watch ${p.name}`]),
    body: `${c.name} are understood to be tracking ${w.clubs[p.clubId].name}'s ${p.name}. The ${ageOn(p.dob, w.date)}-year-old is valued at around ${fmtMoney(p.value)}.`,
    kind: 'rumour', playerIds: [p.id], clubIds: [c.id, p.clubId], importance: 2, userRelated: p.clubId === w.userClubId || c.id === w.userClubId,
  })
}

/** Resolve user offers awaiting a response (called daily). */
export function processOffers(w: World, rng: Rng) {
  for (const o of Object.values(w.transfers.offers)) {
    if (o.userIsBuyer && o.status === 'Offer Submitted' && o.respondBy && w.date >= o.respondBy) {
      const res = evaluateOffer(w, o, rng)
      const p = w.players[o.playerId]
      const seller = w.clubs[o.toClubId]
      const t = w.transfers.targets[p.id]
      if (t) t.status = o.status
      const staff = staffNames(w)
      const actions = res === 'accept'
        ? [{ label: 'Negotiate Contract', action: 'openContract', payload: o.id, primary: true }]
        : res === 'counter' ? [{ label: `Accept ${fmtMoney(o.counterFee!)}`, action: 'acceptCounter', payload: o.id, primary: true }, { label: 'Revise Offer', action: 'openOffer', payload: p.id }]
          : res === 'reject' ? [{ label: 'Revise Offer', action: 'openOffer', payload: p.id, primary: true }] : []
      sendInbox(w, {
        from: staff.director, fromRole: 'Sporting Director', category: 'Transfers',
        subject: res === 'accept' ? `${seller.short} accept offer for ${p.name}` : res === 'counter' ? `${seller.short} counter-offer for ${p.name}` : res === 'walk' ? `${seller.short} end talks for ${p.name}` : `${seller.short} reject offer for ${p.name}`,
        body: o.history[o.history.length - 1].text + (res === 'accept' ? ` We can now open contract talks with ${p.name}'s representatives.` : ''),
        actions, playerId: p.id, clubId: seller.id, urgent: res === 'accept' || res === 'counter', image: { kind: 'player', id: p.id },
      })
    }
    // AI bids expiring for user players
    if (o.userIsSeller && o.status === 'Offer Submitted' && o.respondBy && w.date > o.respondBy) {
      o.status = 'Negotiations Failed'
    }
  }
}

export function ensureSeason(p: Player, key: string) {
  return (p.season[key] ||= emptyLine())
}
