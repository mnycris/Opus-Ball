import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.env.OUT || '/tmp/opus-match'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
let n = 0
const shot = async (name) => { await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
await page.goto('http://localhost:4173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText('Bundesliga').first().click(); await page.locator('.club-card').nth(1).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 60000 })
for (let i = 0; i < 12; i++) {
  if (await page.getByText('Play Match').count()) break
  const b = page.locator('.continue-btn'); const t = await b.innerText()
  await b.click(); if (/Match Day/.test(t)) break
  await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
await page.waitForSelector('text=Play Match', { timeout: 20000 })
await page.getByText('Play Match').click()
await page.getByRole('button', { name: '4×' }).click()
const t0 = Date.now()
await page.waitForSelector('.sb-clock:has-text("HT")', { timeout: 60000 })
console.log('first half at 4x took', Date.now() - t0, 'ms')
await shot('halftime')
await page.locator('.ctl-btn.manage').click()
await page.locator('.sheet .li.tap').nth(9).click()
await shot('ht-sub-pick')
await page.locator('.sheet .li.tap').first().click()
await shot('ht-sub-done')
await page.locator('.sheet .iconbtn').click()
await page.locator('.ctl-btn.big').click()
const t1 = Date.now()
await page.waitForSelector('text=Full-time · Continue', { timeout: 90000 })
console.log('second half at 4x took', Date.now() - t1, 'ms')
await shot('fulltime-feed')
await page.getByText('Full-time · Continue').click()
await shot('postmatch')
await page.getByText('Post-match Press Conference').click()
await shot('press-post')
for (let i = 0; i < 3; i++) await page.locator('.btn.answer').first().click().catch(() => {})
await shot('press-post-done')
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
