import type { Style } from '../types'
import { clamp } from './format'

export type Seg = { text: string; color?: string; bg?: string; dim?: boolean; bold?: boolean }

export const STYLES: readonly Style[] = ['bars', 'pacman', 'beer', 'tank', 'battery', 'hourglass']

export const GREEN = '#3fb950'
export const YELLOW = '#d29922'
export const RED = '#f85149'
const MARK = '#8b949e'
const TICK = '#ffffff'
const TRACK = '#30363d'
/** The pace mark drawn through a filled cell: a thin line on the fill colour. */
const tick = (fill: string): Seg => ({ text: '│', color: TICK, bg: fill })

const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0')
function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16))
  return '#' + pa.map((v, i) => hex(v + (pb[i]! - v) * t)).join('')
}

/** green → yellow → red along 0..1 */
export function gradient(pos: number): string {
  const t = clamp(pos, 0, 1)
  return t < 0.6 ? mix(GREEN, YELLOW, t / 0.6) : mix(YELLOW, RED, (t - 0.6) / 0.4)
}

/** Joins neighbours that look alike, so a bar is a handful of Texts. */
export function merge(segs: readonly Seg[]): Seg[] {
  const out: Seg[] = []
  for (const s of segs) {
    const last = out[out.length - 1]
    if (last && last.color === s.color && last.bg === s.bg && last.dim === s.dim && last.bold === s.bold) {
      out[out.length - 1] = { ...last, text: last.text + s.text }
    } else out.push({ ...s })
  }
  return out
}

export type StyleCtx = {
  /** Even-pace position, 0..1 of the window gone; undefined hides the mark. */
  pace?: number
  /** True on alternating frames while the bar moves (Pac-Man's mouth). */
  chomp: boolean
  /** Changes every second: idle wiggle. */
  second: number
}

const EIGHTHS = ' ▏▎▍▌▋▊▉'

/** Cells (fractional) a value covers. */
const cover = (p: number, width: number) => (clamp(p, 0, 100) / 100) * width
const markCell = (pace: number | undefined, width: number) =>
  pace === undefined ? -1 : clamp(Math.round(pace * width - 0.5), 0, width - 1)

function bars(p: number, width: number, ctx: StyleCtx): Seg[] {
  const c = cover(p, width)
  const full = Math.floor(c)
  const part = Math.floor((c - full) * 8)
  const mark = markCell(ctx.pace, width)
  const segs: Seg[] = []
  for (let i = 0; i < width; i++) {
    const col = gradient(width > 1 ? i / (width - 1) : 0)
    if (i < full) segs.push(i === mark ? tick(col) : { text: '█', color: col })
    else if (i === full && part > 0) segs.push({ text: EIGHTHS[part]!, color: col })
    else if (i === mark) segs.push({ text: '│', color: MARK })
    else segs.push({ text: '░', dim: true })
  }
  return merge(segs)
}

function pacman(p: number, width: number, ctx: StyleCtx): Seg[] {
  const pos = clamp(Math.floor(cover(p, width)), 0, width - 1)
  const mark = markCell(ctx.pace, width)
  const segs: Seg[] = []
  for (let i = 0; i < width; i++) {
    // from 90 % a ghost chases Pac-Man two cells behind
    if (p >= 90 && i === pos - 2) segs.push({ text: 'ᗣ', color: RED, bold: true })
    else if (i < pos) segs.push({ text: '─', color: TRACK })
    else if (i === pos) segs.push({ text: ctx.chomp ? '●' : 'ᗧ', color: '#f2cc60', bold: true })
    else if (i === mark) segs.push({ text: '┊', color: MARK })
    else segs.push({ text: (i - pos) % 4 === 0 ? '•' : '·', color: (i - pos) % 4 === 0 ? '#f0b6a8' : undefined, dim: (i - pos) % 4 !== 0 })
  }
  return merge(segs)
}

/** Traffic-light colour of a fill by what is used, as the percent next to it. */
const usedColor = (p: number) => (p >= 80 ? RED : p >= 50 ? YELLOW : GREEN)

/*
 * Every style reads like `bars`: the fill from the left is what is used, the
 * empty track behind it is what is left, and the pace mark sits at the same cell.
 */

/** The glass fills with what you drank; the foam rides on top. */
function beer(p: number, width: number, ctx: StyleCtx): Seg[] {
  const used = Math.round(cover(p, width))
  const mark = markCell(ctx.pace, width)
  const segs: Seg[] = [{ text: '🍺' }, { text: '▕', dim: true }]
  for (let i = 0; i < width; i++) {
    if (i < used - 1) segs.push(i === mark ? tick('#e3a008') : { text: '█', color: '#e3a008' })
    else if (i === used - 1) segs.push({ text: '▓', color: '#f5f0e1' })
    else if (i === mark) segs.push({ text: '│', color: MARK })
    else segs.push({ text: '░', dim: true })
  }
  segs.push({ text: '▏', dim: true })
  return merge(segs)
}

/** Drained charge from the left; ⚡ flashes from 90 % used. */
function battery(p: number, width: number, ctx: StyleCtx): Seg[] {
  const used = clamp(p, 0, 100)
  const n = Math.round(cover(used, width))
  const col = usedColor(used)
  const mark = markCell(ctx.pace, width)
  const segs: Seg[] = [{ text: '▕', dim: true }]
  for (let i = 0; i < width; i++) {
    if (i < n) segs.push(i === mark ? tick(col) : { text: '█', color: col })
    else if (i === mark) segs.push({ text: '│', color: MARK })
    else segs.push({ text: '░', dim: true })
  }
  segs.push({ text: '▏', dim: true }, { text: '▌', dim: true })
  if (used >= 90 && ctx.second % 2 === 0) segs.push({ text: '⚡', color: YELLOW })
  return merge(segs)
}

/** Burnt fuel ▮ from the left, what is left ▯ behind it. */
function tank(p: number, width: number, ctx: StyleCtx): Seg[] {
  const cells = Math.max(4, Math.floor(width / 2))
  const used = clamp(p, 0, 100)
  const n = Math.round((used / 100) * cells)
  const col = usedColor(used)
  const mark = markCell(ctx.pace, cells)
  const segs: Seg[] = [{ text: '⛽ ', dim: true }]
  for (let i = 0; i < cells; i++) {
    const glyph = i < n ? '▮' : '▯'
    segs.push(i === mark ? { text: glyph, color: TICK, bold: true } : i < n ? { text: glyph, color: col } : { text: glyph, dim: true })
  }
  return merge(segs)
}

/** Sand that has run through ⣿ from the left, sand still to come ⣀ behind it. */
function hourglass(p: number, width: number, ctx: StyleCtx): Seg[] {
  const used = Math.round(cover(p, width))
  const mark = markCell(ctx.pace, width)
  const segs: Seg[] = [{ text: ctx.second % 2 === 0 ? '⏳' : '⌛' }]
  for (let i = 0; i < width; i++) {
    if (i === mark) segs.push({ text: '│', color: MARK })
    else if (i < used) segs.push({ text: '⣿', color: '#d4a373' })
    else segs.push({ text: '⣀', dim: true })
  }
  return merge(segs)
}

const DRAW: Record<Style, (p: number, w: number, c: StyleCtx) => Seg[]> = {
  bars,
  pacman,
  beer,
  tank,
  battery,
  hourglass,
}

export function drawStyle(style: Style, p: number, width: number, ctx: StyleCtx): Seg[] {
  return (DRAW[style] ?? bars)(p, width, ctx)
}

/** A short sparkle line for the reset party, moving with `frame`. */
export function sparkle(width: number, frame: number): Seg[] {
  const glyphs = ['✦', '✧', '·', '⋆', '✶', ' ']
  const colors = ['#f2cc60', '#79c0ff', '#d2a8ff', '#7ee787', '#ff7b72']
  const segs: Seg[] = []
  for (let i = 0; i < width; i++) {
    const k = (i * 7 + frame * 3) % 11
    segs.push(k < glyphs.length ? { text: glyphs[k]!, color: colors[(i + frame) % colors.length] } : { text: ' ' })
  }
  return merge(segs)
}
