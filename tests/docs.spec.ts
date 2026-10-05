/**
 * Drift guards: they read a file and hold it to a fact, because what they
 * catch is silent — nothing crashes, the README just tells a stale story.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { STYLES } from '../hooks/styles.ts'
import { LANGS } from '../hooks/i18n.ts'

const ROOT = resolve(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const README = read('README.md')
const manifest = JSON.parse(read('.claude-plugin/plugin.json'))
const pkg = JSON.parse(read('package.json'))
const market = JSON.parse(read('.claude-plugin/marketplace.json'))
const lock = JSON.parse(read('package-lock.json'))
const badge = (name: string) => README.match(new RegExp(`badge/${name}-([^-?]+)-`))?.[1]

/** `test(` calls in a file; inside the per-surface loop each runs twice. */
function countTests(file: string): number {
  const src = read(file)
  const top = (src.match(/^test\(/gm) ?? []).length
  const inLoop = (src.match(/^ {2}test\(/gm) ?? []).length
  const loops = (src.match(/^for \(const surface of \[(.*?)\]/gm) ?? []).length
  const perLoop = loops ? (src.match(/^for \(const surface of \[(.*?)\]/m)![1]!.split(',').length) : 1
  return top + inLoop * perLoop
}
const files = (dir: string, re: RegExp) => readdirSync(join(ROOT, dir)).filter(f => re.test(f)).map(f => `${dir}/${f}`)

test('one version everywhere: badge, plugin.json, package.json, CHANGELOG', () => {
  const v = manifest.version
  assert.match(v, /^\d+\.\d+\.\d+$/)
  assert.equal(pkg.version, v)
  assert.equal(lock.version, v)
  assert.equal(lock.packages[''].version, v)
  assert.equal(badge('version'), v)
  assert.ok(read('CHANGELOG.md').includes(`## [${v}] - `), `CHANGELOG has no section for ${v}`)
  assert.ok(README.includes(`- **${v}** —`), `README changelog summary misses ${v}`)
})

test('CHANGELOG versions descend and carry valid dates', () => {
  const heads = [...read('CHANGELOG.md').matchAll(/^## \[(\d+)\.(\d+)\.(\d+)\] - (\d{4}-\d{2}-\d{2})$/gm)]
  assert.ok(heads.length >= 1)
  const key = (h: RegExpMatchArray) => Number(h[1]) * 1e6 + Number(h[2]) * 1e3 + Number(h[3])
  for (let i = 1; i < heads.length; i++) assert.ok(key(heads[i - 1]!) > key(heads[i]!), 'versions must descend')
  for (const h of heads) assert.ok(!Number.isNaN(Date.parse(h[4]!)), `bad date ${h[4]}`)
})

test('the node-tests badge is the real number of node tests', () => {
  const n = files('tests', /\.spec\.ts$/).reduce((a, f) => a + countTests(f), 0)
  assert.equal(badge('node%20tests'), String(n))
})

test('the engine-tests badge is the real number of engine tests', () => {
  const n = files('hooks', /\.test\.tsx?$/).reduce((a, f) => a + countTests(f), 0)
  assert.equal(badge('engine%20tests'), String(n))
})

test('every style is documented and declared in /config', () => {
  assert.deepEqual(manifest.userConfig.style.options, [...STYLES])
  // both tables must list every style, not just mention it somewhere
  const lines = README.split('\n')
  const configRow = lines.find(l => l.startsWith('| `style` |'))
  const usageRow = lines.find(l => l.startsWith('| `/usage-bars style <name>` |'))
  for (const s of STYLES) {
    assert.ok(configRow?.includes(`\`${s}\``), `configuration table misses style ${s}`)
    assert.ok(usageRow?.includes(`\`${s}\``), `usage table misses style ${s}`)
  }
  assert.equal(badge('styles'), String(STYLES.length))
})

test('every /config field is in the README table, with its default', () => {
  for (const [key, field] of Object.entries<{ default: unknown }>(manifest.userConfig)) {
    const row = README.split('\n').find(l => l.startsWith(`| \`${key}\` |`))
    assert.ok(row, `README configuration table misses ${key}`)
    const d = field.default
    const shown = typeof d === 'boolean' ? (d ? 'on' : 'off') : `\`${d}\``
    assert.ok(row.trimEnd().endsWith(`| ${shown} |`), `${key}: README default should be ${shown}`)
  }
})

test('every language is declared and documented', () => {
  assert.deepEqual(manifest.userConfig.language.options, [...LANGS])
  for (const l of LANGS) assert.ok(README.includes(`\`${l}\``))
})

test('every command the mod answers is documented', () => {
  const src = read('hooks/register.tsx')
  for (const cmd of ['stats', 'demo', 'full', 'compact', 'off', 'style', 'lang', 'anim', 'sound', 'toasts', 'face']) {
    assert.ok(new RegExp(`['\\s{]${cmd}['\\s:]`).test(src), `the mod no longer knows ${cmd}`)
    assert.ok(README.includes(cmd), `README does not mention ${cmd}`)
  }
})

test('every image the README shows exists', () => {
  for (const [, src] of README.matchAll(/<img src="(docs\/[^"]+)"/g)) assert.ok(existsSync(join(ROOT, src!)), `missing ${src}`)
  assert.ok(README.indexOf('docs/social.png') < README.indexOf('# 📊'), 'the social image belongs at the very top')
})

test('the README asks for support the way the other celox projects do', () => {
  assert.ok(README.includes('https://www.paypal.com/donate/?business=martin.pfeffer@celox.io'))
  assert.ok(README.includes('https://g.page/r/CXgdRV3QysvxEBM/review'))
})

test('MIT everywhere', () => {
  assert.ok(read('LICENSE').startsWith('MIT License'))
  assert.equal(manifest.license, 'MIT')
  assert.equal(pkg.license, 'MIT')
})

test('no runtime dependencies — the badge says so', () => {
  assert.equal(pkg.dependencies, undefined)
  assert.equal(badge('runtime%20dependencies'), '0')
})

test('every sound the mod plays ships with it', () => {
  const src = read('hooks/register.tsx')
  for (const [, asset] of src.matchAll(/'(sounds\/[^']+)'/g)) assert.ok(existsSync(join(ROOT, asset!)), `missing ${asset}`)
})

test('the marketplace lists this plugin, from this repo, at the same version', () => {
  const entry = market.plugins.find((p: { name: string }) => p.name === manifest.name)
  assert.ok(entry, `marketplace.json has no entry for ${manifest.name}`)
  assert.equal(entry.source, './')
  assert.equal(entry.version, manifest.version)
  assert.equal(entry.description, manifest.description)
})

test('the README install commands name the real marketplace and plugin', () => {
  const id = `${manifest.name}@${market.name}`
  assert.ok(README.includes(`/plugin marketplace add pepperonas/${manifest.name}`), 'README misses marketplace add')
  assert.ok(README.includes(`/plugin install ${id}`), `README misses /plugin install ${id}`)
  assert.ok(README.includes(`claude plugin install ${id}`), `README misses claude plugin install ${id}`)
  for (const m of README.matchAll(/usage-bars@([a-z0-9._-]+)/g)) assert.equal(m[1], market.name, `stale install id ${m[0]}`)
})
