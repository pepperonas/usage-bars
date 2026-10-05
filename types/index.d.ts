export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Style = 'bars' | 'pacman' | 'beer' | 'tank' | 'battery' | 'hourglass'
export type Mode = 'full' | 'compact' | 'off'
export type Lang = 'en' | 'de'

export type Prefs = {
  mode: Mode
  style: Style
  animation: boolean
  sound: boolean
  toasts: boolean
  face: boolean
  lang: Lang
}

/** A bar gliding from one value to the next. */
export type Motion = { from: number; to: number; at: number }
/** The `+3%` shown after a response, fading out. */
export type Delta = { value: number; at: number }
/** One sample of a window: [time ms, percent]. */
export type Sample = [number, number]
export type History = Record<string, Sample[]>

declare module 'claude-code' {
  interface PluginState {
    'usage-bars': {
      limits: Limit[]
      motion: Record<string, Motion>
      deltas: Record<string, Delta>
      party: Record<string, number>
      prefs: Prefs
      history: History
    }
  }
}
