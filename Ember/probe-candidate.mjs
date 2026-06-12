import { chromium } from 'playwright'

const BASE = 'http://localhost:5199'
const EMAIL = 'demo.candidate@ember.dev'
const PASS = 'EmberDemo123!'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const wait = (ms) => page.waitForTimeout(ms)

// Try login first; if it fails, sign up.
async function auth() {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASS)
  await page.click('button[type=submit]')
  await wait(3500)
  if (page.url().includes('/candidate')) { console.log('logged in existing'); return true }
  // Sign up
  await page.goto(BASE + '/signup?role=candidate', { waitUntil: 'networkidle' })
  await wait(500)
  await page.fill('input[placeholder=/full name/i] , input[type=text]', 'Alex Morgan').catch(()=>{})
  // robust fills by label order
  const text = page.locator('input[type=text]'); if (await text.count()) await text.first().fill('Alex Morgan')
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASS)
  await page.click('button[type=submit]')
  await wait(4000)
  console.log('after signup url:', page.url())
  return page.url().includes('/candidate')
}

const ok = await auth()
console.log('authed:', ok, 'url:', page.url())
if (!ok) { await page.screenshot({ path: 'C:/Users/damia/AppData/Local/Temp/cand-fail.png' }); await browser.close(); process.exit(0) }

// Go to profile, check completion + fill
await page.goto(BASE + '/candidate/profile', { waitUntil: 'networkidle' })
await wait(1500)
await page.screenshot({ path: 'C:/Users/damia/AppData/Local/Temp/cand-profile.png', fullPage: true })

// Browse roles
await page.goto(BASE + '/candidate/roles', { waitUntil: 'networkidle' })
await wait(2000)
await page.screenshot({ path: 'C:/Users/damia/AppData/Local/Temp/cand-roles.png', fullPage: true })
const startBtns = await page.getByText(/Start assessment/i).count()
const submittedBadges = await page.getByText(/Already submitted/i).count()
console.log('roles: startBtns=', startBtns, 'submitted=', submittedBadges)

// My assessments
await page.goto(BASE + '/candidate/assessments', { waitUntil: 'networkidle' })
await wait(1500)
await page.screenshot({ path: 'C:/Users/damia/AppData/Local/Temp/cand-assessments.png', fullPage: true })

await browser.close()
