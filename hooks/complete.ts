/**
 * What `/usage-bars …` can continue with, for the line under the prompt.
 *
 * Claude Code completes a slash command's name but not its arguments, so the
 * mod shows the candidates itself while the person types. Pure: the draft in,
 * the candidates out.
 */
import type { Lang } from '../types'
import { STYLES } from './styles'
import { LANGS } from './i18n'

export const COMMAND = '/usage-bars'

/** One candidate: the word, how much of it is already typed, what it does. */
export type Candidate = { word: string; typed: number; hint: string }

type Entry = { word: string; en: string; de: string }

const SUBS: readonly Entry[] = [
  { word: 'stats', en: 'rate, projection, history, record', de: 'Rate, Hochrechnung, Verlauf, Rekord' },
  { word: 'demo', en: 'play the animation', de: 'Animation vorführen' },
  { word: 'full', en: 'show the bars', de: 'Balken anzeigen' },
  { word: 'compact', en: 'numbers only', de: 'nur Zahlen' },
  { word: 'off', en: 'hide the line', de: 'Zeile ausblenden' },
  { word: 'style', en: STYLES.join(' · '), de: STYLES.join(' · ') },
  { word: 'lang', en: 'en · de', de: 'en · de' },
  { word: 'anim', en: 'animation on/off', de: 'Animation an/aus' },
  { word: 'sound', en: 'chime on/off', de: 'Ton an/aus' },
  { word: 'toasts', en: 'toasts on/off', de: 'Hinweise an/aus' },
  { word: 'face', en: 'emoji on/off', de: 'Emoji an/aus' },
]

const ON_OFF: readonly Entry[] = [
  { word: 'on', en: 'switch on', de: 'einschalten' },
  { word: 'off', en: 'switch off', de: 'ausschalten' },
]

const SECOND: Record<string, readonly Entry[]> = {
  style: STYLES.map(s => ({ word: s, en: 'style', de: 'Stil' })),
  lang: LANGS.map(l => ({ word: l, en: l === 'en' ? 'English' : 'German', de: l === 'en' ? 'Englisch' : 'Deutsch' })),
  anim: ON_OFF,
  sound: ON_OFF,
  toasts: ON_OFF,
  face: ON_OFF,
}

/** Whether a draft is about this command at all (cheap; checked on every key). */
export const isOurs = (draft: string): boolean => draft.trimStart().startsWith(COMMAND)

/**
 * The candidates for `draft`, or `null` when there is nothing to offer: the
 * draft is not `/usage-bars ` plus arguments, the argument has no follow-up,
 * or nothing matches what is typed.
 */
export function complete(draft: string, lang: Lang): Candidate[] | null {
  const text = draft.trimStart()
  if (!text.startsWith(`${COMMAND} `)) return null
  const rest = text.slice(COMMAND.length + 1).toLowerCase()
  const words = rest.split(/\s+/).filter(Boolean)
  const done = rest === '' || /\s$/.test(rest) ? words : words.slice(0, -1)
  const current = rest === '' || /\s$/.test(rest) ? '' : words[words.length - 1]!

  let pool: readonly Entry[] | undefined
  if (done.length === 0) {
    // Styles also work bare (`/usage-bars pacman`); offer them once something is typed.
    pool = current ? [...SUBS, ...STYLES.filter(s => !SUBS.some(e => e.word === s)).map(s => ({ word: s, en: 'style', de: 'Stil' }))] : SUBS
  } else if (done.length === 1) {
    pool = SECOND[done[0]!]
  }
  if (!pool) return null

  const hits = pool.filter(e => e.word.startsWith(current))
  if (hits.length === 0) return null
  return hits.map(e => ({ word: e.word, typed: current.length, hint: lang === 'de' ? e.de : e.en }))
}
