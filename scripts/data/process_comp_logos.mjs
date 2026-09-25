// Rasterises authentic competition logos to WebP (height 160, transparent) into public/assets/comps/<key>.webp
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const SRC = process.env.OPUS_SRC || '/tmp/claude-0/data'
const H = `${SRC}/habereet_team-league-competition-logos/Soccer`
const F = `${SRC}/FCLOGO_fclogo.top/src/data/logos`
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const out = path.join(root, 'public/assets/comps')
fs.mkdirSync(out, { recursive: true })

const MAP = {
  UCL: `${H}/Competitions/UEFA Champions League.svg`,
  UEL: `${H}/Competitions/UEFA Europa League.svg`,
  FACUP: `${H}/Competitions/Emirates FA Cup.svg`,
  EFLCUP: `${H}/Competitions/EFL Carabao Cup.svg`,
  COMMSHIELD: `${H}/Competitions/FA Community Shield.svg`,
  L13: `${F}/theFA/comps/001_Premier League/svg/Premier-League-v2016.svg`,
  L14: `${H}/Club Teams and Leagues/England/EFL Championship/EFL Championship Logo.svg`,
  L53: `${F}/RFEF/comps/001_LALIGA/svg/LALIGA-Primera-Division-v2023.svg`,
  L54: `${F}/RFEF/comps/002_LALIGA 2/svg/LALIGA-Segunda-Division-v2023.svg`,
  L19: `${F}/DFB/comps/001_Bundesliga/svg/Bundesliga-v2017.svg`,
  L20: `${F}/DFB/comps/002_2.Bundesliga/svg/2-Bundesliga-v2017.svg`,
  L31: `${F}/FIGC/comps/01_Serie A/svg/Serie-A-v2022.svg`,
  L16: `${F}/FFF/comps/01_LIGUE 1/svg/LIGUE-1-v2024.svg`,
  L17: `${F}/FFF/comps/02_LIGUE 2/svg/LIGUE-2-v2024.svg`,
  L10: `${H}/Club Teams and Leagues/Netherlands/Eredivisie/Eredivisie Logo.svg`,
  L308: `${H}/Club Teams and Leagues/Portugal/Primeira Liga/Primeira Liga Logo.svg`,
  L4: `${H}/Club Teams and Leagues/Belgium/Jupiler Pro League/Jupiler Pro League Logo.svg`,
  L50: `${H}/Club Teams and Leagues/Scotland/Scottish Premiership/Scottish Premiership Logo.svg`,
  L68: `${H}/Club Teams and Leagues/Türkiye (Turkey)/Süper Lig/Süper Lig Logo.svg`,
  L80: `${H}/Club Teams and Leagues/Austria/Austrian Football Bundesliga/Austrian Football Bundesliga Logo.svg`,
  L41: `${H}/Club Teams and Leagues/Norway/Eliteserien/Eliteserien Logo.svg`,
  L350: `${F}/SAFF/comps/001-SPL/svg/saudi-pro-league-v2022.svg`,
  L39: `${F}/USSF/comps/001_MLS/svg/Major-League-Soccer-v2015.svg`,
  L353: `${F}/AFA/comps/001_Liga Profesional/svg/Liga-Profesional-de-Futbol-v2020.svg`,
  L351: `${F}/FA/comps/001_A League/svg/australia-a-league-v0000.svg`,
  L83: `${F}/KFA/comps/001_K-League 1/svg/k-league-1-v2021.svg`,
  L2012: `${F}/CFA/comps/cfa-super-league/svg/cfa-super-league-v2004.svg`,
}

const done = []
for (const [key, src] of Object.entries(MAP)) {
  try {
    const buf = fs.readFileSync(src)
    const png = await sharp(buf, { density: 400, limitInputPixels: false }).trim({ threshold: 1 })
      .resize(320, 200, { fit: 'inside' }).png().toBuffer()
    await sharp(png).webp({ quality: 90, alphaQuality: 95 }).toFile(path.join(out, `${key}.webp`))
    const meta = await sharp(png).metadata()
    done.push([key, meta.width, meta.height])
  } catch (e) {
    console.error('failed', key, e.message)
  }
}
fs.writeFileSync(path.join(root, 'src/data/compLogos.json'), JSON.stringify(Object.fromEntries(done.map(([k, w, h]) => [k, { w, h }])), null, 0))
console.log('competition logos', done.length)
