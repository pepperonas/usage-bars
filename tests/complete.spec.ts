import { test } from 'node:test'
import assert from 'node:assert/strict'

import { complete, isOurs } from '../hooks/complete.ts'
import { STYLES } from '../hooks/styles.ts'

const words = (d: string) => complete(d, 'en')?.map(c => c.word) ?? null

test('only the command itself with a space offers anything', () => {
  assert.equal(complete('', 'en'), null)
  assert.equal(complete('/usage-bars', 'en'), null) // the name is the typeahead's job
  assert.equal(complete('hello /usage-bars ', 'en'), null)
  assert.equal(complete('/usage-barsx ', 'en'), null)
  assert.ok(isOurs('/usage-bars'))
  assert.ok(!isOurs('/usage'))
})

test('after the space: every subcommand, in help order', () => {
  assert.deepEqual(words('/usage-bars '), ['stats', 'demo', 'full', 'compact', 'off', 'style', 'lang', 'anim', 'sound', 'toasts', 'face'])
})

test('a prefix narrows the list and says how much is typed', () => {
  assert.deepEqual(words('/usage-bars st'), ['stats', 'style'])
  assert.deepEqual(words('/usage-bars s'), ['stats', 'style', 'sound'])
  assert.deepEqual(complete('/usage-bars st', 'en')!.map(c => c.typed), [2, 2])
  assert.deepEqual(words('/usage-bars STA'), ['stats'])
})

test('bare styles are offered once something is typed', () => {
  assert.deepEqual(words('/usage-bars pa'), ['pacman'])
  assert.ok(!words('/usage-bars ')!.includes('pacman'))
})

test('the second word follows the first', () => {
  assert.deepEqual(words('/usage-bars style '), [...STYLES])
  assert.deepEqual(words('/usage-bars style b'), ['bars', 'beer', 'battery'])
  assert.deepEqual(words('/usage-bars lang '), ['en', 'de'])
  assert.deepEqual(words('/usage-bars sound o'), ['on', 'off'])
  assert.deepEqual(words('/usage-bars  face  of'), ['off'])
})

test('nothing to offer: no follow-up, no match, too many words', () => {
  assert.equal(complete('/usage-bars stats ', 'en'), null)
  assert.equal(complete('/usage-bars xyz', 'en'), null)
  assert.equal(complete('/usage-bars style tank ', 'en'), null)
})

test('the hint is in the chosen language', () => {
  assert.equal(complete('/usage-bars stats', 'en')![0]!.hint, 'rate, projection, history, record')
  assert.equal(complete('/usage-bars stats', 'de')![0]!.hint, 'Rate, Hochrechnung, Verlauf, Rekord')
})

test('every subcommand offered is one the mod answers', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../hooks/register.tsx', import.meta.url), 'utf8')
  for (const w of words('/usage-bars ')!) assert.ok(new RegExp(`['\\s{]${w}['\\s:]`).test(src) || ['full', 'compact', 'off'].includes(w), `the mod does not answer ${w}`)
})
