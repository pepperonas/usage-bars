import { test } from 'node:test'
import assert from 'node:assert/strict'

import { asLimits, mergeHistory, mergeLimits, mergeOne, sameLimits, settle } from '../hooks/share.ts'

const H = 3600_000
const now = Date.parse('2026-10-07T15:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()

test('settle: an ended window reads 0 and loses its reset time', () => {
  assert.deepEqual(settle({ kind: 'five_hour', percentUsed: 40, resetsAt: iso(now - 1) }, now), { kind: 'five_hour', percentUsed: 0 })
  const live = { kind: 'five_hour', percentUsed: 40, resetsAt: iso(now + H) }
  assert.equal(settle(live, now), live)
  const open = { kind: 'spend_limit', percentUsed: 40 }
  assert.equal(settle(open, now), open)
})

test('same window: the higher percent wins, whichever side is stale', () => {
  const old = { kind: 'seven_day', percentUsed: 85, resetsAt: iso(now + 80 * H) }
  const fresh = { kind: 'seven_day', percentUsed: 91, resetsAt: iso(now + 80 * H) }
  assert.equal(mergeOne(old, fresh, now)!.percentUsed, 91)
  assert.equal(mergeOne(fresh, old, now)!.percentUsed, 91)
})

test('same window despite reset times a little apart; the later one is kept', () => {
  const a = { kind: 'five_hour', percentUsed: 30, resetsAt: iso(now + 2 * H) }
  const b = { kind: 'five_hour', percentUsed: 20, resetsAt: iso(now + 2 * H + 59 * 60_000) }
  assert.deepEqual(mergeOne(a, b, now), { kind: 'five_hour', percentUsed: 30, resetsAt: b.resetsAt })
})

test('a later window beats an earlier one, even with less used', () => {
  const ended = { kind: 'five_hour', percentUsed: 60, resetsAt: iso(now - 10 * 60_000) }
  const next = { kind: 'five_hour', percentUsed: 13, resetsAt: iso(now + 4 * H) }
  assert.deepEqual(mergeOne(ended, next, now), next)
  assert.deepEqual(mergeOne(next, ended, now), next)
  const earlier = { kind: 'five_hour', percentUsed: 70, resetsAt: iso(now + H) }
  assert.deepEqual(mergeOne(earlier, next, now), next)
})

test('a locally zeroed window yields to the live one another session heard', () => {
  const zeroed = { kind: 'five_hour', percentUsed: 0 }
  const live = { kind: 'five_hour', percentUsed: 13, resetsAt: iso(now + 4 * H) }
  assert.deepEqual(mergeOne(zeroed, live, now), live)
  assert.deepEqual(mergeOne(live, zeroed, now), live)
})

test('without reset times on either side the second reading wins', () => {
  assert.equal(mergeOne({ kind: 'spend_limit', percentUsed: 50 }, { kind: 'spend_limit', percentUsed: 30 }, now)!.percentUsed, 30)
})

test('mergeLimits keeps every kind of both lists and is stable on repeat', () => {
  const a = [{ kind: 'five_hour', percentUsed: 13, resetsAt: iso(now + 4 * H) }]
  const b = [{ kind: 'seven_day', percentUsed: 91, resetsAt: iso(now + 80 * H) }]
  const m = mergeLimits(a, b, now)
  assert.deepEqual(m.map(l => l.kind), ['five_hour', 'seven_day'])
  assert.ok(sameLimits(mergeLimits(m, b, now), m))
  assert.ok(sameLimits(mergeLimits(m, [], now), m))
})

test('sameLimits compares percent and reset per kind', () => {
  const a = [{ kind: 'five_hour', percentUsed: 13, resetsAt: 'x' }]
  assert.ok(sameLimits(a, [{ kind: 'five_hour', percentUsed: 13, resetsAt: 'x' }]))
  assert.ok(!sameLimits(a, [{ kind: 'five_hour', percentUsed: 14, resetsAt: 'x' }]))
  assert.ok(!sameLimits(a, [{ kind: 'five_hour', percentUsed: 13 }]))
  assert.ok(!sameLimits(a, []))
})

test('mergeHistory: union by time, one sample per moment, old ones dropped', () => {
  const old = now - 9 * 86400_000
  const h = mergeHistory({ five_hour: [[old, 1], [now - 2000, 10], [now, 12]] }, { five_hour: [[now - 1000, 11], [now, 12]], seven_day: [[now, 90]] }, now)
  assert.deepEqual(h, { five_hour: [[now - 2000, 10], [now - 1000, 11], [now, 12]], seven_day: [[now, 90]] })
})

test('asLimits accepts only well-formed readings', () => {
  assert.deepEqual(asLimits(undefined), [])
  assert.deepEqual(asLimits({}), [])
  assert.deepEqual(asLimits([{ kind: 'five_hour', percentUsed: 3 }, { kind: 1 }, null, { kind: 'x', percentUsed: '3' }]), [{ kind: 'five_hour', percentUsed: 3 }])
})
