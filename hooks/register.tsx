import type { Register } from 'claude-code'

const REVIEW_PROMPT = 'Ask 则灵 (ZESIA) for an independent review of the previous reply or current plan. Use zesia-consult-prepare, call zesia_consult to open the shared https://zesia.dev/consult window, and wait for the result with zesia_wait. Respond in the conversation’s language.'

type ConsultValue = {
  ok?: boolean
  status?: string
  url?: string
  errorMessage?: string
  message?: string
  [key: string]: unknown
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

function isZesiaTool(tool: string): boolean {
  return /^zesia_(consult|followup)$/.test(tool)
    || /^mcp__(?:plugin_zesia-consult_)?zesia__zesia_(consult|followup)$/.test(tool)
}

export const register: Register = on => {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const beneath = await next(e)
    if (e.props.isWorking || e.props.isCollapsed || e.props.hasSurvey) return beneath

    const { Box, Button } = $.ui.resolve(e)
    return Box({
      children: [
        beneath,
        Button({
          key: 'zesia-review',
          label: 'Review with 则灵',
          onPress: async () => {
            try {
              await $.prompt.submit({ text: REVIEW_PROMPT })
            } catch {
              await $.ui.toast('Could not start the Zesia review.')
            }
          },
        }),
      ],
    })
  })

  on('tool.call', async ($, e, next) => {
    const outcome = await next(e)
    if (!isZesiaTool(e.tool)) return outcome
    try {
      const value = parseToolValue(outcome.result)
      if (value?.status === 'awaiting_online_review') {
        await $.ui.toast('Review and approve in the shared zesia.dev/consult window.')
      } else if (value?.ok === false) {
        await $.ui.toast(value.message || value.errorMessage || 'Zesia preparation failed.')
      }
    } catch {
      // A session without a notification surface still receives the tool result.
    }
    return outcome
  })
}
