import type { Register } from 'claude-code'

const PANE = 'zesia-confirm'
const REVIEW_PROMPT = 'Ask zesia for an independent review of the previous reply or current plan. Use zesia-consult-prepare and prepare the materials for my confirmation. Respond in the conversation’s language.'

type Draft = {
  id: string
  hash: string
  destination: string
  packet: {
    project?: string
    requester?: string
    brief?: string
    context?: { goal?: string; statements?: unknown[]; materials?: unknown[]; [key: string]: unknown }
    [key: string]: unknown
  }
}
type ConsultValue = {
  ok?: boolean
  status?: string
  draft?: Draft
  advice?: string
  errorMessage?: string
  error?: { outcome?: string }
  [key: string]: unknown
}

// A received result survives a failed chat submission. Returning it never sends
// the packet a second time. Unknown send outcomes likewise cannot be retried here.
const state = {
  draft: null as Draft | null,
  result: null as ConsultValue | null,
  error: null as string | null,
  busy: false,
  sendAttempted: false,
  server: 'zesia',
  showMaterials: false,
  showJson: false,
}

function isConsultValue(value: unknown): value is ConsultValue {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && ('status' in value || 'ok' in value)
}
function parseText(text: unknown): ConsultValue | null {
  if (typeof text !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(text)
    return isConsultValue(parsed) ? parsed : null
  } catch {
    return null
  }
}
function parseToolValue(value: unknown): ConsultValue | null {
  const result = value as { structuredContent?: unknown; content?: Array<{ type?: string; text?: string }> } | undefined
  if (isConsultValue(result?.structuredContent)) return result.structuredContent
  for (const block of result?.content ?? []) {
    if (block.type !== 'text') continue
    const parsed = parseText(block.text)
    if (parsed) return parsed
  }
  return null
}
function serverOf(tool: string): string | null {
  const match = /^mcp__(.+)__(zesia_consult|zesia_followup)$/.exec(tool)
  return match?.[1] || null
}
// Readable, lossless disclosure of every context field, including attribution,
// quotes, code excerpts and continuation answers. Raw JSON is a separate view.
function readable(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return value.length ? value.map((item, i) => `${i + 1}. ${readable(item)}`).join('\n\n') : '[]'
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, item]) => `${key}: ${readable(item)}`).join('\n')
  }
  return String(value ?? '')
}

export const register: Register = on => {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.props.isWorking) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const hasReview = !!state.draft || !!state.result
    return (
      <Box gap="md" alignItems="center">
        <Button key="zesia-entry" variant="primary" label="ZESIA" onPress={async () => {
          if (state.busy) return
          if (hasReview) {
            await $.ui.open({ id: PANE, title: 'ZESIA', focus: true, closeOnEscape: true })
          } else {
            await $.prompt.submit({ text: REVIEW_PROMPT, asUser: true })
          }
        }} />
        {hasReview ? <Button key="zesia-review" plain label={state.result ? 'View result' : 'Review materials'} onPress={async () => {
          await $.ui.open({ id: PANE, title: 'ZESIA', focus: true, closeOnEscape: true })
        }} /> : null}
        {state.busy ? <Text dimColor>Consulting…</Text> : null}
      </Box>
    )
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    try {
      const server = serverOf(String(e.tool))
      if (!server) return ran
      const value = parseToolValue(ran.result) ?? parseText(ran.text)
      if (value?.status === 'awaiting_confirmation' && value.draft?.id) {
        // Do not replace an in-flight packet with a concurrent preparation.
        if (state.busy) return ran
        state.draft = value.draft
        state.result = null
        state.server = server
        state.error = null
        state.sendAttempted = false
        state.showMaterials = false
        state.showJson = false
        $.ui.invalidate('ui.render')
        await $.ui.open({ id: PANE, title: 'ZESIA', focus: true, closeOnEscape: true })
      }
    } catch {
      // A presentation error must not change a tool's actual outcome.
    }
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const draft = state.draft

    async function returnResult(): Promise<void> {
      if (!draft || !state.result || state.busy) return
      state.busy = true
      state.error = null
      $.ui.invalidate('ui.render')
      try {
        await $.prompt.submit({
          text: `Read the confirmed zesia result for draft ${JSON.stringify(draft.id)} with zesia_result. Assess it in this conversation’s language. Do not send another consultation.`,
        })
        state.result = null
        state.draft = null
        state.busy = false
        $.ui.invalidate('ui.render')
      } catch (error) {
        state.busy = false
        state.error = `The result was received but could not return to chat. ${String((error as Error)?.message || error)}`
        $.ui.invalidate('ui.render')
        return
      }
      await $.ui.close({ id: PANE }).catch(() => {})
    }
    async function confirm(): Promise<void> {
      if (!draft || state.busy || state.sendAttempted) return
      state.busy = true
      state.sendAttempted = true
      state.error = null
      $.ui.invalidate('ui.render')
      try {
        const result = await $.mcp.call(state.server, 'zesia_send', {
          draftId: draft.id,
          approvedHash: draft.hash,
          confirmation: 'User clicked Confirm and send in the zesia confirmation pane.',
        })
        const value = parseToolValue(result)
        if (!value) throw new Error('The service returned an unrecognized result. Delivery may have completed; do not resend automatically. Reload the plugin if it was updated.')
        if (value.ok === false) {
          const outcome = value.error?.outcome
          const status = outcome === 'not_started'
            ? 'Consultation was not sent.'
            : outcome === 'unknown'
              ? 'Delivery could not be confirmed. Do not resend.'
              : 'The consultation did not complete.'
          state.error = [status, value.errorMessage].filter(Boolean).join(' ')
          state.busy = false
          $.ui.invalidate('ui.render')
          return
        }
        state.result = value
        state.busy = false
        await returnResult()
      } catch (error) {
        state.busy = false
        state.error = `Delivery could not be confirmed. ${String((error as Error)?.message || error)}`
        $.ui.invalidate('ui.render')
      }
    }
    async function cancel(): Promise<void> {
      if (state.busy) return
      state.draft = null
      state.result = null
      state.error = null
      state.showMaterials = false
      state.showJson = false
      $.ui.invalidate('ui.render')
      await $.ui.close({ id: PANE })
    }

    if (!draft) {
      return <Box padding="md"><Text dimColor>No materials awaiting confirmation.</Text></Box>
    }
    const packet = draft.packet
    const context = packet.context || {}
    const materials = Array.isArray(context.materials) ? context.materials.length : 0
    const statements = Array.isArray(context.statements) ? context.statements.length : 0
    const narrow = e.props.bodyColumns < 52
    return (
      <Box flexDirection="column" padding="md" gap="md">
        <Box flexDirection="column" gap="xs">
          <Text weight="semibold">{state.result ? 'Result received' : state.sendAttempted ? (state.busy ? 'Consulting…' : 'Delivery needs attention') : 'Review before sending'}</Text>
          <Text dimColor>{String(packet.project || 'Unassigned')} · {String(packet.requester || 'Claude Code')}</Text>
        </Box>
        <Box flexDirection="column" gap="sm">
          <Text weight="semibold">Question</Text>
          <Text>{String(packet.brief || '')}</Text>
          {context.goal ? <Text dimColor>{String(context.goal)}</Text> : null}
        </Box>
        <Box flexDirection="column" gap="sm">
          <Text dimColor>{statements} attributed statements · {materials} evidence materials</Text>
          <Button key="zesia-materials" plain label={state.showMaterials ? 'Hide materials' : `Review materials (${materials})`} onPress={() => {
            state.showMaterials = !state.showMaterials
            $.ui.invalidate('ui.render')
          }} />
          {state.showMaterials ? <Text>{readable(context)}</Text> : null}
          <Button key="zesia-json" plain label={state.showJson ? 'Hide raw JSON' : 'View raw JSON'} onPress={() => {
            state.showJson = !state.showJson
            $.ui.invalidate('ui.render')
          }} />
          {state.showJson ? <Text mono>{JSON.stringify(packet, null, 2)}</Text> : null}
        </Box>
        <Box flexDirection="column" gap="xs">
          <Text dimColor>Send to {draft.destination}</Text>
          {!state.sendAttempted ? <Text dimColor>Only these materials will be sent after confirmation.</Text> : null}
        </Box>
        {state.result?.advice ? <Text>{state.result.advice}</Text> : null}
        {state.error ? <Text>{'Error: ' + state.error}</Text> : null}
        <Box gap="sm" flexDirection={narrow ? 'column' : 'row'}>
          {state.busy ? <Text dimColor>Consulting…</Text> : state.result ? (
            <Button key="zesia-return" variant="primary" label="Return result to chat" onPress={() => { void returnResult() }} />
          ) : !state.sendAttempted ? (
            <Button key="zesia-confirm" variant="primary" label="Confirm and send" onPress={() => { void confirm() }} />
          ) : null}
          {!state.busy ? <Button key="zesia-cancel" variant="secondary" role="dismiss" label={state.sendAttempted ? 'Close' : 'Cancel'} onPress={cancel} /> : null}
        </Box>
      </Box>
    )
  })
}
