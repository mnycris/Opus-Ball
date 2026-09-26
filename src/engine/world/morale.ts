import type { Conversation, Player, PlayerPromise, World } from '../../domain/types'
import { Rng, clamp, hashString } from '../../domain/rng'
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
        prompt: rng.pick([
          `Boss, I've thought about this a lot. I'm not happy here and I think it's best for everyone if I move on. I'm asking to be transfer listed.`,
          `I'll be honest with you: my head isn't here anymore. I want to leave, and I'd like the club to accept offers.`,
          `I've spoken to my family and my agent. I need a new challenge. Please put me on the transfer list.`,
          `It's not working for me here. I don't want to cause problems, but I want to go, ideally this window.`,
        ]),
        options: [
          { id: 'list', text: 'I understand. We will listen to offers.', effect: 'list' },
          { id: 'role', text: 'Stay — I promise you a bigger role in this team.', effect: 'promiseRole' },
          { id: 'refuse', text: 'You are under contract. You are going nowhere.', effect: 'refuse' },
        ],
      }
    } else if (sample && share < exp - 0.28 && p.morale < 55 && rng.next() < 0.35 && !p.injury) {
      conv = {
        playerId: p.id, kind: 'Playing Time',
        prompt: rng.pick([
          `I came here to play football. I've barely featured recently and I expect to be playing more as a${/^[AEIOU]/.test(p.contract.role) ? 'n' : ''} ${p.contract.role.toLowerCase()} player.`,
          `${Math.round((p.recentMins || []).reduce((a, b) => a + b, 0))} minutes in our last ${(p.recentMins || []).length} games. Boss, that's not what we agreed when I signed.`,
          `Can I ask what I have to do to get in the team? I'm training well and still sitting on the bench.`,
          `I'm not getting any rhythm. If this carries on, my place in the national team is at risk too.`,
        ]),
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
        prompt: rng.pick([
          `My contract runs out at the end of the season. I'd like to know where I stand. Are you going to offer me a new deal?`,
          `Other clubs are asking my agent about my situation. I'd prefer to stay, but I need to know if the club wants me.`,
          `I love it here, but I'm entering the last year of my deal. Is there a plan for me beyond this season?`,
        ]),
        options: [
          { id: 'talks', text: "Absolutely. Let's open talks now.", effect: 'openRenewal' },
          { id: 'promise', text: 'You will get a new contract before the end of the season.', effect: 'promiseContract' },
          { id: 'later', text: "We'll discuss it when the time is right.", effect: 'later' },
        ],
      }
    } else if (sample && age <= 21 && p.pot - p.ovr >= 8 && share < 0.12 && rng.next() < 0.1) {
      conv = {
        playerId: p.id, kind: 'Development',
        prompt: rng.pick([
          `I want to keep improving and I need minutes. Could I go out on loan to play regular first-team football?`,
          `I feel ready for senior football every week. Would you consider sending me on loan somewhere I'll play?`,
          `Training with the first team is great, but I need matches. A loan could help me come back stronger.`,
        ]),
        options: [
          { id: 'loan', text: 'Good idea. We will find you the right loan.', effect: 'loanList' },
          { id: 'stay', text: 'Stay and fight — you will get cup minutes.', effect: 'promiseCup' },
          { id: 'no', text: 'You are part of my plans here.', effect: 'earn' },
        ],
      }
    } else if (p.morale > 88 && p.formRatings.length >= 3 && p.formRatings.slice(-3).every((r) => r >= 7.6) && rng.next() < 0.08) {
      conv = {
        playerId: p.id, kind: 'Thanks',
        prompt: rng.pick([
          `I just wanted to say thanks for the trust you're showing in me. I've never felt this sharp.`,
          `Boss, I'm loving my football right now. Thank you for believing in me.`,
          `The way we're playing suits me perfectly. I wanted you to know I'm fully committed.`,
        ]),
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
  // replies vary with the player's personality; hot-headed players answer differently from model professionals
  const hot = p.hidden.temperament > 68, pro = p.hidden.professionalism > 65
  const h = hashString(`${convId}:${optionId}`)
  const say = (lines: string[]) => `"${lines[h % lines.length]}"`
  let reply = ''
  switch (opt.effect) {
    case 'list': p.transferListed = true; p.morale = clamp(p.morale + 18, 0, 100); reply = say(["Thank you, boss. I'll stay professional until a deal is done.", "I appreciate the honesty. I'll give everything until I go.", 'Thanks. It is the right decision for both of us.', "I'll always respect this club. Thank you for understanding."]); break
    case 'promiseRole': promise('Bigger Role', 60, 4); p.morale = clamp(p.morale + 14, 0, 100); reply = say(["I'll hold you to that.", "That's what I wanted to hear. I won't let you down.", 'Okay. I believe you, boss.', "Then I'm all in. Let's go."]); break
    case 'refuse': p.morale = clamp(p.morale - (hot ? 16 : 10), 0, 100); (w.flags.transferRefused ||= {})[p.id] = w.date; reply = hot ? say(["You'll regret this.", "So that's how it is. My agent will hear about this.", "You can't keep me here forever.", "Unbelievable. I thought you were different."]) : say(["I'm disappointed, but I'll respect the decision. For now.", "I understand, but I won't pretend I'm happy.", "Fine. I'll keep my head down, but this isn't over."]); break
    case 'promiseStarts': promise('More Starts', 30, 3); p.morale = clamp(p.morale + 12, 0, 100); reply = say(["That's all I ask. I won't let you down.", "Thank you. You'll see what I can do.", 'Deal. Just give me the chance.', "I'll be ready from the first minute."]); break
    case 'promiseCup': promise('Cup Appearances', 60, 2); p.morale = clamp(p.morale + 7, 0, 100); reply = say(["Okay, I'll be ready.", "It's a start. I'll take it.", "Fine, but I want more than cup games eventually."]); break
    case 'earn': p.morale = clamp(p.morale - (pro ? 1 : 6), 0, 100); reply = pro ? say(["Understood. I'll show you in training.", "Fair enough. I'll make it impossible for you to leave me out.", "Okay, boss. Watch this week."]) : say(["I've been working hard. I'm not sure what more you want.", "Everyone else gets chances. Why not me?", "Right. We'll see."]); break
    case 'loanList': p.loanListed = true; p.morale = clamp(p.morale + 8, 0, 100); promise('Loan Move', 45, 1); reply = say(["Thanks, boss. I want to come back a better player.", 'Regular football is what I need right now. Thank you.', "I'll make you want me back next season."]); break
    case 'openRenewal': p.morale = clamp(p.morale + 6, 0, 100); w.flags.openRenewal = p.id; reply = say(['Great, my agent will be in touch.', "Brilliant. I want to stay, let's get it done.", "That means a lot. I'll tell my agent to call the club."]); break
    case 'promiseContract': promise('New Contract', 150, 1); p.morale = clamp(p.morale + 8, 0, 100); reply = say(["I'm glad to hear that.", "Good. I don't want to be left waiting too long.", "Okay. I'll trust you on that."]); break
    case 'later': p.morale = clamp(p.morale - (hot ? 10 : 6), 0, 100); reply = hot ? say(["Later? I've heard that before.", "Don't make me wait too long, boss."]) : say(['I hope we can sort it soon.', "Okay. I'll be patient, but not forever."]); break
    case 'praise': p.morale = clamp(p.morale + 3, 0, 100); reply = say(['Thanks, boss.', 'That means a lot coming from you.', "Appreciate it. I'll keep it going.", 'Thanks. The team makes it easy.']); break
    case 'demand': p.morale = clamp(p.morale - (hot ? 3 : 1), 0, 100); p.hidden.professionalism = clamp(p.hidden.professionalism + 2, 0, 99); reply = hot ? say(['Alright, alright. Message received.', "I'm already giving everything, but okay."]) : say(["You're right. I'll keep pushing.", "Understood. There's more in me.", "I know. I'll step it up."]); break
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
