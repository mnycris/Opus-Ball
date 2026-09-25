import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
const dir = process.argv[2], out = process.argv[3] || dir + '/sheets'
const per = Number(process.argv[4] || 4), cols = Number(process.argv[5] || 2)
fs.mkdirSync(out, { recursive: true })
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort()
const W = 360, H = 780
for (let i = 0; i < files.length; i += per) {
  const group = files.slice(i, i + per)
  const rows = Math.ceil(group.length / cols)
  const comps = await Promise.all(group.map(async (f, k) => ({ input: await sharp(path.join(dir, f)).resize(W, H, { fit: 'contain', background: '#000' }).png().toBuffer(), left: (k % cols) * (W + 6), top: Math.floor(k / cols) * (H + 6) })))
  await sharp({ create: { width: cols * (W + 6), height: rows * (H + 6), channels: 3, background: '#333' } }).composite(comps).png().toFile(path.join(out, `sheet-${String(i / per + 1).padStart(2, '0')}.png`))
}
console.log('ok', Math.ceil(files.length / per))
