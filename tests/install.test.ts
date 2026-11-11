import { expect, test } from 'claude-code/testing'

const packet = { requester: 'Claude Code', project: 'clean-install', brief: 'Review this write order.',
  context: { goal: 'Avoid inconsistent results.', materials: [{ id: 'code-1', content: 'ORIGINAL_EVIDENCE' }] } }
const prepared = { ok: true, status: 'awaiting_confirmation', draft: {
  id: 'synthetic-draft', hash: 'synthetic-hash', destination: 'https://api.zesia.dev', packet,
} }
const pane = (surface: 'terminal' | 'desktop', columns: number) => ({
  plugin: 'zesia-consult', component: 'Pane', requestId: 'zesia-confirm', surface,
  viewport: { columns, rows: 40 }, props: {
    title: 'ZESIA', isFocused: true, bodyColumns: columns, placement: 'inline',
    scroll: { offset: 0, bodyRows: 30 }, view: {},
  },
})

for (const surface of ['terminal', 'desktop'] as const) {
  for (const columns of [32, 80]) {
    test(`${surface} ${columns}: materials can be reviewed and cancelled without sending`, async ($, on) => {
      let closed = false
      on('tool.call', () => ({ result: { structuredContent: prepared } }))
      on('ui.open', () => ({ value: { isPlaced: true } }))
      on('ui.close', () => { closed = true; return { value: undefined } })
      await $.tool.call({ tool: 'mcp__zesia__zesia_consult' })
      const ui = await $.ui.mount(pane(surface, columns))
      expect(await ui.find({ type: 'Text', text: 'Review before sending' })).toBeDefined()
      await ui.press({ key: 'zesia-materials' })
      expect(await ui.find({ type: 'Text', text: /ORIGINAL_EVIDENCE/ })).toBeDefined()
      await ui.press({ key: 'zesia-json' })
      expect(await ui.find({ type: 'Text', text: /"requester":/ })).toBeDefined()
      await ui.press({ key: 'zesia-cancel' })
      expect(closed).toBe(true)
      await ui.unmount()
    })
  }
}

test('native confirm submits only a local result reference to chat', async ($, on) => {
  let submitted = ''
  let calls = 0
  on('tool.call', () => ({ result: { structuredContent: prepared } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('mcp.call', (_$, e) => {
    expect(JSON.stringify(e)).not.toContain('ORIGINAL_EVIDENCE')
    calls++
    return { value: { structuredContent: { ok: true, status: 'completed', advice: 'NATIVE_RESULT' } } }
  })
  on('prompt.submit', ($, e) => { submitted = e.text; return { text: e.text } })
  await $.tool.call({ tool: 'mcp__zesia__zesia_consult' })
  const ui = await $.ui.mount(pane('desktop', 60))
  await ui.press({ key: 'zesia-confirm' })
  expect(calls).toBe(1)
  expect(submitted).toContain('synthetic-draft')
  expect(submitted).not.toContain('NATIVE_RESULT')
  await ui.unmount()
})

test('native click completes while a consultation is still pending', async ($, on) => {
  let release!: () => void
  let submitted = ''
  let calls = 0
  const pending = new Promise<void>(resolve => { release = resolve })
  on('tool.call', () => ({ result: { structuredContent: prepared } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('mcp.call', async () => {
    calls++
    await pending
    return { value: { structuredContent: { ok: true, advice: 'DELAYED_NATIVE_RESULT' } } }
  })
  on('prompt.submit', ($, e) => { submitted = e.text; return { text: e.text } })
  await $.tool.call({ tool: 'mcp__zesia__zesia_consult' })
  const ui = await $.ui.mount(pane('terminal', 80))
  const clicked = ui.press({ key: 'zesia-confirm' })
  const acknowledged = await Promise.race([
    clicked.then(() => true),
    new Promise<boolean>(resolve => setTimeout(() => resolve(false), 100)),
  ])
  const beforeResult = submitted
  release()
  await clicked
  for (let i = 0; i < 20 && !submitted; i++) await new Promise(resolve => setTimeout(resolve, 5))
  expect(acknowledged).toBe(true)
  expect(beforeResult).toBe('')
  expect(calls).toBe(1)
  expect(submitted).toContain('zesia_result')
  expect(submitted).not.toContain('DELAYED_NATIVE_RESULT')
  await ui.unmount()
})
