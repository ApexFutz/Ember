import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = 'http://localhost:5199'
const OUT_DIR = 'C:/Users/damia/OneDrive/Documents/GitHub/Ember/marketing'
const W = 1280, H = 800
fs.mkdirSync(OUT_DIR, { recursive: true })

// Injected on every page load: a fake cursor + a caption bar + a tiny API.
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
window.__demoCaption = (t) => {
  const cap = document.getElementById('__demoCaption'); if (!cap) return
  if (!t) { cap.style.opacity='0'; cap.style.transform='translateX(-50%) translateY(8px)'; return }
  cap.style.opacity='0'
  setTimeout(()=>{ cap.textContent=t; cap.style.opacity='1'; cap.style.transform='translateX(-50%) translateY(0)' },180)
}
window.__demoCursor = (x,y) => { const c=document.getElementById('__demoCursor'); if(c){c.style.left=x+'px';c.style.top=y+'px'} }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.__demoSetup)
else window.__demoSetup()
`

const browser = await chromium.launch()
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
  const el = page.locator(sel).first()
  const box = await el.boundingBox({ timeout: 6000 }).catch(() => null)
  if (!box) { console.log('  (skip, not found:', sel, ')'); return null }
  const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2)
  await cursorTo(x, y); return { x, y }
}
async function clickSel(sel) {
  const p = await moveToSel(sel); if (!p) return false
  await wait(250); await page.mouse.click(p.x, p.y); return true
}
async function smoothScroll(toY, dur = 1200) {
  await page.evaluate(({ toY, dur }) => new Promise(res => {
    const start = window.scrollY, d = toY - start, t0 = performance.now()
    function step(t) { const k = Math.min(1, (t - t0) / dur); const e = k < .5 ? 2*k*k : 1-Math.pow(-2*k+2,2)/2
      window.scrollTo(0, start + d*e); k < 1 ? requestAnimationFrame(step) : res() }
    requestAnimationFrame(step)
  }), { toY, dur })
}

try {
  // ── Scene 1: Landing hero ──
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await wait(800)
  await caption('Ember — hire engineers on the strength of their work')
  await cursorTo(640, 360)
  await wait(2600)
  await cursorTo(535, 545) // recruiter CTA
  await wait(1400)

  // ── Scene 2: Value props ──
  await caption('Real work assessments. Full transparency. One closed loop.')
  await smoothScroll(620)
  await wait(2800)
  await smoothScroll(0, 700)
  await wait(400)

  // ── Scene 3: Instant demo ──
  await caption('Try it instantly — no signup required')
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await wait(900)
  await clickSel('text=/Try a Demo/i')
  await page.waitForURL('**/recruiter/dashboard', { timeout: 20000 })
  await page.waitForSelector('text=/Watch replay/i', { timeout: 20000 })
  await wait(1200)

  // ── Scene 4: Dashboard pipeline ──
  await caption('Every candidate and submission in one pipeline')
  await cursorTo(700, 300); await wait(2400)
  await smoothScroll(260, 900); await wait(1800)

  // ── Scene 5: Open the replay ──
  await caption('See exactly how they worked — keystroke by keystroke')
  await smoothScroll(0, 600)
  await clickSel('text=/Watch replay/i')
  await page.waitForURL('**/replay', { timeout: 20000 })
  await wait(1600)

  // ── Scene 6: Replay playback ──
  await caption('Replay the work — speed it up, jump to the final code')
  await cursorTo(700, 360); await wait(2200)
  await clickSel('button:has-text("Play")')   // start playback
  await wait(3500)
  await caption('Paste events and focus losses, flagged automatically')
  await smoothScroll(980, 1200); await wait(3200) // paste + focus sections
  await smoothScroll(1300, 900); await wait(2600)

  // ── Scene 7: Roles (in-app SPA nav — no reload flash, keeps the session) ──
  await caption('Post roles and build real, hands-on assessments')
  await smoothScroll(0, 500)
  await clickSel('a[href="/recruiter/roles"]')
  await page.waitForURL('**/recruiter/roles', { timeout: 10000 }).catch(() => {})
  await page.waitForLoadState('networkidle')
  await wait(700)
  await caption('Post roles and build real, hands-on assessments')
  await cursorTo(640, 320); await wait(3000)

  // ── Scene 8: Close on the landing page ──
  // Clear the demo session first; otherwise RootRoute bounces an authed user
  // straight back to the dashboard instead of showing the marketing page.
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear() } catch {} })
  await context.clearCookies()
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await wait(1100)
  await caption('Ember — hire on evidence, not résumés.')
  await cursorTo(535, 545); await wait(1600)   // rest on the recruiter CTA
  await cursorTo(640, 360); await wait(2600)
  await caption('')
  await wait(800)
} catch (e) {
  console.error('Recording error:', e.message)
}

await page.close()
await context.close()
await browser.close()

// Rename the generated video
const files = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.webm'))
if (files.length) {
  const newest = files.map(f => ({ f, t: fs.statSync(OUT_DIR + '/' + f).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0].f
  const dest = OUT_DIR + '/ember-landing.webm'
  fs.copyFileSync(OUT_DIR + '/' + newest, dest)
  const kb = Math.round(fs.statSync(dest).size / 1024)
  console.log('VIDEO READY:', dest, `(${kb} KB)`)
} else {
  console.log('No video file produced.')
}
