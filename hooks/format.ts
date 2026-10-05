import type { History, Lang, Limit, Motion, Sample } from '../types'
import { T } from './i18n'

export const WINDOWS = [
  { kind: 'five_hour', label: '5h', lengthMs: 5 * 3600_000 },
  { kind: 'seven_day', label: '7d', lengthMs: 7 * 86400_000 },
] as const

export const SLIDE_MS = 700
export const DELTA_MS = 4000
export const PARTY_MS = 2600
export const THRESHOLDS = [50, 80, 90, 100] as const

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Filled cells of a bar `width` wide for `percent` (0–100, clamped). */
export function filled(percent: number, width: number): number {
  return Math.round((clamp(percent, 0, 100) / 100) * width)
}

/** green below 50 %, yellow below 80 %, red from there. */
export function tone(percent: number): string {
  if (percent >= 80) return 'red'
  if (percent >= 50) return 'yellow'
  return 'green'
}

/** easeOutCubic */
export const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3

/** Where a gliding bar stands at `now`; `to` once the glide is over. */
export function glide(m: Motion | undefined, now: number): number | undefined {
  if (!m) return undefined
  const t = (now - m.at) / SLIDE_MS
  if (t >= 1) return m.to
  return m.from + (m.to - m.from) * ease(t)
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Time until reset: `12m41s` under an hour, `2h13m`, `3d 4h`. */
export function untilReset(resetsAt: string | undefined, nowMs: number, lang: Lang = 'en'): string {
  if (!resetsAt) return ''
  const at = Date.parse(resetsAt)
  if (Number.isNaN(at)) return ''
  const sec = Math.max(0, Math.ceil((at - nowMs) / 1000))
  if (sec < 3600) return `${Math.floor(sec / 60)}m${pad2(sec % 60)}s`
  const min = Math.round(sec / 60)
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h${pad2(min % 60)}m`
  return `${Math.floor(h / 24)}${T[lang].day} ${h % 24}h`
}

/** A wall-clock time: `17:30` today, `Mon 09:00` further out. */
export function clockTime(ms: number, nowMs: number, lang: Lang = 'en'): string {
  const d = new Date(ms)
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  if (ms - nowMs < 20 * 3600_000 && new Date(nowMs).getDate() === d.getDate()) return hm
  const wd = T[lang].weekdays[d.getDay()]
  return `${wd} ${hm}`
}

export const percentText = (p: number) => `${Math.round(p)}%`.padStart(4)

/** Bar width so both segments fit the line: 6 to 24 cells. */
export function barWidth(columns: number): number {
  // per segment: label 3 + bar + "100%" 5 + " ↻ 12m41s" 9 + face 3 + gap 3
  const fixed = 3 + 5 + 9 + 3 + 3
  return clamp(Math.floor(columns / 2) - fixed, 6, 24)
}

export const COMPACT_BELOW = 72

export function pick(limits: readonly Limit[], kind: string): Limit | undefined {
  return limits.find(l => l.kind === kind)
}

export function windowLength(kind: string): number | undefined {
  return WINDOWS.find(w => w.kind === kind)?.lengthMs
}

/** How far into its window we are, 0..1; undefined without a reset time. */
export function elapsed(kind: string, resetsAt: string | undefined, now: number): number | undefined {
  const len = windowLength(kind)
  const at = resetsAt ? Date.parse(resetsAt) : NaN
  if (!len || Number.isNaN(at)) return undefined
  return clamp(1 - (at - now) / len, 0, 1)
}

/** Used share against the even pace: 1 = right on, >1 = too fast. */
export function paceRatio(percent: number, frac: number | undefined): number | undefined {
  if (frac === undefined || frac < 0.03) return undefined
  return percent / (frac * 100)
}

export function face(percent: number, ratio: number | undefined): string {
  if (percent >= 100) return '💀'
  if (percent >= 90) return '🥵'
  if (ratio === undefined) return '🙂'
  if (ratio < 0.8) return '😎'
  if (ratio < 1.15) return '🙂'
  return '😬'
}

export type Rate = { perHour: number; emptyAt?: number }

/**
 * Burn rate from this window's samples, and when it runs dry at that rate.
 * Needs 10 minutes of samples inside the current window and a rising value.
 */
export function rate(samples: readonly Sample[] | undefined, kind: string, resetsAt: string | undefined, percent: number, now: number): Rate | undefined {
  const len = windowLength(kind)
  const at = resetsAt ? Date.parse(resetsAt) : NaN
  if (!samples?.length || !len || Number.isNaN(at)) return undefined
  const start = at - len
  const first = samples.find(([t]) => t >= start)
  if (!first) return undefined
  const span = now - first[0]
  const rise = percent - first[1]
  if (span < 10 * 60_000 || rise <= 0) return undefined
  const perMs = rise / span
  return { perHour: perMs * 3600_000, emptyAt: percent >= 100 ? now : now + (100 - percent) / perMs }
}

/** Runs dry before the window resets? Then when. */
export function runsDryAt(r: Rate | undefined, resetsAt: string | undefined): number | undefined {
  const at = resetsAt ? Date.parse(resetsAt) : NaN
  if (!r?.emptyAt || Number.isNaN(at)) return undefined
  return r.emptyAt < at ? r.emptyAt : undefined
}

export function appendSample(h: History, kind: string, s: Sample, now: number): History {
  const keepFrom = now - 8 * 86400_000
  const list = (h[kind] ?? []).filter(([t]) => t >= keepFrom)
  const last = list[list.length - 1]
  if (last && last[1] === s[1] && s[0] - last[0] < 60_000) return h
  return { ...h, [kind]: [...list, s].slice(-3000) }
}

const SPARK = '▁▂▃▄▅▆▇█'
export function spark(values: readonly (number | undefined)[]): string {
  return values
    .map(v => (v === undefined ? '·' : SPARK[clamp(Math.round((v / 100) * 7), 0, 7)]))
    .join('')
}

/** Peak per bucket over the last `count` buckets of `bucketMs`, oldest first. */
export function peaks(samples: readonly Sample[] | undefined, now: number, bucketMs: number, count: number): (number | undefined)[] {
  const out: (number | undefined)[] = Array.from({ length: count }, () => undefined)
  for (const [t, p] of samples ?? []) {
    const i = count - 1 - Math.floor((now - t) / bucketMs)
    if (i >= 0 && i < count) out[i] = Math.max(out[i] ?? 0, p)
  }
  return out
}

/** The highest threshold `percent` has reached, or 0. */
export function reached(percent: number): number {
  return [...THRESHOLDS].reverse().find(t => percent >= t) ?? 0
}

export function quip(seed: string | undefined, lang: Lang = 'en'): string {
  let h = 0
  for (const c of seed ?? '') h = (h * 31 + c.charCodeAt(0)) >>> 0
  const q = T[lang].quips
  return q[h % q.length]!
}
