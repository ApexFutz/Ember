import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = 'http://localhost:5199'
const OUT_DIR = 'C:/Users/damia/OneDrive/Documents/GitHub/Ember/marketing'
const EMAIL = 'demo.candidate@ember.dev'
const PASS = 'EmberDemo123!'
const W = 1280, H = 800
fs.mkdirSync(OUT_DIR, { recursive: true })

const initScript = `
window.__demoSetup = () => {
  if (document.getElementById('__demoCursor')) return
  const cur = document.createElement('div')
  cur.id = '__demoCursor'
  cur.style.cssText = 'position:fixed;left:640px;top:400px;width:22px;height:22px;z-index:2147483647;pointer-events:none;transition:left .45s cubic-bezier(.4,0,.2,1),top .45s cubic-bezier(.4,0,.2,1);will-change:left,top;'
  cur.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 2l6 16 2.5-6.5L19 9 4 2z" fill="#fff" stroke="#111" stroke-width="1.2" stroke-linejoin="round"/></svg>'
  const cap = document.createElement('div')
  cap.id = '__demoCaption'
  cap.style.cssText = 'position:fixed;left:50%;bottom:48px;transform:translateX(-50%) translateY(8px);max-width:80vw;z-index:2147483646;pointer-events:none;background:rgba(20,17,14,.92);border:1px solid rgba(249,115,22,.5);color:#f2ede6;font-family:Inter,system-ui,sans-serif;font-size:22px;font-weight:600;letter-spacing:.01em;padding:14px 26px;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.5);opacity:0;transition:opacity .4s ease,transform .4s ease;text-align:center;'
  document.body.appendChild(cur); document.body.appendChild(cap)
}
window.__demoCaption = (t) => { const cap=document.getElementById('__demoCaption'); if(!cap) return
  if(!t){cap.style.opacity='0';cap.style.transform='translateX(-50%) translateY(8px)';return}
  cap.style.opacity='0'; setTimeout(()=>{cap.textContent=t;cap.style.opacity='1';cap.style.transform='translateX(-50%) translateY(0)'},180) }
window.__demoCursor = (x,y)=>{const c=document.getElementById('__demoCursor');if(c){c.style.left=x+'px';c.style.top=y+'px'}}
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', window.__demoSetup); else window.__demoSetup()
`

const browser = await chromium.launch()

// ── Pre-step (NOT recorded): log in to capture the candidate session ──
const ctxA = await browser.newContext({ viewport: { width: W, height: H } })
const pa = await ctxA.newPage()
await pa.goto(BASE + '/login', { waitUntil: 'networkidle' })
await pa.fill('input[type=email]', EMAIL)
await pa.fill('input[type=password]', PASS)
await pa.click('button[type=submit]')
await pa.waitForURL('**/candidate/**', { timeout: 15000 })
const state = await ctxA.storageState()
const origin = state.origins.find(o => o.origin.includes('localhost:5199'))
const lsEntries = origin ? origin.localStorage : []
console.log('captured', lsEntries.length, 'localStorage entries')
await ctxA.close()

// ── Recording context (starts logged-out) ──
const context = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: OUT_DIR, size: { width: W, height: H } },
})
await context.addInitScript(initScript)
const page = await context.newPage()
const wait = (ms) => page.waitForTimeout(ms)
async function ensure() { await page.evaluate(() => window.__demoSetup && window.__demoSetup()) }
async function caption(t) { await ensure(); await page.evaluate(t => window.__demoCaption(t), t) }
async function cursorTo(x, y) { await page.evaluate(([x, y]) => window.__demoCursor(x, y), [x, y]); await wait(500) }
async function moveToSel(sel) {
  const box = await page.locator(sel).first().boundingBox({ timeout: 6000 }).catch(() => null)
  if (!box) { console.log('  (skip:', sel, ')'); return null }
  const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2)
  await cursorTo(x, y); return { x, y }
}
async function clickSel(sel) { const p = await moveToSel(sel); if (!p) return false; await wait(250); await page.mouse.click(p.x, p.y); return true }
async function typeInto(sel, text) {
  const p = await moveToSel(sel); if (!p) return
  await wait(150); await page.mouse.click(p.x, p.y); await page.fill(sel, ''); await page.type(sel, text, { delay: 35 })
}
async function smoothScroll(toY, dur = 1100) {
  await page.evaluate(({ toY, dur }) => new Promise(res => { const s = window.scrollY, d = toY - s, t0 = performance.now()
    function step(t){const k=Math.min(1,(t-t0)/dur);const e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;window.scrollTo(0,s+d*e);k<1?requestAnimationFrame(step):res()}
    requestAnimationFrame(step) }), { toY, dur })
}

try {
  // ── Scene 1: Landing ──
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await wait(800)
  await caption('Get hired on the strength of your work')
  await cursorTo(640, 360); await wait(2200)
  await cursorTo(700, 545)               // "I'm a Candidate" CTA
  await wait(1400)

  // ── Scene 2: Signup form ──
  await clickSel('a[href="/signup?role=candidate"]')
  await page.waitForURL('**/signup**', { timeout: 10000 }).catch(() => {})
  await wait(800)
  await caption('Join free — sign up in seconds')
  await typeInto('input[type=text]', 'Alex Morgan')
  await typeInto('input[type=email]', EMAIL)
  await typeInto('input[type=password]', 'EmberDemo123!')
  await wait(1200)

  // ── Transition: inject session (account already exists) → roles ──
  await page.evaluate((entries) => { for (const { name, value } of entries) localStorage.setItem(name, value) }, lsEntries)
  await page.goto(BASE + '/candidate/roles', { waitUntil: 'networkidle' })
  await page.waitForSelector('text=/Start assessment/i', { timeout: 15000 })
  await wait(1000)

  // ── Scene 3: Browse roles ──
  await caption('Browse open roles — apply by doing real work')
  await cursorTo(640, 320); await wait(1800)
  await smoothScroll(360, 900); await wait(2000)
  await smoothScroll(0, 700)

  // ── Scene 4: Complete profile (watch the bar climb) ──
  await caption('Build a profile recruiters can trust')
  await clickSel('a[href="/candidate/profile"]')
  await page.waitForURL('**/candidate/profile', { timeout: 10000 }).catch(() => {})
  await page.waitForLoadState('networkidle'); await wait(900)
  await typeInto('input[placeholder="e.g. Full Stack Developer"]', 'Full-Stack Engineer · React + Node')
  await typeInto('textarea', 'Product-minded engineer who loves shipping clean, well-tested features fast.')
  await typeInto('input[placeholder="https://github.com/username"]', 'https://github.com/alexmorgan')
  await typeInto('input[placeholder="Type a skill, press Enter"]', 'React')
  await clickSel('button:has-text("Add")')
  await wait(400)
  await caption('Your profile completeness, tracked in real time')
  await cursorTo(760, 200); await wait(1600)   // the progress bar
  await clickSel('button:has-text("Save profile")')
  await wait(1600)

  // ── Scene 5: Start an assessment ──
  await caption('Take a real, hands-on assessment')
  await clickSel('a[href="/candidate/roles"]')
  await page.waitForURL('**/candidate/roles', { timeout: 10000 }).catch(() => {})
  await page.waitForSelector('text=/Start assessment/i', { timeout: 10000 })
  await wait(900)
  await clickSel('button:has-text("Start assessment")')
  await page.waitForURL('**/assessment/**', { timeout: 12000 }).catch(() => {})
  await wait(1500)

  // ── Scene 6: Pre-start → editor → run tests (NO submit) ──
  await caption('Real work, not trivia — build in a real editor')
  await cursorTo(640, 360); await wait(1800)
  await clickSel('button:has-text("Start assessment —")')
  await page.waitForTimeout(2500)
  // type a little code in the Monaco editor
  const editor = await page.locator('.monaco-editor').first().boundingBox().catch(() => null)
  if (editor) {
    await cursorTo(Math.round(editor.x + 200), Math.round(editor.y + 120))
    await page.mouse.click(Math.round(editor.x + 200), Math.round(editor.y + 120))
    await page.keyboard.type('\nfunction filterProducts(items, q) {\n  return items.filter(p => p.name.includes(q))\n}\n', { delay: 22 })
  }
  await wait(1200)
  await caption('Run the tests, see results instantly')
  await clickSel('button:has-text("Run tests")')
  await wait(4500)

  // ── Scene 7: My Assessments ──
  await caption('Track every assessment in one place')
  await page.goto(BASE + '/candidate/assessments', { waitUntil: 'networkidle' })
  await wait(2600)

  // ── Scene 8: Close ──
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear() } catch {} })
  await context.clearCookies()
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await wait(1000)
  await caption('Ember — get hired on the strength of your work')
  await cursorTo(700, 545); await wait(1600)
  await cursorTo(640, 360); await wait(2400)
  await caption(''); await wait(700)
} catch (e) {
  console.error('Recording error:', e.message)
}

await page.close()
await context.close()
await browser.close()

const files = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.webm') && f.startsWith('page') || /^[a-f0-9]/.test(f) && f.endsWith('.webm'))
const all = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.webm') && f !== 'ember-landing.webm')
if (all.length) {
  const newest = all.map(f => ({ f, t: fs.statSync(OUT_DIR + '/' + f).mtimeMs })).sort((a, b) => b.t - a.t)[0].f
  const dest = OUT_DIR + '/ember-candidate.webm'
  fs.copyFileSync(OUT_DIR + '/' + newest, dest)
  // clean hash original
  if (newest !== 'ember-candidate.webm') fs.rmSync(OUT_DIR + '/' + newest)
  console.log('VIDEO READY:', dest, `(${Math.round(fs.statSync(dest).size / 1024)} KB)`)
} else console.log('No video produced.')
