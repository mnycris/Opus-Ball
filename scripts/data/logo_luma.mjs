// Flags crests and competition logos that are too dark to read on the dark UI (mean luminance of opaque pixels).
// node scripts/data/logo_luma.mjs  → src/data/darkLogos.json
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
async function luma(file) {
  const { data, info } = await sharp(file).ensureAlpha().resize(64, 64, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true })
  let s = 0, n = 0, bright = 0
  for (let i = 0; i < data.length; i += info.channels) {
    const a = data[i + 3] / 255
    if (a < 0.5) continue
    const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    s += l; n++
    if (l > 150) bright++
  }
  return n ? { mean: s / n, brightShare: bright / n } : { mean: 255, brightShare: 1 }
}
const out = { clubs: [], comps: [] }
for (const [dir, key] of [['public/assets/badges', 'clubs'], ['public/assets/comps', 'comps']]) {
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.webp'))) {
    const { mean, brightShare } = await luma(path.join(dir, f))
    // dark overall and with little light detail to carry the shape
    if (mean < 78 && brightShare < 0.12) out[key].push(key === 'clubs' ? Number(f.replace('.webp', '')) : f.replace('.webp', ''))
  }
}
fs.writeFileSync('src/data/darkLogos.json', JSON.stringify(out))
console.log('dark clubs', out.clubs.length, 'dark comps', out.comps.join(','))
