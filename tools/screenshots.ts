/**
 * Renders the README images from the mod's own renderer (hooks/row.ts and
 * hooks/styles.ts), so every picture shows exactly what the mod draws.
 *
 *   npm run screenshots          # docs/*.png, docs/demo.gif, docs/social.png
 *
 * Needs Playwright's Chromium (`npx playwright install chromium`) and ffmpeg
 * for the GIF.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

import type { Limit, Prefs, Style } from '../types/index.d.ts'
import { barWidth } from '../hooks/format.ts'
import { detailText, rowSegs } from '../hooks/row.ts'
import type { RowInput } from '../hooks/row.ts'
import { STYLES } from '../hooks/styles.ts'
import type { Seg } from '../hooks/styles.ts'

const ROOT = resolve(import.meta.dirname, '..')
const DOCS = join(ROOT, 'docs')
const TMP = join(DOCS, '.render')
const H = 3600_000
const MIN = 60_000
const NOW = new Date(2026, 9, 5, 14, 17, 0).getTime()
const COLUMNS = 120
const WIDTH = barWidth(COLUMNS)
const iso = (ms: number) => new Date(ms).toISOString()

const PREFS: Prefs = { mode: 'full', style: 'bars', animation: true, sound: false, toasts: true, face: true, lang: 'en' }
const FIVE: Limit = { kind: 'five_hour', percentUsed: 42, resetsAt: iso(NOW + 2 * H + 13 * MIN) }
const SEVEN: Limit = { kind: 'seven_day', percentUsed: 67, resetsAt: iso(NOW + 3 * 24 * H + 4 * H) }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const span = (s: Seg) =>
  `<span style="${s.color ? `color:${s.color};` : ''}${s.bg ? `background:${s.bg};` : ''}${s.dim ? 'opacity:.5;' : ''}${s.bold ? 'font-weight:700;' : ''}">${esc(s.text)}</span>`
const line = (segs: Seg[]) => segs.map(span).join('')

type Row = Omit<RowInput, 'prefs' | 'now' | 'width' | 'compact'> & { prefs?: Partial<Prefs>; now?: number; compact?: boolean }
const segs = (r: Row) =>
  rowSegs({ ...r, prefs: { ...PREFS, ...r.prefs }, now: r.now ?? NOW, width: r.compact ? 0 : WIDTH, compact: r.compact ?? false })
const pair = (a: Row, b?: Row) => line(segs(a)) + (b ? '<span>   </span>' + line(segs(b)) : '')

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:transparent;font-family:"SF Mono",Menlo,"JetBrains Mono",monospace;font-size:15px;color:#e6edf3;padding:24px}
.term{background:#0d1117;border:1px solid #30363d;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.45);overflow:hidden;display:inline-block;min-width:100%}
.bar{height:34px;background:#161b22;border-bottom:1px solid #30363d;display:flex;align-items:center;padding:0 14px;gap:8px}
.dot{width:12px;height:12px;border-radius:50%}
.title{flex:1;text-align:center;color:#8b949e;font-size:13px;margin-right:52px}
.body{padding:18px 22px;white-space:pre;line-height:1.55}
.dim{opacity:.5}.acc{color:#d2a8ff}.ok{color:#7ee787}
.box{border:1px solid #484f58;border-radius:6px;padding:4px 10px;margin:10px 0 2px}
.cap{color:#8b949e;font-size:12.5px;padding:0 0 4px 2px;font-family:-apple-system,"Segoe UI",sans-serif}
.card{background:#30363d}
`

function frame(title: string, body: string) {
  return `<div class="term" id="shot"><div class="bar"><div class="dot" style="background:#ff5f57"></div><div class="dot" style="background:#febc2e"></div><div class="dot" style="background:#28c840"></div><div class="title">${esc(title)}</div></div><div class="body">${body}</div></div>`
}

function prompt(rows: string) {
  return [
    `<span class="acc">⏺</span> Refactored <span class="ok">src/auth/session.ts</span> and 2 more files · all 48 tests pass`,
    '',
    `<div class="box"><span class="dim">&gt;</span> now add rate limiting to the login route<span style="background:#e6edf3"> </span></div>`,
    `<span class="dim">  ? for shortcuts</span>`,
    `  ${rows}`,
  ].join('\n')
}

async function main() {
  rmSync(TMP, { recursive: true, force: true })
  mkdirSync(join(TMP, 'frames'), { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1280, height: 800 } })

  async function shoot(name: string, html: string, width = 1180, scale = 2) {
    await page.setViewportSize({ width, height: 800 })
    const file = join(TMP, `${name}.html`)
    writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${CSS}</style><body>${html}</body>`)
    await page.goto(`file://${file}`)
    await page.locator('#shot').screenshot({ path: join(DOCS, `${name}.png`), omitBackground: true, scale: scale === 2 ? 'device' : 'css' })
  }

  // Hero: the line under the prompt, mid-session.
  await shoot(
    'hero',
    frame('claude — ~/projects/shop', prompt(pair({ limit: FIVE, delta: { value: 3, at: NOW - 400 } }, { limit: SEVEN }))),
  )

  // Every style at the same values.
  const styleRows = STYLES.map(
    (s: Style) => `<div class="cap">${s}</div>  ${pair({ limit: { ...FIVE, percentUsed: s === 'pacman' ? 58 : 42 }, prefs: { style: s } }, { limit: SEVEN, prefs: { style: s } })}`,
  ).join('\n')
  await shoot('styles', frame('/usage-bars style <name>', styleRows))

  // The states a window goes through.
  const hist = { five_hour: [[NOW - H, 31]] as [number, number][] }
  const states: [string, string][] = [
    ['Delta flash — what the last answer cost', pair({ limit: { ...FIVE, percentUsed: 45 }, delta: { value: 3, at: NOW - 200 } })],
    ['Pace mark │ and the face: ahead of plan', pair({ limit: { ...FIVE, percentUsed: 18 } })],
    ['Too fast — the projection says when it runs dry', pair({ limit: { ...FIVE, percentUsed: 71 }, history: hist })],
    ['Last hour before the reset — the countdown goes to seconds', pair({ limit: { ...FIVE, percentUsed: 93, resetsAt: iso(NOW + 12 * MIN + 41_000) } })],
    ['Used up — a quip instead of a bar', pair({ limit: { ...FIVE, percentUsed: 100, resetsAt: iso(NOW + H + 12 * MIN) } })],
    ['Reset — the bar drains and it sparkles', pair({ limit: { ...FIVE, percentUsed: 0 }, partyAt: NOW - 600 })],
    ['Compact — narrow terminals or /usage-bars compact', pair({ limit: FIVE, compact: true }, { limit: SEVEN, compact: true })],
  ]
  await shoot('states', frame('what the line tells you', states.map(([c, r]) => `<div class="cap">${esc(c)}</div>  ${r}`).join('\n')))

  // Hover card.
  // a week of plausible hourly peaks: busy afternoons, quiet nights
  const week: [number, number][] = []
  for (let h = 7 * 24; h >= 1; h--) {
    const t = NOW - h * H
    const hour = new Date(t).getHours()
    const day = Math.floor(h / 24)
    const busy = hour >= 9 && hour <= 19 ? 35 + ((hour * 7 + day * 13) % 50) : (hour * 5 + day) % 12
    week.push([t, busy])
  }
  // inside the current window, the same samples the line above uses
  const history = [...week.filter(([t]) => t < NOW - 3 * H), [NOW - H, 31]] as [number, number][]
  // the 7-day level: the previous window filled to 85 %, the current one climbs to 67 %
  const start = Date.parse(SEVEN.resetsAt!) - 7 * 24 * H
  const seven: [number, number][] = week.map(([t]) =>
    t < start ? [t, Math.round(40 + (45 * (t - (start - 7 * 24 * H))) / (7 * 24 * H))] : [t, Math.round((SEVEN.percentUsed * (t - start)) / (NOW - start))],
  )
  const card = detailText([{ ...FIVE, percentUsed: 71 }, SEVEN], { five_hour: history, seven_day: seven }, NOW)
  await shoot('hover', frame('mouse over the line', `<div class="cap">the line</div>  ${pair({ limit: { ...FIVE, percentUsed: 71 }, history: hist }, { limit: SEVEN })}\n<div class="cap">hovered</div>  <span class="card">${esc(card)}</span>`))

  // Animated demo: an answer arrives, the bar glides, +3% flashes and fades;
  // then the 7-day window resets and sparkles.
  mkdirSync(join(DOCS, 'frames'), { recursive: true })
  const fps = 15
  const total = 6.5
  for (let i = 0; i < fps * total; i++) {
    const now = NOW + (i / fps) * 1000
    const t0 = NOW + 700
    const five: Row = now < t0 ? { limit: { ...FIVE, percentUsed: 39 } } : { limit: FIVE, motion: { from: 39, to: 42, at: t0 }, delta: { value: 3, at: t0 } }
    const tReset = NOW + 4200
    const seven: Row = now < tReset ? { limit: SEVEN } : { limit: { ...SEVEN, percentUsed: 0 }, motion: { from: 67, to: 0, at: tReset }, partyAt: tReset }
    await shoot(`frames/f${String(i).padStart(3, '0')}`, frame('claude — ~/projects/shop', prompt(pair({ ...five, now }, { ...seven, now }))), 1180, 1)
  }
  await browser.close()
  // shoot() writes into docs/; move the frames
  execFileSync('bash', ['-c', `mkdir -p "${TMP}/f" && mv "${DOCS}"/frames/*.png "${TMP}/f/" && rmdir "${DOCS}/frames"`])
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(TMP, 'f', 'f%03d.png'), '-vf', 'split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse=dither=none', '-loop', '0', join(DOCS, 'demo.gif')])

  await social()
}

async function social() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 })
  const big = (r: Row) => line(segs(r))
  const html = `<!doctype html><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:1280px;height:640px;overflow:hidden;font-family:-apple-system,"SF Pro Display","Segoe UI",sans-serif;color:#e6edf3;
background:radial-gradient(1200px 600px at 85% -10%,#2b1d4a 0%,transparent 60%),radial-gradient(900px 500px at -10% 110%,#0f3326 0%,transparent 55%),#0b0e14}
.wrap{position:absolute;inset:0;padding:64px 72px;display:flex;flex-direction:column}
.kicker{font-size:22px;letter-spacing:.18em;text-transform:uppercase;color:#8b949e;font-weight:600}
h1{font-size:92px;line-height:1;margin:14px 0 10px;font-weight:800;letter-spacing:-.02em}
h1 span{background:linear-gradient(90deg,#3fb950,#d29922 60%,#f85149);-webkit-background-clip:text;background-clip:text;color:transparent}
p{font-size:30px;color:#c9d1d9;max-width:1000px;line-height:1.3}
.term{margin-top:auto;background:#0d1117ee;border:1px solid #30363d;border-radius:14px;padding:22px 26px;font-family:"SF Mono",Menlo,monospace;font-size:21px;white-space:pre;line-height:1.7;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.foot{position:absolute;right:72px;top:70px;font-size:20px;color:#8b949e;text-align:right;line-height:1.5}
.foot b{color:#e6edf3}
</style><body><div class="wrap">
<div class="kicker">Claude Code mod</div>
<h1>usage<span>-bars</span></h1>
<p>Your 5-hour and 7-day limits as live bars under the prompt — with countdown, pace mark, projection and a little drama.</p>
<div class="term">${big({ limit: FIVE, delta: { value: 3, at: NOW - 300 } })}
${big({ limit: { ...SEVEN, percentUsed: 58 }, prefs: { style: 'pacman' } })}
${big({ limit: { ...FIVE, percentUsed: 81, kind: 'seven_day' }, prefs: { style: 'beer' } })}</div>
</div><div class="foot"><b>github.com/pepperonas/usage-bars</b><br>MIT · celox.io</div></body>`
  const file = join(TMP, 'social.html')
  writeFileSync(file, html)
  await page.goto(`file://${file}`)
  await page.screenshot({ path: join(DOCS, 'social.png') })
  await browser.close()
}

await main()
console.log('docs/: hero.png styles.png states.png hover.png demo.gif social.png')
