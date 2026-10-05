import type { Lang } from '../types'

export const LANGS: readonly Lang[] = ['en', 'de']

type Strings = {
  day: string
  weekdays: readonly string[]
  dec: string
  quips: readonly string[]
  dry: (t: string) => string
  refuelled: string
  backIn: (u: string) => string
  resetAt: (t: string) => string
  resetOpen: string
  toastAt: (label: string, p: number, until: string) => string
  toastFull: (quip: string, label: string, until: string) => string
  noData: string
}

export const T: Record<Lang, Strings> = {
  en: {
    day: 'd',
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    dec: '.',
    quips: [
      '☕ Coffee break',
      '🧘 Breathe',
      '🚶 Go touch grass',
      '📖 Read the docs instead',
      '🍕 Pizza time',
      '😴 Power nap?',
      '🦆 Ask the rubber duck',
    ],
    dry: t => `⚠ empty ~${t}`,
    refuelled: 'refuelled ✨',
    backIn: u => ` – back in ${u}`,
    resetAt: t => `resets ${t}`,
    resetOpen: 'no reset yet',
    toastAt: (l, p, u) => `${l} limit at ${p} %${u ? ` · resets in ${u}` : ''}`,
    toastFull: (q, l, u) => `${q} – ${l} limit used up${u ? `, back in ${u}` : ''}`,
    noData: 'No readings yet – the bars appear after the first answer.',
  },
  de: {
    day: 'T',
    weekdays: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
    dec: ',',
    quips: [
      '☕ Kaffeepause',
      '🧘 Durchatmen',
      '🚶 Kurz an die frische Luft',
      '📖 Doku lesen statt prompten',
      '🍕 Pizza-Zeit',
      '😴 Powernap?',
      '🦆 Zeit für die Quietscheente',
    ],
    dry: t => `⚠ leer ~${t}`,
    refuelled: 'frisch aufgetankt ✨',
    backIn: u => ` – weiter in ${u}`,
    resetAt: t => `Reset ${t}`,
    resetOpen: 'Reset offen',
    toastAt: (l, p, u) => `${l}-Kontingent bei ${p} %${u ? ` · Reset in ${u}` : ''}`,
    toastFull: (q, l, u) => `${q} – ${l}-Kontingent aufgebraucht${u ? `, weiter in ${u}` : ''}`,
    noData: 'Noch keine Messwerte – die Balken erscheinen nach der ersten Antwort.',
  },
}

export const num1 = (n: number, lang: Lang) => n.toFixed(1).replace('.', T[lang].dec)
