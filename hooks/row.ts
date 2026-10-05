import type { Delta, History, Lang, Limit, Motion, Prefs } from '../types'
import {
  DELTA_MS,
  PARTY_MS,
  SLIDE_MS,
  WINDOWS,
  clockTime,
  elapsed,
  face,
  glide,
  paceRatio,
  peaks,
  percentText,
  quip,
  rate,
  runsDryAt,
  spark,
  tone,
  untilReset,
} from './format'
import { T, num1 } from './i18n'
import { GREEN, RED, YELLOW, drawStyle, sparkle } from './styles'
import type { Seg } from './styles'

export type RowInput = {
  limit: Limit
  prefs: Prefs
  now: number
  width: number
  compact: boolean
  motion?: Motion
  delta?: Delta
  partyAt?: number
  history?: History
}

export const label = (kind: string) => WINDOWS.find(w => w.kind === kind)?.label ?? kind

/**
 * One window's segment of the line under the prompt, as plain styled text:
 * `5h ██████▌░░│░░ 42% +3% 😎 ↻ 2h13m ⚠ empty ~16:40`.
 */
export function rowSegs(i: RowInput): Seg[] {
  const { limit: l, prefs, now, width, compact } = i
  const lang = prefs.lang
  const kind = l.kind
  const real = l.percentUsed
  const m = i.motion
  const isMoving = prefs.animation && !!m && now - m.at < SLIDE_MS && now >= m.at
  const p = prefs.animation ? (m && now < m.at ? m.from : glide(m, now) ?? real) : real
  const frac = elapsed(kind, l.resetsAt, now)
  const until = untilReset(l.resetsAt, now, lang)
  const dry = runsDryAt(rate(i.history?.[kind], kind, l.resetsAt, real, now), l.resetsAt)
  const partyAge = now - (i.partyAt ?? -Infinity)
  const isParty = prefs.animation && partyAge >= 0 && partyAge < PARTY_MS
  const d = i.delta
  const dAge = d ? now - d.at : Infinity
  const frame = Math.floor(now / 90)

  const out: Seg[] = [{ text: `${label(kind)} `, dim: true }]
  if (isParty) {
    out.push(...sparkle(compact ? 6 : width, frame), { text: ` ${T[lang].refuelled}`, color: GREEN, bold: true })
    return out
  }
  if (real >= 100 && !compact) {
    out.push({ text: quip(l.resetsAt, lang), color: YELLOW, bold: true }, { text: until ? T[lang].backIn(until) : '', dim: true })
    return out
  }
  if (!compact) {
    out.push(...drawStyle(prefs.style, p, width, { pace: frac, chomp: isMoving && frame % 2 === 0, second: Math.floor(now / 1000) }))
    out.push({ text: ' ' })
  }
  const t = tone(real)
  out.push({ text: compact ? percentText(p).trimStart() : percentText(p), color: t === 'red' ? RED : t === 'yellow' ? YELLOW : GREEN })
  if (d && dAge < DELTA_MS) {
    const delta = ` +${Math.round(d.value)}%`
    out.push(
      !prefs.animation || dAge < 1200
        ? { text: delta, color: YELLOW, bold: true }
        : dAge < 2500
          ? { text: delta, color: YELLOW }
          : { text: delta, dim: true },
    )
  }
  if (prefs.face) out.push({ text: ` ${face(real, paceRatio(real, frac))}` })
  if (until) out.push({ text: compact ? ` ↻${until}` : ` ↻ ${until}`, dim: true })
  if (dry) out.push(compact ? { text: ' ⚠', color: RED } : { text: ` ${T[lang].dry(clockTime(dry, now, lang))}`, color: RED, bold: true })
  return out
}

/** The hover card: reset time, burn rate and a sparkline per window. */
export function detailText(limits: readonly Limit[], history: History, now: number, lang: Lang = 'en'): string {
  return limits
    .map(l => {
      const r = rate(history[l.kind], l.kind, l.resetsAt, l.percentUsed, now)
      const at = l.resetsAt ? Date.parse(l.resetsAt) : NaN
      const sp =
        l.kind === 'five_hour'
          ? `24h ${spark(peaks(history.five_hour, now, 3600_000, 24))}`
          : `7${T[lang].day} ${spark(peaks(history.five_hour, now, 86400_000, 7))}`
      const reset = Number.isNaN(at) ? T[lang].resetOpen : T[lang].resetAt(clockTime(at, now, lang))
      return `${label(l.kind)}: ${reset}${r ? ` · ${num1(r.perHour, lang)} %/h` : ''} · ${sp}`
    })
    .join('   ')
}
