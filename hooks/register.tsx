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
  return tool === 'zesia_consult'
    || tool === 'zesia_followup'
    || tool.startsWith('mcp__zesia__zesia_consult')
    || tool.startsWith('mcp__zesia__zesia_followup')
}

export const register: Register = hook => {
  hook('assistant.message.actions', async (ctx, message) => {
    const label = message.role === 'assistant' ? 'Review with 则灵' : ''
    if (!label) return []
    return [{
      id: 'zesia-review',
      label,
      onClick: async () => {
        try {
          await ctx.prompt.submit(REVIEW_PROMPT)
        } catch (error) {
          ctx.ui.toast(`Could not start review: ${error instanceof Error ? error.message : String(error)}`, { tone: 'error' })
        }
      },
    }]
  })

  hook('tool.call', async (ctx, call, next) => {
    const outcome = await next()
    if (!isZesiaTool(call.tool)) return outcome
    const value = parseToolValue(outcome.result)
    if (value?.status === 'awaiting_online_review') {
      ctx.ui.toast('Review and approve in the shared zesia.dev/consult window.')
    } else if (value?.ok === false) {
      ctx.ui.toast(value.message || value.errorMessage || 'ZESIA preparation failed.', { tone: 'error' })
    }
    return outcome
  })
}
