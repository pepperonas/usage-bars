import { describe, expect, test } from 'claude-code/testing'
import { STYLES, drawStyle, gradient, merge } from './styles'

const text = (segs: { text: string }[]) => segs.map(s => s.text).join('')
const ctx = { chomp: false, second: 0 }

describe('styles', () => {
  test('bars: eighth blocks give sub-cell resolution', async () => {
    expect(text(drawStyle('bars', 0, 10, ctx))).toBe('░░░░░░░░░░')
    expect(text(drawStyle('bars', 100, 10, ctx))).toBe('██████████')
    expect(text(drawStyle('bars', 25, 10, ctx))).toBe('██▌░░░░░░░')
  })
  test('bars: pace mark sits where even use would be', async () => {
    expect(text(drawStyle('bars', 10, 10, { ...ctx, pace: 0.5 }))).toBe('█░░░░│░░░░')
  })
  test('pacman: eats up to the value, a ghost chases it from 90 %', async () => {
    expect(text(drawStyle('pacman', 50, 10, ctx)).indexOf('ᗧ')).toBe(5)
    expect(text(drawStyle('pacman', 50, 10, ctx))).not.toContain('ᗣ')
    expect(text(drawStyle('pacman', 92, 12, ctx))).toBe('─────────ᗣ─ᗧ')
    expect(text(drawStyle('pacman', 50, 10, { ...ctx, chomp: true }))).toContain('●')
  })
  test('battery, beer, tank and hourglass show what is left', async () => {
    expect((text(drawStyle('battery', 30, 10, ctx)).match(/█/g) ?? []).length).toBe(7)
    expect(text(drawStyle('tank', 50, 20, ctx))).toBe('⛽E ▮▮▮▮▮▯▯▯▯▯ F')
    expect(text(drawStyle('beer', 0, 4, ctx))).toContain('🍺')
    expect((text(drawStyle('hourglass', 75, 8, ctx)).match(/⣿/g) ?? []).length).toBe(2)
  })
  test('every style draws at every value without throwing', async () => {
    for (const s of STYLES) for (const p of [0, 1, 49.5, 99, 100, 130]) expect(text(drawStyle(s, p, 12, { ...ctx, pace: 0.3 })).length > 0).toBe(true)
  })
  test('gradient runs green to red; merge joins look-alikes', async () => {
    expect(gradient(0)).toBe('#3fb950')
    expect(gradient(1)).toBe('#f85149')
    expect(merge([{ text: 'a', color: 'x' }, { text: 'b', color: 'x' }, { text: 'c' }])).toEqual([{ text: 'ab', color: 'x' }, { text: 'c' }])
  })
})
