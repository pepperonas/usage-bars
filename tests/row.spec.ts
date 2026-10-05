import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { Prefs } from '../types/index.d.ts'
import { detailText, rowSegs } from '../hooks/row.ts'

const H = 3600_000
const iso = (ms: number) => new Date(ms).toISOString()
const prefs: Prefs = { mode: 'full', style: 'bars', animation: true, sound: false, toasts: true, face: true, lang: 'en' }
const text = (segs: { text: string }[]) => segs.map(s => s.text).join('')
const NOW = 10 * H

const row = (over: Partial<Parameters<typeof rowSegs>[0]> = {}) =>
  text(rowSegs({ limit: { kind: 'five_hour', percentUsed: 42, resetsAt: iso(NOW + 2 * H + 13 * 60_000) }, prefs, now: NOW, width: 12, compact: false, ...over }))

test('a full row: label, bar, percent, face, countdown', () => {
  const t = row()
  assert.ok(t.startsWith('5h '))
  assert.ok(t.includes('█'))
  assert.ok(t.includes(' 42%'))
  assert.ok(t.includes('😎')) // 42 % with 44 % of the window gone
  assert.ok(t.endsWith('↻ 2h13m'))
})

test('compact rows drop the bar', () => {
  const t = row({ compact: true })
  assert.equal(t.includes('█') || t.includes('░'), false)
  assert.ok(t.includes('42%'))
  assert.ok(t.includes('↻2h13m'))
})

test('the delta flashes bold, then fades, then leaves', () => {
  const at = (age: number) => rowSegs({ limit: { kind: 'five_hour', percentUsed: 45 }, prefs, now: NOW, width: 12, compact: false, delta: { value: 3, at: NOW - age } }).find(s => s.text === ' +3%')
  assert.equal(at(0)!.bold, true)
  assert.equal(at(2000)!.bold, undefined)
  assert.equal(at(3000)!.dim, true)
  assert.equal(at(5000), undefined)
})

test('the bar glides; with animation off it jumps', () => {
  const motion = { from: 10, to: 90, at: NOW }
  assert.ok(row({ motion, limit: { kind: 'five_hour', percentUsed: 90 } }).includes(' 10%'))
  assert.ok(row({ motion, limit: { kind: 'five_hour', percentUsed: 90 }, prefs: { ...prefs, animation: false } }).includes(' 90%'))
})

test('a party replaces the bar for a moment', () => {
  assert.ok(row({ partyAt: NOW - 500 }).includes('refuelled'))
  assert.equal(row({ partyAt: NOW - 5000 }).includes('refuelled'), false)
  assert.equal(row({ partyAt: NOW - 500, prefs: { ...prefs, animation: false } }).includes('refuelled'), false)
})

test('at 100 % a quip and the countdown replace the bar', () => {
  const t = row({ limit: { kind: 'five_hour', percentUsed: 100, resetsAt: iso(NOW + H) } })
  assert.ok(t.includes('back in 1h00m'))
  assert.equal(t.includes('░'), false)
})

test('the projection warns before the window runs dry', () => {
  const reset = iso(NOW + 3 * H)
  const t = row({ limit: { kind: 'five_hour', percentUsed: 50, resetsAt: reset }, history: { five_hour: [[NOW - H, 20]] } })
  assert.ok(t.includes('⚠ empty ~'))
})

test('the face can be switched off', () => {
  assert.equal(/[😎🙂😬🥵💀]/u.test(row({ prefs: { ...prefs, face: false } })), false)
})

test('detailText names reset, rate and a sparkline', () => {
  const t = detailText(
    [{ kind: 'five_hour', percentUsed: 50, resetsAt: iso(NOW + 3 * H) }, { kind: 'seven_day', percentUsed: 10 }],
    { five_hour: [[NOW - H, 20]] },
    NOW,
  )
  assert.ok(t.includes('5h: resets '))
  assert.ok(t.includes('30.0 %/h'))
  assert.ok(t.includes('7d: no reset yet'))
  assert.ok(t.includes('24h '))
})

test('German: the line and the card switch language', () => {
  const de = { ...prefs, lang: 'de' as const }
  assert.ok(row({ prefs: de, limit: { kind: 'five_hour', percentUsed: 100, resetsAt: iso(NOW + H) } }).includes('weiter in 1h00m'))
  assert.ok(row({ prefs: de, partyAt: NOW - 100 }).includes('frisch aufgetankt'))
  const card = detailText([{ kind: 'seven_day', percentUsed: 1 }], {}, NOW, 'de')
  assert.ok(card.includes('Reset offen'))
})
