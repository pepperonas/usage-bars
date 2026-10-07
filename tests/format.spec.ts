import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  appendSample, barWidth, heartbeat, clockTime, elapsed, face, filled, glide, paceRatio, peaks, quip, rate, reached, runsDryAt, spark, tone, untilReset,
} from '../hooks/format.ts'

const H = 3600_000
const iso = (ms: number) => new Date(ms).toISOString()

test('filled clamps to the bar and rounds', () => {
  assert.equal(filled(0, 10), 0)
  assert.equal(filled(42, 10), 4)
  assert.equal(filled(130, 10), 10)
  assert.equal(filled(-5, 10), 0)
})

test('tone: green < 50 ≤ yellow < 80 ≤ red', () => {
  assert.equal(tone(49.9), 'green')
  assert.equal(tone(50), 'yellow')
  assert.equal(tone(79.9), 'yellow')
  assert.equal(tone(80), 'red')
})

test('untilReset is precise under an hour and coarse beyond', () => {
  const now = Date.parse('2026-10-05T10:00:00Z')
  assert.equal(untilReset('2026-10-05T10:12:41Z', now), '12m41s')
  assert.equal(untilReset('2026-10-05T12:13:00Z', now), '2h13m')
  assert.equal(untilReset('2026-10-08T14:00:00Z', now), '3d 4h')
  assert.equal(untilReset('2026-10-08T14:00:00Z', now, 'de'), '3T 4h')
  assert.equal(untilReset('2026-10-05T09:00:00Z', now), '0m00s')
  assert.equal(untilReset('not a date', now), '')
  assert.equal(untilReset(undefined, now), '')
})

test('clockTime shows the time today and weekday + time later', () => {
  const now = new Date(2026, 9, 5, 10, 0).getTime() // Monday
  assert.equal(clockTime(new Date(2026, 9, 5, 17, 30).getTime(), now), '17:30')
  assert.equal(clockTime(new Date(2026, 9, 7, 9, 5).getTime(), now), 'Wed 09:05')
  assert.equal(clockTime(new Date(2026, 9, 7, 9, 5).getTime(), now, 'de'), 'Mi 09:05')
})

test('barWidth stays between 6 and 24 cells', () => {
  assert.equal(barWidth(10), 6)
  assert.equal(barWidth(1000), 24)
  for (let c = 0; c < 400; c += 7) {
    const w = barWidth(c)
    assert.ok(w >= 6 && w <= 24)
  }
})

test('glide eases out and lands exactly on the target', () => {
  const m = { from: 10, to: 50, at: 1000 }
  assert.equal(glide(m, 1000), 10)
  const half = glide(m, 1350)!
  assert.ok(half > 30 && half < 50, `ease-out passes the middle early, got ${half}`)
  assert.equal(glide(m, 1700), 50)
  assert.equal(glide(m, 99_999), 50)
  assert.equal(glide(undefined, 0), undefined)
})

test('elapsed is the share of the window already gone', () => {
  const now = 10 * H
  assert.equal(elapsed('five_hour', iso(now + 2.5 * H), now), 0.5)
  assert.equal(elapsed('seven_day', iso(now + 7 * 24 * H), now), 0)
  assert.equal(elapsed('five_hour', undefined, now), undefined)
  assert.equal(elapsed('unknown', iso(now), now), undefined)
})

test('the face follows the pace, not just the fill', () => {
  const frac = 0.5
  assert.equal(face(20, paceRatio(20, frac)), '😎')
  assert.equal(face(50, paceRatio(50, frac)), '🙂')
  assert.equal(face(75, paceRatio(75, frac)), '😬')
  assert.equal(face(92, paceRatio(92, frac)), '🥵')
  assert.equal(face(100, paceRatio(100, frac)), '💀')
  // right after a reset there is no meaningful pace yet
  assert.equal(paceRatio(5, 0.01), undefined)
  assert.equal(face(5, undefined), '🙂')
})

test('rate projects when the window runs dry', () => {
  const now = 10 * H
  const reset = iso(now + 3 * H) // the 5h window began 2h ago
  const r = rate([[now - H, 20]], 'five_hour', reset, 50, now)!
  assert.equal(Math.round(r.perHour), 30)
  assert.equal(runsDryAt(r, reset), now + (50 / 30) * H)
  // a slow burner reaches the reset
  assert.equal(runsDryAt(rate([[now - H, 45]], 'five_hour', reset, 50, now), reset), undefined)
})

test('rate ignores the previous window, short spans and flat lines', () => {
  const now = 10 * H
  const reset = iso(now + 3 * H)
  assert.equal(rate([[now - 2.5 * H, 0]], 'five_hour', reset, 50, now), undefined)
  assert.equal(rate([[now - 5 * 60_000, 40]], 'five_hour', reset, 50, now), undefined)
  assert.equal(rate([[now - H, 50]], 'five_hour', reset, 50, now), undefined)
  assert.equal(rate([], 'five_hour', reset, 50, now), undefined)
})

test('appendSample keeps eight days and skips repeats', () => {
  const now = 20 * 86400_000
  let h = appendSample({}, 'five_hour', [now - 9 * 86400_000, 5], now - 9 * 86400_000)
  h = appendSample(h, 'five_hour', [now, 10], now)
  assert.deepEqual(h.five_hour, [[now, 10]])
  assert.equal(appendSample(h, 'five_hour', [now + 1000, 10], now), h)
  assert.equal(appendSample(h, 'five_hour', [now + 2 * 60_000, 10], now).five_hour!.length, 2)
})

test('appendSample caps the history at 3000 samples', () => {
  let h = {}
  for (let i = 0; i < 3100; i++) h = appendSample(h, 'five_hour', [i * 60_000, i % 100], 3100 * 60_000)
  assert.equal((h as Record<string, unknown[]>).five_hour!.length, 3000)
})

test('heartbeat records a steady reading again after its interval, and only then', () => {
  const h = { five_hour: [[0, 10]] as [number, number][] }
  const lims = [{ kind: 'five_hour', percentUsed: 10 }, { kind: 'seven_day', percentUsed: 90 }]
  const soon = heartbeat({ ...h, seven_day: [[0, 90]] }, lims, 9 * 60_000, 10 * 60_000)
  assert.deepEqual(soon.five_hour, [[0, 10]])
  const due = heartbeat(h, lims, 10 * 60_000, 10 * 60_000)
  assert.deepEqual(due.five_hour, [[0, 10], [600_000, 10]])
  assert.deepEqual(due.seven_day, [[600_000, 90]])
  const same = { five_hour: [[0, 10]] as [number, number][] }
  assert.equal(heartbeat(same, [], 10 * H), same)
})

test('spark and peaks', () => {
  assert.equal(spark([0, 50, 100, undefined]), '▁▅█·')
  assert.deepEqual(peaks([[0, 10], [500, 30], [1500, 70]], 2000, 1000, 2), [30, 70])
  assert.deepEqual(peaks(undefined, 0, 1000, 3), [undefined, undefined, undefined])
})

test('reached names the highest threshold crossed', () => {
  assert.equal(reached(49), 0)
  assert.equal(reached(50), 50)
  assert.equal(reached(85), 80)
  assert.equal(reached(99.9), 90)
  assert.equal(reached(100), 100)
})

test('quip is stable per window and speaks the language', () => {
  assert.equal(quip('2026-10-05T17:30:00Z'), quip('2026-10-05T17:30:00Z'))
  assert.notEqual(quip('x', 'en'), quip('x', 'de'))
  assert.ok(quip(undefined).length > 0)
})
