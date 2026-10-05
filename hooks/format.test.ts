import { describe, expect, test } from 'claude-code/testing'
import {
  appendSample, barWidth, elapsed, face, filled, glide, paceRatio, peaks, quip, rate, reached, runsDryAt, spark, tone, untilReset,
} from './format'

const H = 3600_000
const iso = (ms: number) => new Date(ms).toISOString()

describe('format', () => {
  test('filled clamps and rounds', async () => {
    expect(filled(0, 10)).toBe(0)
    expect(filled(42, 10)).toBe(4)
    expect(filled(130, 10)).toBe(10)
    expect(filled(-5, 10)).toBe(0)
  })
  test('tone thresholds', async () => {
    expect(tone(49.9)).toBe('green')
    expect(tone(50)).toBe('yellow')
    expect(tone(80)).toBe('red')
  })
  test('untilReset: seconds under an hour, then h/m, then days', async () => {
    const now = Date.parse('2026-10-05T10:00:00Z')
    expect(untilReset('2026-10-05T10:12:41Z', now)).toBe('12m41s')
    expect(untilReset('2026-10-05T12:13:00Z', now)).toBe('2h13m')
    expect(untilReset('2026-10-08T14:00:00Z', now)).toBe('3d 4h')
    expect(untilReset('2026-10-08T14:00:00Z', now, 'de')).toBe('3T 4h')
    expect(untilReset('2026-10-05T09:00:00Z', now)).toBe('0m00s')
    expect(untilReset(undefined, now)).toBe('')
  })
  test('barWidth stays within 6..24', async () => {
    expect(barWidth(40)).toBe(6)
    expect(barWidth(400)).toBe(24)
  })
  test('glide eases from → to and stops at to', async () => {
    const m = { from: 10, to: 50, at: 1000 }
    expect(glide(m, 1000)).toBe(10)
    const mid = glide(m, 1350)!
    expect(mid > 30 && mid < 50).toBe(true) // ease-out: past the middle at half time
    expect(glide(m, 5000)).toBe(50)
    expect(glide(undefined, 0)).toBeUndefined()
  })
  test('elapsed and pace drive the face', async () => {
    const now = 10 * H
    const reset = iso(now + 2.5 * H) // half of the 5h window gone
    const frac = elapsed('five_hour', reset, now)!
    expect(Math.abs(frac - 0.5) < 1e-9).toBe(true)
    expect(face(20, paceRatio(20, frac))).toBe('😎')
    expect(face(50, paceRatio(50, frac))).toBe('🙂')
    expect(face(75, paceRatio(75, frac))).toBe('😬')
    expect(face(92, paceRatio(92, frac))).toBe('🥵')
    expect(face(100, paceRatio(100, frac))).toBe('💀')
  })
  test('rate projects when the window runs dry', async () => {
    const now = 10 * H
    const reset = iso(now + 3 * H) // window began at now-2h
    const samples: [number, number][] = [[now - H, 20]]
    const r = rate(samples, 'five_hour', reset, 50, now)!
    expect(Math.round(r.perHour)).toBe(30)
    // 50 % left at 30 %/h → empty in 1h40, before the reset in 3h
    expect(runsDryAt(r, reset)).toBe(now + (50 / 30) * H)
    // slow burner reaches the reset
    expect(runsDryAt(rate([[now - H, 45]], 'five_hour', reset, 50, now), reset)).toBeUndefined()
    // samples from the previous window don't count
    expect(rate([[now - 2.5 * H, 0]], 'five_hour', reset, 50, now)).toBeUndefined()
  })
  test('appendSample prunes old samples and skips repeats', async () => {
    const now = 20 * 86400_000
    let h = appendSample({}, 'five_hour', [now - 9 * 86400_000, 5], now - 9 * 86400_000)
    h = appendSample(h, 'five_hour', [now, 10], now)
    expect(h.five_hour!.length).toBe(1)
    expect(appendSample(h, 'five_hour', [now + 1000, 10], now)).toBe(h)
  })
  test('spark and peaks', async () => {
    expect(spark([0, 50, 100, undefined])).toBe('▁▅█·')
    const p = peaks([[0, 10], [500, 30], [1500, 70]], 2000, 1000, 2)
    expect(p).toEqual([30, 70])
  })
  test('reached and quip', async () => {
    expect(reached(49)).toBe(0)
    expect(reached(85)).toBe(80)
    expect(reached(100)).toBe(100)
    expect(quip('a')).toBe(quip('a'))
  })
})
