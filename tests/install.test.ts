import { expect, test } from 'claude-code/testing'

for (const surface of ['terminal', 'desktop'] as const) {
  for (const columns of [32, 80]) {
    test(surface + ' ' + columns + ' columns: the native button prepares a review', async ($, on) => {
      let submitted = ''
      let toolCalls = 0
      // Older Mod test runners need an explicit host renderer beneath the plugin.
      on('ui.render', ($, e) => {
        const { Box } = $.ui.resolve(e)
        return Box({ key: 'host-above-prompt', children: [] })
      })
      on('prompt.submit', (_, e) => {
        submitted = e.text
        return { text: e.text }
      })
      on('tool.call', () => {
        toolCalls += 1
        return { result: {} }
      })

      const ui = await $.ui.mount({
        plugin: 'zesia-consult',
        component: 'AbovePrompt',
        requestId: 'above-prompt',
        surface,
        viewport: { columns, rows: 40 },
        props: { hasSurvey: false, isWorking: false, isCollapsed: false, bodyColumns: columns, maxRows: 4,
          scroll: { offset: 0, bodyRows: 4 }, view: {} },
      })
      try {
        expect(await ui.find({ key: 'host-above-prompt' })).toBeDefined()
        expect(await ui.find({ key: 'zesia-review' })).toBeDefined()
        expect(submitted).toBe('')
        await ui.press({ key: 'zesia-review' })
        expect(submitted).toContain('zesia-consult-prepare')
        expect(submitted).toContain('https://zesia.dev/consult')
        expect(toolCalls).toBe(0)
      } finally {
        await ui.unmount()
      }
    })
  }
}
