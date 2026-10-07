import { expect, mock, test } from 'claude-code/testing'

const H = 3600_000
const iso = (ms: number) => new Date(ms).toISOString()

const HINT = {
  plugin: 'usage-bars',
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
} as const

type Lim = { kind: string; percentUsed: number; resetsAt?: string }

/** Stand-in for the engine beneath the plugin. Returns the clock and the toasts. */
function engine(on: any, usage: Lim[] = [], disk?: Record<string, unknown>) {
  const clock = mock.clock(on)
  if (disk) {
    // The store file every session of the account reads and writes.
    on('store.get', (_$: any, e: any) => ({ value: structuredClone(disk[e.key]) }))
    on('store.set', (_$: any, e: any) => ((disk[e.key] = structuredClone(e.value)), { value: undefined }))
  } else mock.store(on)
  const toasts: string[] = []
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>{e.props.hint}</Text>
  })
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: usage } }))
  on('command.register', () => ({ value: undefined }))
  on('ui.toast', (_$: any, e: any) => {
    toasts.push(String(e.text ?? e))
    return { value: undefined }
  })
  on('audio.play', () => ({ value: undefined }))
  return { clock, toasts }
}

const measure = ($: any, rateLimits: Lim[]) =>
  $.session.measure({ context: {}, rateLimits, changed: ['rateLimits'] })
const start = ($: any) => $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
const mount = ($: any, surface: 'terminal' | 'desktop', columns = 120): Promise<any> =>
  $.ui.mount({ ...HINT, surface, viewport: { columns, rows: 40 } })
const all = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('|')

for (const surface of ['terminal', 'desktop'] as const) {
  test(`no data: engine line only (${surface})`, async ($, on) => {
    engine(on)
    const ui = await mount($, surface)
    expect(await ui.find({ text: '? for shortcuts' })).toBeDefined()
    expect(await ui.find({ text: /5h/ })).toBeUndefined()
  })

  test(`both bars, percent, countdown, face, hint kept (${surface})`, async ($, on) => {
    engine(on)
    await measure($, [
      { kind: 'five_hour', percentUsed: 42, resetsAt: iso((2 * 60 + 13) * 60_000) },
      { kind: 'seven_day', percentUsed: 92 },
    ])
    const ui = await mount($, surface)
    const t = await all(ui)
    expect(t).toContain('? for shortcuts')
    expect(t).toContain('5h ')
    expect(t).toContain('7d ')
    expect(t).toContain('42%')
    expect(t).toContain('92%')
    expect(t).toContain('↻ 2h13m')
    expect(t).toContain('█')
    expect(t).toContain('🥵') // 92 %
    // hover card with the details is in the tree
    expect(t).toContain('resets ')
  })
}

test('a response that costs 3 % flashes +3%, then fades away', async ($, on) => {
  const { clock } = engine(on)
  await measure($, [{ kind: 'five_hour', percentUsed: 42 }])
  await measure($, [{ kind: 'five_hour', percentUsed: 45 }])
  const ui = await mount($, 'terminal')
  expect(await all(ui)).toContain('+3%')
  await clock.advance(5000)
  expect(await all(ui)).not.toContain('+3%')
})

test('the bar glides to the new value instead of jumping', async ($, on) => {
  const { clock } = engine(on)
  await measure($, [{ kind: 'five_hour', percentUsed: 10 }])
  await measure($, [{ kind: 'five_hour', percentUsed: 90 }])
  const ui = await mount($, 'terminal')
  expect(await all(ui)).toContain('10%')
  await clock.advance(1000)
  expect(await all(ui)).toContain('90%')
})

test('a threshold toasts once per window', async ($, on) => {
  const { toasts } = engine(on)
  await measure($, [{ kind: 'five_hour', percentUsed: 30, resetsAt: iso(4 * H) }])
  expect(toasts.length).toBe(0)
  await measure($, [{ kind: 'five_hour', percentUsed: 81, resetsAt: iso(4 * H) }])
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('81 %')
  await measure($, [{ kind: 'five_hour', percentUsed: 84, resetsAt: iso(4 * H) }])
  expect(toasts.length).toBe(1)
})

test('projection warns when the window runs dry before its reset', async ($, on) => {
  const { clock } = engine(on)
  const reset = iso(4 * H) // window began at -1h
  await measure($, [{ kind: 'five_hour', percentUsed: 20, resetsAt: reset }])
  await clock.advance(H)
  await measure($, [{ kind: 'five_hour', percentUsed: 50, resetsAt: reset }])
  await clock.advance(5000)
  const ui = await mount($, 'terminal')
  expect(await all(ui)).toContain('⚠ empty ~')
})

test('a window that resets while idle drops to 0 with a party', async ($, on) => {
  const { clock } = engine(on, [{ kind: 'five_hour', percentUsed: 60, resetsAt: iso(5000) }])
  await start($)
  const ui = await mount($, 'terminal')
  expect(await all(ui)).toContain('60%')
  await clock.advance(6000)
  expect(await all(ui)).toContain('refuelled')
  await clock.advance(5000)
  const t = await all(ui)
  expect(t).toContain('0%')
  expect(t).not.toContain('refuelled')
})

test('a new session starts from what the other sessions heard', async ($, on) => {
  const disk: Record<string, unknown> = { latest: [{ kind: 'five_hour', percentUsed: 13, resetsAt: iso(H) }, { kind: 'seven_day', percentUsed: 91, resetsAt: iso(80 * H) }] }
  engine(on, [], disk)
  await start($)
  const t = await all(await mount($, 'terminal'))
  expect(t).toContain('13%')
  expect(t).toContain('91%')
})

test('an idle session follows the readings another session publishes', async ($, on) => {
  const disk: Record<string, unknown> = {}
  const { clock } = engine(on, [{ kind: 'five_hour', percentUsed: 40, resetsAt: iso(2000) }, { kind: 'seven_day', percentUsed: 85, resetsAt: iso(80 * H) }], disk)
  await start($)
  const ui = await mount($, 'terminal')
  expect(await all(ui)).toContain('85%')
  // This session's 5h window ends; another session already works in the next one.
  disk.latest = [{ kind: 'five_hour', percentUsed: 13, resetsAt: iso(5 * H) }, { kind: 'seven_day', percentUsed: 91, resetsAt: iso(80 * H) }]
  await clock.advance(6000)
  await clock.advance(5000)
  const t = await all(ui)
  expect(t).toContain('13%')
  expect(t).toContain('91%')
  expect(t).not.toContain(' 0%')
})

test('a stale reading never pulls the shared figures back', async ($, on) => {
  const disk: Record<string, unknown> = { latest: [{ kind: 'seven_day', percentUsed: 91, resetsAt: iso(80 * H) }] }
  engine(on, [], disk)
  await start($)
  await measure($, [{ kind: 'seven_day', percentUsed: 85, resetsAt: iso(80 * H) }])
  expect(await all(await mount($, 'terminal'))).toContain('91%')
  expect(disk.latest).toEqual([{ kind: 'seven_day', percentUsed: 91, resetsAt: iso(80 * H) }])
})

test('a fresh reading is published for the other sessions', async ($, on) => {
  const disk: Record<string, unknown> = {}
  engine(on, [], disk)
  await start($)
  await measure($, [{ kind: 'five_hour', percentUsed: 20, resetsAt: iso(H) }])
  expect(disk.latest).toEqual([{ kind: 'five_hour', percentUsed: 20, resetsAt: iso(H) }])
  expect((disk.history as any).five_hour.length).toBe(1)
})

test('the shared history keeps the samples other sessions recorded', async ($, on) => {
  const disk: Record<string, unknown> = {}
  engine(on, [], disk)
  await start($)
  // written by another session while this one runs
  disk.history = { five_hour: [[-60_000, 10]] }
  await measure($, [{ kind: 'five_hour', percentUsed: 20, resetsAt: iso(H) }])
  expect((disk.history as any).five_hour).toEqual([[-60_000, 10], [0, 20]])
})

test('at 100 % a quip replaces the bar', async ($, on) => {
  engine(on)
  await measure($, [{ kind: 'five_hour', percentUsed: 100, resetsAt: iso(H) }])
  const ui = await mount($, 'terminal')
  const t = await all(ui)
  expect(t).toContain('back in')
  expect(t).not.toContain('░')
  expect(t).not.toContain('100%')
})

test('narrow terminals get the compact form', async ($, on) => {
  engine(on)
  await measure($, [{ kind: 'five_hour', percentUsed: 42 }])
  const ui = await mount($, 'terminal', 60)
  const t = await all(ui)
  expect(t).toContain('42%')
  expect(t).not.toContain('░')
})

test('/usage-bars switches mode, style and flags', async ($, on) => {
  engine(on)
  await start($)
  await measure($, [{ kind: 'five_hour', percentUsed: 42 }])
  const ui = await mount($, 'terminal')

  expect((await $.command.run({ command: 'usage-bars', args: 'compact' } as never)).text).toContain('compact')
  expect(await all(ui)).not.toContain('░')

  await $.command.run({ command: 'usage-bars', args: 'pacman' } as never)
  expect(await all(ui)).toContain('ᗧ')

  await $.command.run({ command: 'usage-bars', args: 'face off' } as never)
  expect(await all(ui)).not.toContain('🙂')

  await $.command.run({ command: 'usage-bars', args: 'off' } as never)
  expect(await all(ui)).not.toContain('5h')

  expect((await $.command.run({ command: 'usage-bars', args: 'stats' } as never)).text).toContain('42 % used')
  expect((await $.command.run({ command: 'usage-bars', args: '' } as never)).text).toContain('/usage-bars demo')
})

test('prefs survive a new session through the store', async ($, on) => {
  engine(on)
  await start($)
  await $.command.run({ command: 'usage-bars', args: 'style tank' } as never)
  await start($)
  await measure($, [{ kind: 'five_hour', percentUsed: 42 }])
  const ui = await mount($, 'terminal')
  expect(await all(ui)).toContain('⛽E')
})

test('/usage-bars demo plays the animation', async ($, on) => {
  const { clock } = engine(on)
  await start($)
  await measure($, [
    { kind: 'five_hour', percentUsed: 42 },
    { kind: 'seven_day', percentUsed: 20 },
  ])
  await $.command.run({ command: 'usage-bars', args: 'demo' } as never)
  const ui = await mount($, 'terminal')
  const t = await all(ui)
  expect(t).toContain('+7%')
  expect(t).toContain('refuelled')
  await clock.advance(8000)
  expect(await all(ui)).toContain('42%')
})

test('German on request: line, toasts and commands', { options: { language: 'de' } } as never, async ($: any, on: any) => {
  const { toasts } = engine(on)
  await start($)
  await measure($, [{ kind: 'five_hour', percentUsed: 81, resetsAt: iso(3 * 24 * H) }])
  const ui = await mount($, 'terminal')
  expect(await all(ui)).toContain('↻ 3T 0h')
  expect(toasts[0]).toContain('Kontingent bei 81 %')
  expect((await $.command.run({ command: 'usage-bars', args: 'stats' } as never)).text).toContain('81 % verbraucht')
})

test('/usage-bars lang switches the language and keeps it', async ($, on) => {
  engine(on)
  await start($)
  await measure($, [{ kind: 'five_hour', percentUsed: 100, resetsAt: iso(H) }])
  const ui = await mount($, 'terminal')
  expect(await all(ui)).toContain('back in')
  expect((await $.command.run({ command: 'usage-bars', args: 'lang de' } as never)).text).toBe('Sprache: Deutsch')
  expect(await all(ui)).toContain('weiter in')
  // a new session reads the choice back from the store
  await start($)
  await measure($, [{ kind: 'five_hour', percentUsed: 100, resetsAt: iso(H) }])
  expect(await all(ui)).toContain('weiter in')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`typing /usage-bars lists what may follow, in place of the bars (${surface})`, async ($, on) => {
    engine(on)
    let draft = ''
    on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
    await measure($, [{ kind: 'five_hour', percentUsed: 42 }])
    expect(await all(await mount($, surface))).toContain('42%')

    draft = '/usage-bars st'
    let t = await all(await mount($, surface))
    expect(t).toContain('st|ats')
    expect(t).toContain('st|yle')
    expect(t).not.toContain('42%')
    expect(t).toContain('? for shortcuts')

    draft = '/usage-bars stats'
    expect(await all(await mount($, surface))).toContain('rate, projection, history, record')

    draft = '/usage-bars stats '
    t = await all(await mount($, surface))
    expect(t).toContain('42%')
    expect(t).not.toContain('⌨')
  })
}

test('the list shows even with the line off and before any data, in the chosen language', { options: { language: 'de' } } as never, async ($: any, on: any) => {
  engine(on)
  on('prompt.read', () => ({ value: { text: '/usage-bars sta', cursor: 15 } }))
  await start($)
  await $.command.run({ command: 'usage-bars', args: 'off' } as never)
  const t = await all(await mount($, 'terminal'))
  expect(t).toContain('sta|ts')
  expect(t).toContain('Rate, Hochrechnung')
})
