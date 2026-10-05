import { test } from 'node:test'
import assert from 'node:assert/strict'

import { STYLES, drawStyle, gradient, merge, sparkle } from '../hooks/styles.ts'

const text = (segs: { text: string }[]) => segs.map(s => s.text).join('')
const ctx = { chomp: false, second: 0 }
const width = (s: string) => [...s].length

test('bars: eighth blocks give eight steps per cell', () => {
  assert.equal(text(drawStyle('bars', 0, 10, ctx)), '░░░░░░░░░░')
  assert.equal(text(drawStyle('bars', 100, 10, ctx)), '██████████')
  assert.equal(text(drawStyle('bars', 25, 10, ctx)), '██▌░░░░░░░')
  assert.equal(text(drawStyle('bars', 21.25, 10, ctx)), '██▏░░░░░░░')
})

test('bars: the pace mark sits right after where even use would end', () => {
  assert.equal(text(drawStyle('bars', 10, 10, { ...ctx, pace: 0.5 })), '█░░░░│░░░░')
  assert.equal(text(drawStyle('bars', 10, 10, ctx)).includes('│'), false)
})

test('the pace mark inside a filled bar is a thin line on the fill, not a block', () => {
  for (const style of ['bars', 'battery', 'beer'] as const) {
    const p = style === 'bars' ? 90 : 10 // the mark lands inside the filled part
    const mark = drawStyle(style, p, 10, { ...ctx, pace: 0.5 }).find(s => s.text === '│')
    assert.ok(mark, `${style}: no mark`)
    assert.ok(mark.bg, `${style}: the mark has no fill behind it`)
  }
})

test('empty cells stay visible in every bar-like style', () => {
  for (const style of ['bars', 'battery', 'beer'] as const) assert.ok(text(drawStyle(style, 50, 10, ctx)).includes('░'), style)
})

test('bars: colours run green → red along the bar', () => {
  const segs = drawStyle('bars', 100, 10, ctx)
  assert.equal(segs[0]!.color, '#3fb950')
  assert.equal(segs[segs.length - 1]!.color, '#f85149')
})

test('pacman eats up to the value; a ghost chases it from 90 %', () => {
  assert.equal(text(drawStyle('pacman', 50, 10, ctx)).indexOf('ᗧ'), 5)
  assert.equal(text(drawStyle('pacman', 50, 10, ctx)).includes('ᗣ'), false)
  assert.equal(text(drawStyle('pacman', 92, 12, ctx)), '─────────ᗣ─ᗧ')
  assert.ok(text(drawStyle('pacman', 50, 10, { ...ctx, chomp: true })).includes('●'))
})

test('battery, beer, tank and hourglass show what is left', () => {
  assert.equal((text(drawStyle('battery', 30, 10, ctx)).match(/█/g) ?? []).length, 7)
  assert.equal(text(drawStyle('tank', 50, 20, ctx)), '⛽E ▮▮▮▮▮▯▯▯▯▯ F')
  assert.ok(text(drawStyle('beer', 0, 4, ctx)).startsWith('🍺'))
  assert.equal((text(drawStyle('hourglass', 75, 8, ctx)).match(/⣿/g) ?? []).length, 2)
})

test('the battery flashes ⚡ when almost empty', () => {
  assert.ok(text(drawStyle('battery', 95, 10, { ...ctx, second: 0 })).includes('⚡'))
  assert.equal(text(drawStyle('battery', 95, 10, { ...ctx, second: 1 })).includes('⚡'), false)
  assert.equal(text(drawStyle('battery', 50, 10, ctx)).includes('⚡'), false)
})

test('every style keeps its width at every value', () => {
  for (const s of STYLES) {
    const widths = new Set<number>()
    for (const p of [0, 0.4, 1, 33.3, 49.5, 50, 90, 99, 100, 130, -3]) {
      const t = text(drawStyle(s, p, 12, { ...ctx, pace: 0.3 }))
      assert.ok(t.length > 0)
      if (s !== 'battery') widths.add(width(t)) // battery adds ⚡ near empty
    }
    if (s !== 'battery') assert.equal(widths.size, 1, `${s} changes width: ${[...widths]}`)
  }
})

test('gradient endpoints and merge', () => {
  assert.equal(gradient(0), '#3fb950')
  assert.equal(gradient(1), '#f85149')
  assert.equal(gradient(-1), '#3fb950')
  assert.deepEqual(merge([{ text: 'a', color: 'x' }, { text: 'b', color: 'x' }, { text: 'c' }]), [{ text: 'ab', color: 'x' }, { text: 'c' }])
})

test('sparkle moves with the frame and keeps its width', () => {
  assert.notEqual(text(sparkle(12, 0)), text(sparkle(12, 1)))
  assert.equal(width(text(sparkle(12, 3))), 12)
})
