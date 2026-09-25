// Pre- and post-match press conferences. Answers move squad morale, individual
// players, board confidence (brand exposure) and manager reputation, and the
// best quote is published as a news story.
import type { Fixture, Player, World } from '../../domain/types'
import { Rng, clamp, hashString } from '../../domain/rng'
import { rosterOf } from './roster'
import { postNews } from './messages'
import { sortTable } from '../competitions/tables'
import { callName } from '../match/commentary'

export interface PressEffect { team?: number; player?: number; playerId?: number; brand?: number; rep?: number; opponent?: number }
export interface PressOption { id: string; tone: 'Confident' | 'Measured' | 'Humble' | 'Deflect' | 'Praise' | 'Critical' | 'Defiant'; text: string; effect: PressEffect; quote: string }
export interface PressQuestion { id: string; reporter: string; outlet: string; text: string; options: PressOption[]; playerId?: number }

const OUTLETS: Record<string, string[]> = {
  England: ['BBC Sport', 'Sky Sports News', 'The Athletic', 'The Guardian', 'talkSPORT'],
  Spain: ['Marca', 'AS', 'Mundo Deportivo', 'Sport', 'El País'],
  Germany: ['kicker', 'Bild', 'Sport1', 'Süddeutsche Zeitung'],
  Italy: ['La Gazzetta dello Sport', 'Corriere dello Sport', 'Tuttosport', 'Sky Sport Italia'],
  France: ["L'Équipe", 'RMC Sport', 'Le Parisien', 'France Football'],
  Portugal: ['A Bola', 'Record', 'O Jogo'],
  Netherlands: ['De Telegraaf', 'Voetbal International', 'NOS'],
  _: ['ESPN', 'Reuters', 'Associated Press', 'The Athletic'],
}
const FIRST = ['Sam', 'Laura', 'Marco', 'Elena', 'Tom', 'Sofia', 'Daniel', 'Clara', 'James', 'Lucía', 'Pieter', 'Anna']
const LAST = ['Hughes', 'Martín', 'Rossi', 'Keller', 'Dubois', 'Silva', 'de Vries', 'Walsh', 'Moreno', 'Schmidt', 'Costa', 'Bennett']

function reporter(w: World, rng: Rng) {
  const c = w.clubs[w.userClubId]
  const o = OUTLETS[c.country] || OUTLETS._
  return { reporter: `${rng.pick(FIRST)} ${rng.pick(LAST)}`, outlet: rng.pick(o) }
}

function formOf(w: World, clubId: number) {
  return (w.clubs[clubId]?.recent || []).slice(-5)
}

export function pressQuestions(w: World, kind: 'pre' | 'post', fixtureId: string): PressQuestion[] {
  const f = w.fixtures[fixtureId]
  if (!f) return []
  const rng = new Rng(hashString(`${fixtureId}:${kind}:${w.meta.seed}`))
  const club = w.clubs[w.userClubId]
  const oppId = f.home === club.id ? f.away : f.home
  const opp = w.clubs[oppId]
  const qs: PressQuestion[] = []
  const add = (q: Omit<PressQuestion, 'id' | 'reporter' | 'outlet'>) => qs.push({ ...q, id: `q${qs.length}`, ...reporter(w, rng) })
  const squad = rosterOf(w, club.id)
  const comp = w.competitions[f.compId]

  if (kind === 'pre') {
    const stronger = opp.squadAvg > club.squadAvg + 2, weaker = opp.squadAvg < club.squadAvg - 2
    if (f.derby) {
      add({ text: `It's the ${f.derby} this week. What does this game mean to you and the supporters?`, options: [
        { id: 'a', tone: 'Confident', text: 'We are going there to win. Nothing else matters.', effect: { team: 4, brand: 3, rep: 0.3 }, quote: `"We are going to win the ${f.derby}. Nothing else matters."` },
        { id: 'b', tone: 'Measured', text: 'Derbies are special, but it is still three points.', effect: { team: 1, brand: 1 }, quote: `"Derbies are special, but for us it is about the performance."` },
        { id: 'c', tone: 'Humble', text: 'They are a very good side. We respect them.', effect: { team: -1, opponent: 1 }, quote: `"${opp.short} are a very good side and we respect them."` },
      ] })
    } else if (stronger) {
      add({ text: `${opp.short} are favourites for this one. Can your side cause an upset?`, options: [
        { id: 'a', tone: 'Confident', text: "We fear no-one. We'll go toe to toe with them.", effect: { team: 3, brand: 2, rep: 0.2 }, quote: `"We fear no-one. We will go toe to toe with ${opp.short}."` },
        { id: 'b', tone: 'Measured', text: 'We have a plan. If we execute it, anything is possible.', effect: { team: 2, brand: 1 }, quote: `"We have a plan, and if we execute it anything is possible."` },
        { id: 'c', tone: 'Humble', text: "They're one of the best teams around. A point would be a good result.", effect: { team: -3, brand: -1 }, quote: `"A point against ${opp.short} would be a good result for us."` },
      ] })
    } else if (weaker) {
      add({ text: `You're expected to win comfortably against ${opp.short}. Any danger of complacency?`, options: [
        { id: 'a', tone: 'Measured', text: 'No game is easy at this level. We prepare the same way every week.', effect: { team: 2 }, quote: `"No game is easy. We prepare the same way every week."` },
        { id: 'b', tone: 'Confident', text: "We should be winning games like this, and we will.", effect: { team: 1, brand: 2, rep: 0.1 }, quote: `"We should be winning games like this, and we will."` },
        { id: 'c', tone: 'Praise', text: `${opp.short} are well organised. They'll make it difficult.`, effect: { team: 0, opponent: -1 }, quote: `"${opp.short} are well organised and will make it difficult."` },
      ] })
    } else {
      add({ text: `How do you assess ${opp.short} ahead of the game?`, options: [
        { id: 'a', tone: 'Confident', text: "We're focused on ourselves. If we play our game we'll win.", effect: { team: 2, brand: 1 }, quote: `"If we play our game, we will win."` },
        { id: 'b', tone: 'Praise', text: 'A strong side with quality all over the pitch.', effect: { team: 0 }, quote: `"${opp.short} have quality all over the pitch."` },
        { id: 'c', tone: 'Deflect', text: "I'll talk about them after the game.", effect: { brand: -1 }, quote: `"I'll talk about ${opp.short} after the game."` },
      ] })
    }
    const form = formOf(w, club.id)
    const losses = form.filter((x) => x === 'L').length, wins = form.filter((x) => x === 'W').length
    if (form.length >= 3 && losses >= 3) {
      add({ text: `That's ${losses} defeats in your last ${form.length}. Is your job under pressure?`, options: [
        { id: 'a', tone: 'Defiant', text: "I'm the right person for this job and I'll prove it.", effect: { team: 2, rep: 0.2, brand: 1 }, quote: `"I am the right person for this job and I will prove it."` },
        { id: 'b', tone: 'Measured', text: 'Results must improve. I take full responsibility.', effect: { team: 3, brand: 1 }, quote: `"Results must improve and I take full responsibility."` },
        { id: 'c', tone: 'Critical', text: 'Some players need to take a hard look at themselves.', effect: { team: -5, brand: 2 }, quote: `"Some players need to take a hard look at themselves."` },
      ] })
    } else if (form.length >= 3 && wins >= 4) {
      add({ text: `${wins} wins from ${form.length}. What's behind this run of form?`, options: [
        { id: 'a', tone: 'Praise', text: 'The players deserve all the credit. Their attitude is exceptional.', effect: { team: 4 }, quote: `"The players deserve all the credit. Their attitude is exceptional."` },
        { id: 'b', tone: 'Confident', text: "We're only getting started.", effect: { team: 2, brand: 2, rep: 0.2 }, quote: `"We are only getting started."` },
        { id: 'c', tone: 'Humble', text: "We keep our feet on the ground. Nothing is won yet.", effect: { team: 1 }, quote: `"We keep our feet on the ground. Nothing is won yet."` },
      ] })
    }
    const star = [...squad].filter((p) => !p.injury).sort((a, b) => (b.formRatings.slice(-3).reduce((x, y) => x + y, 0)) - (a.formRatings.slice(-3).reduce((x, y) => x + y, 0)) || b.ovr - a.ovr)[0]
    if (star) {
      add({ playerId: star.id, text: `${star.name} has been in fine form. How important is he to this team?`, options: [
        { id: 'a', tone: 'Praise', text: 'He is world class. We build the team around him.', effect: { player: 8, playerId: star.id, team: -1 }, quote: `"${callName(star.name)} is world class. We build the team around him."` },
        { id: 'b', tone: 'Measured', text: 'He is important, but this is a team effort.', effect: { player: 3, playerId: star.id, team: 1 }, quote: `"${callName(star.name)} is important, but this is a team effort."` },
        { id: 'c', tone: 'Critical', text: "He can still do much more. I expect more from him.", effect: { player: -6, playerId: star.id }, quote: `"I expect even more from ${callName(star.name)}."` },
      ] })
    }
    const injured = squad.filter((p) => p.injury && p.ovr >= club.squadAvg).length
    if (injured >= 3 && qs.length < 3) {
      add({ text: `You have ${injured} key players injured. Does that give you an excuse?`, options: [
        { id: 'a', tone: 'Defiant', text: 'No excuses. The players who come in are good enough.', effect: { team: 3 }, quote: `"No excuses. The players who come in are good enough."` },
        { id: 'b', tone: 'Measured', text: 'It is difficult, but we will adapt.', effect: { team: 1 }, quote: `"It is difficult, but we will adapt."` },
        { id: 'c', tone: 'Deflect', text: 'Ask the medical staff.', effect: { brand: -2, team: -1 }, quote: `"Ask the medical staff."` },
      ] })
    }
  } else {
    const r = f.result
    if (!r) return []
    const us = f.home === club.id ? 0 : 1
    const gf = r.score[us], ga = r.score[1 - us]
    const won = gf > ga || (r.pens && r.pens[us] > r.pens[1 - us]), lost = gf < ga || (r.pens && r.pens[us] < r.pens[1 - us])
    if (won) {
      add({ text: gf - ga >= 3 ? `A statement win — ${gf}-${ga}. Your thoughts?` : `A ${gf}-${ga} win${f.derby ? ` in the ${f.derby}` : ''}. How pleased are you?`, options: [
        { id: 'a', tone: 'Praise', text: 'I am proud of every single player today.', effect: { team: 4 }, quote: `"I am proud of every single player today."` },
        { id: 'b', tone: 'Confident', text: 'This is what we are capable of. Expect more.', effect: { team: 2, brand: 2, rep: 0.3 }, quote: `"This is what we are capable of. Expect more."` },
        { id: 'c', tone: 'Critical', text: 'We won, but there is still a lot to improve.', effect: { team: -1, brand: 1 }, quote: `"We won, but there is still a lot to improve."` },
      ] })
    } else if (lost) {
      add({ text: `A ${gf}-${ga} defeat. What went wrong?`, options: [
        { id: 'a', tone: 'Measured', text: 'We were not at our level. We move on and learn from it.', effect: { team: 1 }, quote: `"We were not at our level. We learn and move on."` },
        { id: 'b', tone: 'Critical', text: 'That performance was unacceptable. Players must respond.', effect: { team: -4, brand: 1 }, quote: `"That performance was unacceptable."` },
        { id: 'c', tone: 'Defiant', text: "We were unlucky. On another day we win that game.", effect: { team: 2, brand: -1 }, quote: `"On another day we win that game."` },
      ] })
    } else {
      add({ text: `A ${gf}-${ga} draw. A point gained or two dropped?`, options: [
        { id: 'a', tone: 'Measured', text: 'A fair result. We take the point.', effect: { team: 1 }, quote: `"A fair result. We take the point."` },
        { id: 'b', tone: 'Critical', text: 'Two points dropped. We should have won.', effect: { team: -1, brand: 1 }, quote: `"Two points dropped. We should have won."` },
        { id: 'c', tone: 'Praise', text: 'The spirit to keep going pleased me most.', effect: { team: 2 }, quote: `"The spirit to keep going pleased me most."` },
      ] })
    }
    const mine = r.players.filter((x) => x.side === us)
    const best = [...mine].sort((a, b) => b.rating - a.rating)[0]
    const worst = [...mine].filter((x) => x.mins >= 45).sort((a, b) => a.rating - b.rating)[0]
    if (best && w.players[best.id]) {
      const p = w.players[best.id]
      add({ playerId: p.id, text: `${p.name} stood out today${best.goals ? ` with ${best.goals} goal${best.goals > 1 ? 's' : ''}` : ''}. Your verdict?`, options: [
        { id: 'a', tone: 'Praise', text: `Outstanding. ${callName(p.name)} was the difference.`, effect: { player: 7, playerId: p.id }, quote: `"${callName(p.name)} was the difference today."` },
        { id: 'b', tone: 'Measured', text: 'He played well, like the whole team.', effect: { player: 2, playerId: p.id, team: 1 }, quote: `"He played well, like the whole team."` },
        { id: 'c', tone: 'Critical', text: 'He can still improve on the ball.', effect: { player: -5, playerId: p.id }, quote: `"${callName(p.name)} can still improve."` },
      ] })
    }
    if (worst && w.players[worst.id] && worst.rating < 6.2 && worst.id !== best?.id) {
      const p = w.players[worst.id]
      add({ playerId: p.id, text: `${p.name} had a difficult afternoon. Will you stick with him?`, options: [
        { id: 'a', tone: 'Praise', text: 'He has my full backing. Everyone has off days.', effect: { player: 6, playerId: p.id }, quote: `"${callName(p.name)} has my full backing."` },
        { id: 'b', tone: 'Critical', text: 'He knows he must do better. Places are up for grabs.', effect: { player: -7, playerId: p.id, team: 1 }, quote: `"Places are up for grabs."` },
        { id: 'c', tone: 'Deflect', text: "I won't single out individuals.", effect: { team: 1 }, quote: `"I won't single out individuals."` },
      ] })
    }
    const reds = r.events.filter((e) => (e.type === 'red' || e.type === 'secondYellow') && e.side === us)
    if (reds.length) {
      add({ text: `You finished with ${11 - reds.length} men. Was the red card fair?`, options: [
        { id: 'a', tone: 'Critical', text: 'It was a shocking decision. The referee got it badly wrong.', effect: { team: 2, brand: 2, rep: -0.3 }, quote: `"The referee got it badly wrong."` },
        { id: 'b', tone: 'Measured', text: "I need to see it again before I comment.", effect: { brand: 0 }, quote: `"I need to see it again before I comment."` },
        { id: 'c', tone: 'Humble', text: 'We must be more disciplined.', effect: { team: -1, rep: 0.1 }, quote: `"We must be more disciplined."` },
      ] })
    }
    if (comp?.format === 'league' && comp.table && qs.length < 3) {
      const pos = sortTable(w, comp).findIndex((x) => x.clubId === club.id) + 1
      add({ text: `You're ${pos}${['th', 'st', 'nd', 'rd'][pos % 10 > 3 || Math.floor(pos / 10) === 1 ? 0 : pos % 10]} in the ${comp.short}. What are your ambitions this season?`, options: [
        { id: 'a', tone: 'Confident', text: 'We want to be at the very top.', effect: { brand: 3, rep: 0.2, team: 1 }, quote: `"We want to be at the very top."` },
        { id: 'b', tone: 'Measured', text: 'One game at a time. The table will take care of itself.', effect: { team: 1 }, quote: `"One game at a time."` },
        { id: 'c', tone: 'Humble', text: 'Our targets are realistic and we are on track.', effect: { brand: -1 }, quote: `"Our targets are realistic and we are on track."` },
      ] })
    }
  }
  return qs.slice(0, 3)
}

export function applyPress(w: World, kind: 'pre' | 'post', fixtureId: string, questions: PressQuestion[], answers: Record<string, string>): string[] {
  const club = w.clubs[w.userClubId]
  const squad = rosterOf(w, club.id)
  const out: string[] = []
  let teamDelta = 0, brand = 0, rep = 0
  const quotes: string[] = []
  const personal = new Map<number, number>()
  for (const q of questions) {
    const o = q.options.find((x) => x.id === answers[q.id])
    if (!o) continue
    teamDelta += o.effect.team || 0
    brand += o.effect.brand || 0
    rep += o.effect.rep || 0
    if (o.effect.playerId) personal.set(o.effect.playerId, (personal.get(o.effect.playerId) || 0) + (o.effect.player || 0))
    quotes.push(o.quote)
  }
  for (const p of squad) p.morale = clamp(p.morale + teamDelta * (0.6 + p.hidden.temperament / 250), 0, 100)
  for (const [id, d] of personal) { const p = w.players[id] as Player | undefined; if (p) p.morale = clamp(p.morale + d, 0, 100) }
  w.board.confidence['Brand Exposure'] = clamp(w.board.confidence['Brand Exposure'] + brand, 0, 100)
  w.user.reputation = clamp(w.user.reputation + rep, 1, 100)
  if (teamDelta) out.push(`Squad morale ${teamDelta > 0 ? 'lifted' : 'dented'}`)
  for (const [id, d] of personal) if (d) out.push(`${w.players[id]?.name} ${d > 0 ? 'boosted by your words' : 'unhappy with your comments'}`)
  if (brand) out.push(`Board brand confidence ${brand > 0 ? '+' : ''}${brand}`)
  const f = w.fixtures[fixtureId] as Fixture
  if (quotes.length) {
    const opp = w.clubs[f.home === club.id ? f.away : f.home]
    postNews(w, {
      headline: `${w.user.lastName}: ${quotes[0].replace(/^"|"$/g, '')}`,
      body: `${w.user.firstName} ${w.user.lastName} spoke to the media ${kind === 'pre' ? `ahead of ${club.short}'s meeting with ${opp.short}` : `after ${club.short}'s game against ${opp.short}`}. ${quotes.join(' ')}`,
      kind: 'manager', playerIds: [...personal.keys()], clubIds: [club.id, opp.id], compId: f.compId, importance: 2, userRelated: true,
    })
  }
  ;(w.flags.pressDone ||= {})[`${kind}:${fixtureId}`] = true
  return out
}
