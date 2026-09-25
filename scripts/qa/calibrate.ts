// Calibration harness: simulates a full league season and reports realism metrics.
// Run: npx tsx scripts/qa/calibrate.ts [leagueId=13] [seed]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { Rng } from '../../src/domain/rng'
import { applyMatchResult, simulateFixture } from '../../src/engine/world/matchRunner'
import { sortTable } from '../../src/engine/competitions/tables'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const leagueId = Number(process.argv[2] || 13)
const seed = Number(process.argv[3] || 7)
const arsenal = raw.clubs.find((c) => c.dbName === 'Arsenal FC')!.id
const t0 = Date.now()
const w = createWorld(raw, {
  clubId: arsenal,
  manager: { firstName: 'Test', lastName: 'Manager', nationality: 'England', dob: '1985-01-01', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } },
  settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' },
  seed,
})
console.log('world created in', Date.now() - t0, 'ms; fixtures', Object.keys(w.fixtures).length, 'competitions', Object.keys(w.competitions).length)
const comp = w.competitions[`L${leagueId}-2026`]
const rng = new Rng(seed)
let n = 0, goals = 0, hw = 0, dr = 0, aw = 0, shots = 0, sot = 0, xg = 0, corners = 0, fouls = 0, yel = 0, red = 0, off = 0, pens = 0, inj = 0
const poss: number[] = []
const ratings: number[] = [], motmR: number[] = [], byPos: Record<string, number[]> = {}, passes: number[] = [], acc: number[] = [], tkl: number[] = [], scorerR: number[] = []
const scoreDist: Record<string, number> = {}
const t1 = Date.now()
for (const id of comp.fixtures) {
  const f = w.fixtures[id]
  const r = simulateFixture(w, f)
  const res = applyMatchResult(w, f, r, rng)
  inj += res.injuries.length
  n++
  const [h, a] = r.score
  goals += h + a
  if (h > a) hw++; else if (h === a) dr++; else aw++
  for (const s of r.stats) { shots += s.shots; sot += s.sot; xg += s.xg; corners += s.corners; fouls += s.fouls; yel += s.yellows; red += s.reds; off += s.offsides }
  poss.push(r.stats[0].possession)
  for (const s of r.stats) { passes.push(s.passes); acc.push(s.passAcc) }
  for (const side of [0, 1]) tkl.push(r.players.filter((x) => x.side === side).reduce((a, x) => a + x.tackles, 0))
  for (const x of r.players) {
    if (x.mins < 30) continue
    ratings.push(x.rating)
    const g = x.pos === 'GK' ? 'GK' : ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(x.pos) ? 'DEF' : ['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(x.pos) ? 'MID' : 'ATT'
    ;(byPos[g] ||= []).push(x.rating)
    if (x.goals) scorerR.push(x.rating)
  }
  const m = r.players.find((x) => x.id === r.motm); if (m) motmR.push(m.rating)
  pens += r.events.filter((e) => e.type === 'penGoal' || (e.type === 'penMiss')).length
  const k = `${Math.min(h, 5)}-${Math.min(a, 5)}`
  scoreDist[k] = (scoreDist[k] || 0) + 1
  // recover fitness between matches (roughly a week)
  for (const pid of r.players.map((x) => x.id)) { const p = w.players[pid]; p.fitness = Math.min(100, p.fitness + 30); if (p.injury && Math.random() < 0.3) p.injury = undefined }
}
const dt = Date.now() - t1
const fmt = (x: number) => (x / n).toFixed(2)
console.log(`${n} matches in ${dt} ms (${(dt / n).toFixed(2)} ms/match)`)
console.log(`goals/m ${fmt(goals)}  H/D/A ${(hw / n * 100).toFixed(0)}/${(dr / n * 100).toFixed(0)}/${(aw / n * 100).toFixed(0)}%`)
console.log(`shots ${fmt(shots)} sot ${fmt(sot)} xG ${fmt(xg)} corners ${fmt(corners)} fouls ${fmt(fouls)} yellows ${fmt(yel)} reds ${fmt(red)} offsides ${fmt(off)} pens ${fmt(pens)} injuries ${fmt(inj)}`)
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1)
const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)]
console.log(`ratings mean ${avg(ratings).toFixed(2)} sd ${Math.sqrt(avg(ratings.map((x) => (x - avg(ratings)) ** 2))).toFixed(2)} p5 ${q(ratings, 0.05)} p50 ${q(ratings, 0.5)} p95 ${q(ratings, 0.95)} max ${Math.max(...ratings)} min ${Math.min(...ratings)}`)
console.log('by pos', Object.entries(byPos).map(([k, v]) => `${k} ${avg(v).toFixed(2)}`).join('  '), `| scorers ${avg(scorerR).toFixed(2)} | MOTM ${avg(motmR).toFixed(2)} (p10 ${q(motmR, 0.1)} p90 ${q(motmR, 0.9)})`)
console.log(`team passes ${avg(passes).toFixed(0)} (p10 ${q(passes, 0.1)} p90 ${q(passes, 0.9)}) acc ${avg(acc).toFixed(1)}% tackles ${avg(tkl).toFixed(1)}`)
poss.sort((a, b) => a - b)
console.log('home possession p10/p50/p90', poss[Math.floor(n * 0.1)], poss[Math.floor(n * 0.5)], poss[Math.floor(n * 0.9)])
console.log('common scores', Object.entries(scoreDist).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}:${v}`).join(' '))
const table = sortTable(w, comp)
console.log('\nFinal table:')
table.forEach((r, i) => console.log(`${String(i + 1).padStart(2)} ${w.clubs[r.clubId].name.padEnd(26)} ${String(r.p).padStart(2)} ${r.w}-${r.d}-${r.l} ${r.gf}:${r.ga} ${r.pts} (avg ${w.clubs[r.clubId].squadAvg})`))
// top scorers
const scorers = Object.values(w.players).filter((p) => p.season[comp.id]?.goals).sort((a, b) => b.season[comp.id].goals - a.season[comp.id].goals).slice(0, 10)
console.log('\nTop scorers:', scorers.map((p) => `${p.name} (${w.clubs[p.clubId]?.short}) ${p.season[comp.id].goals}`).join(', '))
const assists = Object.values(w.players).filter((p) => p.season[comp.id]?.assists).sort((a, b) => b.season[comp.id].assists - a.season[comp.id].assists).slice(0, 6)
console.log('Top assists:', assists.map((p) => `${p.name} ${p.season[comp.id].assists}`).join(', '))
const rated = Object.values(w.players).filter((p) => (p.season[comp.id]?.rated || 0) >= 20).sort((a, b) => b.season[comp.id].ratingSum / b.season[comp.id].rated - a.season[comp.id].ratingSum / a.season[comp.id].rated).slice(0, 8)
console.log('Best avg ratings:', rated.map((p) => `${p.name} ${(p.season[comp.id].ratingSum / p.season[comp.id].rated).toFixed(2)}`).join(', '))
