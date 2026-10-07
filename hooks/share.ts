import type { History, Limit, Sample } from '../types'

/**
 * Readings shared between the sessions of one account.
 *
 * Each Claude Code session only learns about the limits from its own API
 * responses. A session that sits idle keeps showing what it last heard, and
 * when its window's reset time passes it zeroes the bar, while another
 * session has long started the next window. So every session publishes what
 * it hears to the store (one file per plugin, read from disk on every get),
 * and every session folds in what the others published.
 *
 * The merge has to tolerate stale input: an idle session can come back with
 * an old reading. It never needs to know which reading is newer, because a
 * window only fills up until it resets:
 *   - a reading whose reset time has passed is that window ended: 0, no reset
 *   - a later reset time is a later window, and wins
 *   - the same window (reset times within an hour) keeps the higher percent
 */

/** Reset times this close name the same window (the API rounds them). */
export const SAME_WINDOW_MS = 3600_000

/** A reading as it stands at `now`: an ended window reads 0. */
export function settle(l: Limit, now: number): Limit {
  const at = l.resetsAt ? Date.parse(l.resetsAt) : NaN
  if (!Number.isNaN(at) && at <= now) return { kind: l.kind, percentUsed: 0 }
  return l
}

/** The truer of two readings of one window kind. On a tie `b` wins. */
export function mergeOne(a: Limit | undefined, b: Limit | undefined, now: number): Limit | undefined {
  if (!a) return b && settle(b, now)
  if (!b) return settle(a, now)
  const x = settle(a, now)
  const y = settle(b, now)
  const tx = x.resetsAt ? Date.parse(x.resetsAt) : NaN
  const ty = y.resetsAt ? Date.parse(y.resetsAt) : NaN
  if (Number.isNaN(tx) && Number.isNaN(ty)) return y
  // A live window beats an ended (or unknown) one.
  if (Number.isNaN(tx)) return y
  if (Number.isNaN(ty)) return x
  if (Math.abs(tx - ty) >= SAME_WINDOW_MS) return tx > ty ? x : y
  const resetsAt = tx > ty ? x.resetsAt : y.resetsAt
  return { kind: y.kind, percentUsed: Math.max(x.percentUsed, y.percentUsed), resetsAt }
}

/** Both lists merged per kind, in the order the kinds first appear. */
export function mergeLimits(a: readonly Limit[], b: readonly Limit[], now: number): Limit[] {
  const kinds = [...new Set([...a, ...b].map(l => l.kind))]
  const find = (list: readonly Limit[], kind: string) => list.find(l => l.kind === kind)
  return kinds.map(k => mergeOne(find(a, k), find(b, k), now)!).map(({ kind, percentUsed, resetsAt }) =>
    resetsAt === undefined ? { kind, percentUsed } : { kind, percentUsed, resetsAt },
  )
}

export function sameLimits(a: readonly Limit[], b: readonly Limit[]): boolean {
  return (
    a.length === b.length &&
    a.every(x => {
      const y = b.find(l => l.kind === x.kind)
      return !!y && y.percentUsed === x.percentUsed && (y.resetsAt ?? '') === (x.resetsAt ?? '')
    })
  )
}

/** Samples of both histories, by time, a sample per moment, the last 8 days. */
export function mergeHistory(a: History, b: History, now: number): History {
  const keepFrom = now - 8 * 86400_000
  const out: History = {}
  for (const kind of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const byTime = new Map<number, Sample>()
    for (const s of [...(a[kind] ?? []), ...(b[kind] ?? [])]) if (s[0] >= keepFrom) byTime.set(s[0], s)
    out[kind] = [...byTime.values()].sort((x, y) => x[0] - y[0]).slice(-3000)
  }
  return out
}

/** What the store holds under `latest`, as a list of readings or nothing. */
export function asLimits(stored: unknown): Limit[] {
  if (!Array.isArray(stored)) return []
  return stored.filter(
    (l): l is Limit =>
      !!l &&
      typeof l === 'object' &&
      typeof (l as Limit).kind === 'string' &&
      typeof (l as Limit).percentUsed === 'number' &&
      ((l as Limit).resetsAt === undefined || typeof (l as Limit).resetsAt === 'string'),
  )
}
