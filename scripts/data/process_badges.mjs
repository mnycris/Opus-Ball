// Normalises club crests to transparent WebP (fit inside 160x160) and extracts dominant colours
// for clubs without curated kit colours. Usage: node scripts/data/process_badges.mjs
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/out/badges.json'), 'utf8'))
const outDir = path.join(root, 'public/assets/badges')
fs.mkdirSync(outDir, { recursive: true })

const colours = {}
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')

async function dominant(buf) {
  const { data, info } = await sharp(buf).resize(48, 48, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const buckets = new Map()
  for (let i = 0; i < data.length; i += info.channels) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
    if (a < 200) continue
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    const sat = max === 0 ? 0 : (max - min) / max
    const light = (max + min) / 2
    // quantise
    const key = `${r >> 5},${g >> 5},${b >> 5}`
    const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0, sat: 0, light: 0 }
    e.n++; e.r += r; e.g += g; e.b += b; e.sat += sat; e.light += light
    buckets.set(key, e)
  }
  const list = [...buckets.values()].map((e) => ({
    n: e.n, r: Math.round(e.r / e.n), g: Math.round(e.g / e.n), b: Math.round(e.b / e.n), sat: e.sat / e.n, light: e.light / e.n,
  }))
  // score: prevalence weighted by saturation, penalise near white / near black / grey
  const scored = list.map((c) => ({ ...c, score: c.n * (0.25 + c.sat) * (c.light > 235 || c.light < 18 ? 0.35 : 1) }))
  scored.sort((a, b) => b.score - a.score)
  const primary = scored[0]
  const secondary = scored.find((c) => Math.abs(c.r - primary.r) + Math.abs(c.g - primary.g) + Math.abs(c.b - primary.b) > 120) || { r: 255, g: 255, b: 255 }
  return [toHex(primary.r, primary.g, primary.b), toHex(secondary.r, secondary.g, secondary.b)]
}

let ok = 0
for (const [id, src] of Object.entries(manifest)) {
  try {
    const input = fs.readFileSync(src)
    const img = sharp(input, { density: 300, limitInputPixels: false }).trim({ threshold: 1 }).resize(160, 160, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    const png = await img.png().toBuffer()
    await sharp(png).webp({ quality: 88, alphaQuality: 95 }).toFile(path.join(outDir, `${id}.webp`))
    colours[id] = await dominant(png)
    ok++
  } catch (e) {
    console.error('badge failed', id, src, e.message)
  }
}
fs.writeFileSync(path.join(root, 'scripts/data/out/badge_colours.json'), JSON.stringify(colours))
console.log('processed', ok, 'of', Object.keys(manifest).length)
