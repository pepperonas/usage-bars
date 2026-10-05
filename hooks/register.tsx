import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

import type { Delta, History, Lang, Limit, Mode, Motion, Prefs, Style } from '../types'
import {
  COMPACT_BELOW,
  DELTA_MS,
  PARTY_MS,
  SLIDE_MS,
  WINDOWS,
  appendSample,
  barWidth,
  clockTime,
  glide,
  peaks,
  pick,
  quip,
  rate,
  reached,
  runsDryAt,
  spark,
  untilReset,
} from './format'
import { STYLES } from './styles'
import type { Seg } from './styles'
import { detailText, label, rowSegs } from './row'
import { LANGS, T, num1 } from './i18n'
import { complete, isOurs } from './complete'

const limitsA = atom({ plugin: 'usage-bars', key: 'limits' } as const, [] as Limit[])
const motionA = atom({ plugin: 'usage-bars', key: 'motion' } as const, {} as Record<string, Motion>)
const deltasA = atom({ plugin: 'usage-bars', key: 'deltas' } as const, {} as Record<string, Delta>)
const partyA = atom({ plugin: 'usage-bars', key: 'party' } as const, {} as Record<string, number>)
const historyA = atom({ plugin: 'usage-bars', key: 'history' } as const, {} as History)
const prefsA = atom({ plugin: 'usage-bars', key: 'prefs' } as const, {
  mode: 'full',
  style: 'bars',
  animation: true,
  sound: false,
  toasts: true,
  face: true,
  lang: 'en',
} as Prefs)

const MODES: readonly Mode[] = ['full', 'compact', 'off']
const FLAGS = ['animation', 'sound', 'toasts', 'face'] as const
type Flag = (typeof FLAGS)[number]

/** Whether the line is listing `/usage-bars` arguments right now. */
let listing = false

/** Redraw for a draft that is `/usage-bars …`, or that just stopped being one. */
function redrawIfOurs($: EngineInterface, text: string): void {
  const ours = isOurs(text)
  if (ours || listing) $.ui.invalidate('ui.render')
  listing = ours
}

const keep = (list: readonly Limit[]): Limit[] =>
  list.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt }))

/** userConfig defaults, overridden by what /usage-bars stored. */
function prefsOf(options: PluginOptions, stored: unknown): Prefs {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Partial<Prefs>
  const opt = <T,>(v: unknown, ok: (v: unknown) => v is T, d: T): T => (ok(v) ? v : d)
  const isStyle = (v: unknown): v is Style => STYLES.includes(v as Style)
  const isMode = (v: unknown): v is Mode => MODES.includes(v as Mode)
  const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
  const isLang = (v: unknown): v is Lang => LANGS.includes(v as Lang)
  const base: Prefs = {
    mode: opt(options.mode, isMode, 'full'),
    style: opt(options.style, isStyle, 'bars'),
    animation: opt(options.animation, isBool, true),
    sound: opt(options.sound, isBool, false),
    toasts: opt(options.toasts, isBool, true),
    face: opt(options.face, isBool, true),
    lang: opt(options.language, isLang, 'en'),
  }
  return {
    mode: opt(s.mode, isMode, base.mode),
    style: opt(s.style, isStyle, base.style),
    animation: opt(s.animation, isBool, base.animation),
    sound: opt(s.sound, isBool, base.sound),
    toasts: opt(s.toasts, isBool, base.toasts),
    face: opt(s.face, isBool, base.face),
    lang: opt(s.lang, isLang, base.lang),
  }
}


let animTimer: Timer | undefined
let animUntil = 0
let tickTimer: Timer | undefined
let ticks = 0


/** Redraw at ~30 fps until `until`, then stop. */
function animate($: EngineInterface, now: number, ms: number): void {
  animUntil = Math.max(animUntil, now + ms)
  if (animTimer) return
  animTimer = $.clock.every(33, () => {
    $.ui.invalidate('ui.render')
    void $.clock.now().then(t => {
      if (t > animUntil && animTimer) {
        animTimer.cancel()
        animTimer = undefined
        $.ui.invalidate('ui.render')
      }
    })
  })
}

/** New readings in: glide, delta, party, thresholds, history. */
async function apply($: EngineInterface, next: readonly Limit[], now: number): Promise<void> {
  const old = await read($, limitsA)
  const prefs = await read($, prefsA)
  const motion = { ...(await read($, motionA)) }
  const deltas = { ...(await read($, deltasA)) }
  const party = { ...(await read($, partyA)) }
  let history = await read($, historyA)
  const warned = ((await $.store.get('warned')) ?? {}) as Record<string, number>
  let warnedChanged = false
  let sound: string | undefined

  for (const n of next) {
    const o = pick(old, n.kind)
    const shown = glide(motion[n.kind], now) ?? o?.percentUsed ?? 0
    const isReset = !!o && n.percentUsed < o.percentUsed && n.resetsAt !== o.resetsAt
    if (o && n.percentUsed !== o.percentUsed) motion[n.kind] = { from: shown, to: n.percentUsed, at: now }
    if (o && !isReset && n.percentUsed > o.percentUsed) {
      const prev = deltas[n.kind]
      const carry = prev && now - prev.at < DELTA_MS ? prev.value : 0
      deltas[n.kind] = { value: carry + n.percentUsed - o.percentUsed, at: now }
    }
    if (isReset) {
      party[n.kind] = now
      sound = 'sounds/chime.wav'
    }

    const r = reached(n.percentUsed)
    const key = `${n.kind}@${n.resetsAt ?? ''}`
    if (r > (warned[key] ?? 0)) {
      warned[key] = r
      warnedChanged = true
      if (prefs.toasts) {
        const L = T[prefs.lang]
        const until = untilReset(n.resetsAt, now, prefs.lang)
        $.ui.toast(
          r >= 100
            ? L.toastFull(quip(n.resetsAt, prefs.lang), label(n.kind), until)
            : `${r >= 90 ? '🥵' : '⚠'} ${L.toastAt(label(n.kind), Math.round(n.percentUsed), until)}`,
          { timeoutMs: 6000 },
        )
      }
      if (r >= 90) sound = 'sounds/warn.wav'
    }
    history = appendSample(history, n.kind, [now, n.percentUsed], now)
  }

  await update($, limitsA, () => keep(next))
  await update($, motionA, () => motion)
  await update($, deltasA, () => deltas)
  await update($, partyA, () => party)
  await update($, historyA, () => history)
  await $.store.set('history', history)
  if (warnedChanged) {
    // only the current windows' marks are worth keeping
    const live = new Set(next.map(n => `${n.kind}@${n.resetsAt ?? ''}`))
    await $.store.set('warned', Object.fromEntries(Object.entries(warned).filter(([k]) => live.has(k))))
  }
  const five = pick(next, 'five_hour')?.percentUsed ?? 0
  const record = ((await $.store.get('record')) ?? null) as { p: number; t: number } | null
  if (!record || five > record.p) await $.store.set('record', { p: five, t: now })

  if (sound && prefs.sound) void $.audio.play({ asset: sound }).catch(() => undefined)
  if (prefs.animation) animate($, now, Math.max(SLIDE_MS, DELTA_MS, PARTY_MS))
  else void $.clock.after(DELTA_MS + 50, () => $.ui.invalidate('ui.render'))
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await update($, prefsA, () => prefsOf(options, undefined))
    const stored = await $.store.get('prefs')
    await update($, prefsA, () => prefsOf(options, stored))
    const history = ((await $.store.get('history')) ?? {}) as History
    await update($, historyA, () => history)
    const usage = await $.session.usage()
    await update($, limitsA, () => keep(usage.rateLimits))

    await $.command.register({
      name: 'usage-bars',
      description: 'Usage bars: stats, demo, mode, style, language (/usage-bars help)',
      argumentHint: '[stats|demo|full|compact|off|style <name>|lang en|de|anim|sound|toasts|face on|off]',
      immediate: true,
    })

    // Countdown, local reset detection, idle wiggle.
    tickTimer?.cancel()
    tickTimer = $.clock.every(1000, () => {
      ticks += 1
      void (async () => {
        const now = await $.clock.now()
        const list = await read($, limitsA)
        const prefs = await read($, prefsA)
        const expired = list.filter(l => l.resetsAt && Date.parse(l.resetsAt) <= now && l.percentUsed > 0)
        if (expired.length) {
          // The window reset while nothing asked the API: zero it ourselves.
          await apply($, list.map(l => (expired.includes(l) ? { kind: l.kind, percentUsed: 0 } : l)), now)
          return
        }
        const soon = list.some(l => l.resetsAt && Date.parse(l.resetsAt) - now < 3600_000)
        const wiggle = prefs.animation && (prefs.style === 'hourglass' || prefs.style === 'battery')
        if (soon || wiggle || ticks % 30 === 0) $.ui.invalidate('ui.render')
      })()
    })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) await apply($, keep(e.rateLimits), await $.clock.now())
    return next(e)
  })

  on('command.run', { command: 'usage-bars' }, async ($, e) => {
    const [cmd = '', arg = ''] = e.args.trim().toLowerCase().split(/\s+/)
    const prefs = await read($, prefsA)
    const save = async (p: Prefs) => {
      await update($, prefsA, () => p)
      await $.store.set('prefs', p)
      $.ui.invalidate('ui.render')
    }
    const now = await $.clock.now()

    const de = prefs.lang === 'de'
    const tr = (en: string, ger: string) => (de ? ger : en)
    const onOff = (v: boolean) => (v ? tr('on', 'an') : tr('off', 'aus'))

    if (MODES.includes(cmd as Mode)) {
      await save({ ...prefs, mode: cmd as Mode })
      return { text: `${tr('mode', 'Modus')} ${cmd}` }
    }
    const style = (cmd === 'style' ? arg : cmd) as Style
    if (STYLES.includes(style)) {
      await save({ ...prefs, style, mode: 'full' })
      return { text: `${tr('style', 'Stil')} ${style}` }
    }
    if (cmd === 'style') return { text: `${tr('styles', 'Stile')}: ${STYLES.join(', ')} (${tr('current', 'aktuell')} ${prefs.style})` }

    if (cmd === 'lang' || cmd === 'language' || cmd === 'sprache') {
      const lang = LANGS.includes(arg as Lang) ? (arg as Lang) : prefs.lang === 'en' ? 'de' : 'en'
      await save({ ...prefs, lang })
      return { text: lang === 'de' ? 'Sprache: Deutsch' : 'Language: English' }
    }

    const flag = ({ anim: 'animation', animation: 'animation', sound: 'sound', ton: 'sound', toasts: 'toasts', face: 'face', gesicht: 'face' } as Record<string, Flag>)[cmd]
    if (flag) {
      const value = arg === 'on' || arg === 'an' ? true : arg === 'off' || arg === 'aus' ? false : !prefs[flag]
      await save({ ...prefs, [flag]: value })
      return { text: `${flag} ${onOff(value)}` }
    }

    if (cmd === 'demo') {
      const list = await read($, limitsA)
      const five = pick(list, 'five_hour')?.percentUsed ?? 42
      await update($, motionA, m => ({ ...m, five_hour: { from: 0, to: five, at: now }, seven_day: { from: 0, to: pick(list, 'seven_day')?.percentUsed ?? 0, at: now + PARTY_MS } }))
      await update($, deltasA, d => ({ ...d, five_hour: { value: 7, at: now } }))
      await update($, partyA, p => ({ ...p, seven_day: now }))
      if (prefs.sound) void $.audio.play({ asset: 'sounds/chime.wav' }).catch(() => undefined)
      if (list.length === 0) $.ui.toast(T[prefs.lang].noData)
      animate($, now, PARTY_MS + SLIDE_MS + DELTA_MS)
      return { text: tr('🎬 Demo running (under the prompt)', '🎬 Demo läuft (unter dem Prompt)') }
    }

    if (cmd === 'stats') {
      const list = await read($, limitsA)
      const history = await read($, historyA)
      const record = ((await $.store.get('record')) ?? null) as { p: number; t: number } | null
      const L = T[prefs.lang]
      const lines = [tr('Stats', 'Statistik')]
      for (const w of WINDOWS) {
        const l = pick(list, w.kind)
        if (!l) {
          lines.push(`  ${w.label}  ${tr('no reading', 'keine Messung')}`)
          continue
        }
        const r = rate(history[w.kind], w.kind, l.resetsAt, l.percentUsed, now)
        const dry = runsDryAt(r, l.resetsAt)
        const at = l.resetsAt ? Date.parse(l.resetsAt) : NaN
        lines.push(
          `  ${w.label}  ${Math.round(l.percentUsed)} % ${tr('used', 'verbraucht')}` +
            (Number.isNaN(at) ? '' : ` · ${L.resetAt(clockTime(at, now, prefs.lang))} (${tr('in', 'in')} ${untilReset(l.resetsAt, now, prefs.lang)})`) +
            (r ? ` · ${num1(r.perHour, prefs.lang)} %/h` : '') +
            (dry ? ` · ${L.dry(clockTime(dry, now, prefs.lang))}` : r ? ` · ${tr('lasts until the reset', 'reicht bis zum Reset')}` : ''),
        )
      }
      lines.push(`  ${tr('5h peaks, 24h', '5h-Spitzen 24h')}  ${spark(peaks(history.five_hour, now, 3600_000, 24))}`)
      lines.push(`  ${tr('5h peaks, 7d ', '5h-Spitzen 7T ')}  ${spark(peaks(history.five_hour, now, 86400_000, 7))}`)
      if (record) {
        const d = new Date(record.t)
        lines.push(`  ${tr('Record 5h', 'Rekord 5h')}: ${Math.round(record.p)} % · ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
      }
      lines.push(`  ${tr('style', 'Stil')} ${prefs.style} · ${tr('mode', 'Modus')} ${prefs.mode} · animation ${onOff(prefs.animation)} · sound ${onOff(prefs.sound)}`)
      return { text: lines.join('\n') }
    }

    return {
      text: [
        tr('Commands:', 'Befehle:'),
        `  /usage-bars stats             ${tr('rate, projection, history, record', 'Rate, Hochrechnung, Verlauf, Rekord')}`,
        `  /usage-bars demo              ${tr('play the animation', 'Animation vorführen')}`,
        `  /usage-bars full|compact|off  ${tr('display', 'Darstellung')}`,
        `  /usage-bars style <name>      ${STYLES.join(' · ')}`,
        `  /usage-bars lang en|de        ${tr('language', 'Sprache')}`,
        '  /usage-bars anim|sound|toasts|face [on|off]',
        `${tr('Now', 'Aktuell')}: ${prefs.mode}, ${prefs.style}, ${prefs.lang}, animation ${onOff(prefs.animation)}, sound ${onOff(prefs.sound)}, toasts ${onOff(prefs.toasts)}, face ${onOff(prefs.face)}`,
      ].join('\n'),
    }
  })

  // Claude Code completes the command's name, not its arguments, so the line
  // under the prompt lists what may follow while the draft is `/usage-bars …`.
  // Only such drafts redraw: typing a normal prompt costs nothing.
  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    redrawIfOurs($, r.text)
    return r
  })
  on('prompt.submit', async ($, e, next) => {
    const r = await next(e)
    redrawIfOurs($, '')
    return r
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const prefs = await read($, prefsA)
    // A surface without a prompt box (or a read that fails) just shows the bars.
    const draft = (await $.prompt.read().catch(() => undefined))?.text ?? ''
    const options = complete(draft, prefs.lang)
    if (options) {
      const { Box, Text } = $.ui.resolve(e)
      const one = options.length === 1 ? options[0] : undefined
      return (
        <Box flexDirection="column">
          {await next(e)}
          <Box key="usage-bars-complete" flexDirection="row">
            <Text dimColor>{'⌨ '}</Text>
            {options.map((o, i) => (
              <Text key={o.word} wrap="truncate-end">
                {i > 0 ? <Text dimColor>{' · '}</Text> : null}
                <Text bold color="#79c0ff">{o.word.slice(0, o.typed)}</Text>
                <Text color="#e6edf3">{o.word.slice(o.typed)}</Text>
              </Text>
            ))}
            {one ? <Text dimColor wrap="truncate-end">{`  — ${one.hint}`}</Text> : null}
          </Box>
        </Box>
      )
    }
    if (prefs.mode === 'off') return next(e)
    const list = await read($, limitsA)
    const shown = WINDOWS.filter(w => pick(list, w.kind))
    if (shown.length === 0) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const columns = e.viewport?.columns ?? 100
    const compact = prefs.mode === 'compact' || columns < COMPACT_BELOW
    const width = barWidth(columns)
    const motion = await read($, motionA)
    const deltas = await read($, deltasA)
    const party = await read($, partyA)
    const history = await read($, historyA)
    const segsOf = (kind: string): Seg[] =>
      rowSegs({
        limit: pick(list, kind)!,
        prefs,
        now,
        width,
        compact,
        motion: motion[kind],
        delta: deltas[kind],
        partyAt: party[kind],
        history,
      })
    const detail = detailText(shown.map(w => pick(list, w.kind)!), history, now, prefs.lang)

    const text = (s: Seg, k: string) => (
      <Text key={k} color={s.color} backgroundColor={s.bg} dimColor={s.dim} bold={s.bold} wrap="truncate-end">
        {s.text}
      </Text>
    )

    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box key="usage-bars" flexDirection="row">
          {shown.map((w, i) => (
            <Box key={w.kind} flexDirection="row" marginRight={i < shown.length - 1 ? 3 : 0}>
              {segsOf(w.kind).map((s, j) => text(s, `${w.kind}-${j}`))}
            </Box>
          ))}
          {compact ? null : (
            <Box position="absolute" top={0} left={0} right={0} display="none" hover={{ display: 'flex' }} backgroundColor="#30363d">
              <Text color="#e6edf3" wrap="truncate-end">
                {detail}
              </Text>
            </Box>
          )}
        </Box>
      </Box>
    )
  })
}
