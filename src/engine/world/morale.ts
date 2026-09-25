import type { Conversation, Player, PlayerPromise, World } from '../../domain/types'
import { Rng, clamp } from '../../domain/rng'
import { addDays, ageOn, fmtDate } from '../../domain/dates'
import { ROLE_EXPECTED_SHARE } from '../../domain/constants'
import { rosterOf } from './roster'
import { sendInbox } from './messages'
import { yearsLeft } from './transfers'

export function minutesShare(w: World, p: Player): number {
  const m = p.recentMins
  if (!m || !m.length) return ROLE_EXPECTED_SHARE[p.contract.role] || 0.4
  return m.reduce((a, b) => a + b, 0) / (m.length * 90)
}

export function clubForm(w: World, clubId: number): number {
  const r = w.clubs[clubId]?.recent || []
  return r.slice(-5).reduce((a, x) => a + (x === 'W' ? 1 : x === 'L' ? -1 : 0), 0)
}

/** Weekly morale model for a club's squad (all clubs, lightweight for AI). */
export function weeklyMorale(w: World, clubId: number, rng: Rng, detailed: boolean) {
  const form = clubForm(w, clubId)
  for (const p of rosterOf(w, clubId)) {
    let target = 64 + form * 3
    if (detailed) {
      const share = minutesShare(w, p)
      const exp = ROLE_EXPECTED_SHARE[p.contract.role] || 0.4
      const gap = share - exp
      target += clamp(gap * 45, -30, 14)
      const yl = yearsLeft(w, p)
      if (yl <= 1 && (p.contract.role === 'Crucial' || p.contract.role === 'Important')) target -= 8
      if (p.injury) target -= 4
      const broken = w.promises.filter((x) => x.playerId === p.id && x.status === 'broken' && x.deadline >= addDays(w.date, -120)).length
      target -= broken * 18
      if (w.flags.transferRefused?.[p.id]) target -= 12
    }
    target = clamp(target, 5, 97)
    p.morale = clamp(p.morale + (target - p.morale) * 0.22 + rng.normal(0, 1.2), 0, 100)
  }
}

// ---------------------------------------------------------------- conversations
const CONV_COOLDOWN = 35

export function maybeConversations(w: World, rng: Rng) {
  const club = w.clubs[w.userClubId]
  if (!club) return
  const open = new Set(w.conversations.filter((c) => !c.resolved).map((c) => c.playerId))
  const recent = w.flags.convRecent || (w.flags.convRecent = {})
  for (const p of rosterOf(w, club.id)) {
    if (open.has(p.id)) continue
    if (recent[p.id] && recent[p.id] > addDays(w.date, -CONV_COOLDOWN)) continue
    const share = minutesShare(w, p)
    const exp = ROLE_EXPECTED_SHARE[p.contract.role] || 0.4
    const age = ageOn(p.dob, w.date)
    const yl = yearsLeft(w, p)
    // playing-time grievances need a meaningful sample of recent matches
    const sample = (p.recentMins?.length || 0) >= 4
    let conv: Omit<Conversation, 'id' | 'opened'> | null = null
    if (p.morale < 22 && rng.next() < 0.3) {
      conv = {
        playerId: p.id, kind: 'Transfer Request',
        prompt: `Boss, I've thought about this a lot. I'm not happy here and I think it's best for everyone if I move on. I'm asking to be transfer listed.`,
        options: [
          { id: 'list', text: 'I understand. We will listen to offers.', effect: 'list' },
          { id: 'role', text: 'Stay — I promise you a bigger role in this team.', effect: 'promiseRole' },
          { id: 'refuse', text: 'You are under contract. You are going nowhere.', effect: 'refuse' },
        ],
      }
    } else if (sample && share < exp - 0.28 && p.morale < 55 && rng.next() < 0.35 && !p.injury) {
      conv = {
        playerId: p.id, kind: 'Playing Time',
        prompt: `I came here to play football. I've barely featured recently and I expect to be playing more as a${/^[AEIOU]/.test(p.contract.role) ? 'n' : ''} ${p.contract.role.toLowerCase()} player.`,
        options: [
          { id: 'promise', text: 'You will start more matches over the next month.', effect: 'promiseStarts' },
          { id: 'cup', text: 'You will get your chances in the cups.', effect: 'promiseCup' },
          { id: 'earn', text: 'Keep working hard in training and earn your place.', effect: 'earn' },
          { id: 'loan', text: 'A loan move might be best for your development.', effect: 'loanList' },
        ],
      }
    } else if (yl <= 1 && (p.contract.role === 'Crucial' || p.contract.role === 'Important') && rng.next() < 0.12) {
      conv = {
        playerId: p.id, kind: 'Contract',
        prompt: `My contract runs out at the end of the season. I'd like to know where I stand — are you going to offer me a new deal?`,
        options: [
          { id: 'talks', text: "Absolutely. Let's open talks now.", effect: 'openRenewal' },
          { id: 'promise', text: 'You will get a new contract before the end of the season.', effect: 'promiseContract' },
          { id: 'later', text: "We'll discuss it when the time is right.", effect: 'later' },
        ],
      }
    } else if (sample && age <= 21 && p.pot - p.ovr >= 8 && share < 0.12 && rng.next() < 0.1) {
      conv = {
        playerId: p.id, kind: 'Development',
        prompt: `I want to keep improving and I need minutes. Could I go out on loan to play regular first-team football?`,
        options: [
          { id: 'loan', text: 'Good idea. We will find you the right loan.', effect: 'loanList' },
          { id: 'stay', text: 'Stay and fight — you will get cup minutes.', effect: 'promiseCup' },
          { id: 'no', text: 'You are part of my plans here.', effect: 'earn' },
        ],
      }
    } else if (p.morale > 88 && p.formRatings.length >= 3 && p.formRatings.slice(-3).every((r) => r >= 7.6) && rng.next() < 0.08) {
      conv = {
        playerId: p.id, kind: 'Thanks',
        prompt: `I just wanted to say thanks for the trust you're showing in me. I've never felt this sharp.`,
        options: [
          { id: 'keep', text: 'You deserve it. Keep it up.', effect: 'praise' },
          { id: 'more', text: "Don't get complacent — there's more to come.", effect: 'demand' },
        ],
      }
    }
    if (conv) {
      const c: Conversation = { ...conv, id: `c${w.nextIds.misc++}`, opened: w.date }
      w.conversations.push(c)
      recent[p.id] = w.date
      sendInbox(w, {
        from: p.name, fromRole: 'Player', category: 'Player', subject: conv.kind === 'Thanks' ? `${p.name} wants a word` : `${p.name}: ${conv.kind.toLowerCase()}`,
        body: c.prompt, actions: [{ label: 'Respond', action: 'openConversation', payload: c.id, primary: true }], playerId: p.id,
        urgent: conv.kind !== 'Thanks', image: { kind: 'player', id: p.id },
      })
      return // at most one new conversation per day
    }
  }
}

export function respondConversation(w: World, convId: string, optionId: string): string {
  const c = w.conversations.find((x) => x.id === convId)
  if (!c || c.resolved) return ''
  const p = w.players[c.playerId]
  const opt = c.options.find((o) => o.id === optionId)
  if (!opt || !p) return ''
  c.resolved = true
  c.choice = optionId
  const promise = (kind: PlayerPromise['kind'], days: number, req: number) => {
    w.promises.push({ id: `pr${w.nextIds.misc++}`, playerId: p.id, kind, made: w.date, deadline: addDays(w.date, days), requirement: req, progress: 0, status: 'active', baseline: startsOf(p) })
  }
  let reply = ''
  switch (opt.effect) {
    case 'list': p.transferListed = true; p.morale = clamp(p.morale + 18, 0, 100); reply = `"Thank you, boss. I'll stay professional until a deal is done."`; break
    case 'promiseRole': promise('Bigger Role', 60, 4); p.morale = clamp(p.morale + 14, 0, 100); reply = `"I'll hold you to that."`; break
    case 'refuse': p.morale = clamp(p.morale - 12, 0, 100); (w.flags.transferRefused ||= {})[p.id] = w.date; reply = `"You'll regret this."`; break
    case 'promiseStarts': promise('More Starts', 30, 3); p.morale = clamp(p.morale + 12, 0, 100); reply = `"That's all I ask. I won't let you down."`; break
    case 'promiseCup': promise('Cup Appearances', 60, 2); p.morale = clamp(p.morale + 7, 0, 100); reply = `"Okay, I'll be ready."`; break
    case 'earn': p.morale = clamp(p.morale - (p.hidden.professionalism > 65 ? 1 : 6), 0, 100); reply = p.hidden.professionalism > 65 ? `"Understood. I'll show you in training."` : `"I've been working hard. I'm not sure what more you want."`; break
    case 'loanList': p.loanListed = true; p.morale = clamp(p.morale + 8, 0, 100); promise('Loan Move', 45, 1); reply = `"Thanks, boss. I want to come back a better player."`; break
    case 'openRenewal': p.morale = clamp(p.morale + 6, 0, 100); w.flags.openRenewal = p.id; reply = `"Great, my agent will be in touch."`; break
    case 'promiseContract': promise('New Contract', 150, 1); p.morale = clamp(p.morale + 8, 0, 100); reply = `"I'm glad to hear that."`; break
    case 'later': p.morale = clamp(p.morale - 7, 0, 100); reply = `"I hope we can sort it soon."`; break
    case 'praise': p.morale = clamp(p.morale + 3, 0, 100); reply = `"Thanks, boss."`; break
    case 'demand': p.morale = clamp(p.morale - 1, 0, 100); p.hidden.professionalism = clamp(p.hidden.professionalism + 2, 0, 99); reply = `"You're right. I'll keep pushing."`; break
  }
  return reply
}

function startsOf(p: Player) {
  return Object.values(p.season).reduce((a, s) => a + s.starts, 0)
}
function cupAppsOf(w: World, p: Player) {
  return Object.entries(p.season).reduce((a, [k, s]) => a + (w.competitions[k]?.format === 'cup' ? s.apps : 0), 0)
}

export function checkPromises(w: World) {
  for (const pr of w.promises) {
    if (pr.status !== 'active') continue
    const p = w.players[pr.playerId]
    if (!p || p.clubId !== w.userClubId) { pr.status = pr.kind === 'Transfer' || pr.kind === 'Loan Move' ? 'fulfilled' : 'fulfilled'; continue }
    switch (pr.kind) {
      case 'More Starts': case 'Bigger Role': pr.progress = startsOf(p) - (pr.baseline || 0); break
      case 'Cup Appearances': pr.progress = cupAppsOf(w, p); break
      case 'New Contract': pr.progress = p.contract.signedOn > pr.made ? 1 : 0; break
      case 'Loan Move': pr.progress = p.loan ? 1 : 0; break
    }
    if (pr.progress >= pr.requirement) {
      pr.status = 'fulfilled'
      p.morale = clamp(p.morale + 8, 0, 100)
    } else if (w.date > pr.deadline) {
      pr.status = 'broken'
      p.morale = clamp(p.morale - 25, 0, 100)
      sendInbox(w, {
        from: p.name, fromRole: 'Player', category: 'Player', subject: `${p.name} feels let down`,
        body: `"You promised me ${pr.kind.toLowerCase()} by ${fmtDate(pr.deadline, 'dm')}. That hasn't happened and I'm very disappointed."`,
        actions: [{ label: 'View Player', action: 'openPlayer', payload: p.id, primary: true }], playerId: p.id, image: { kind: 'player', id: p.id },
      })
    }
  }
}
