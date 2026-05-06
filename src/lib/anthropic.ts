/**
 * Minimal Anthropic Messages API client using native fetch.
 *
 * We avoid the official SDK to keep dependency surface small — the only call
 * site is the outreach-draft generator. If usage grows, swap for
 * `@anthropic-ai/sdk`.
 *
 * Required env: ANTHROPIC_API_KEY
 * Optional env: ANTHROPIC_MODEL (default: claude-3-5-sonnet-20241022)
 */

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022'
const ENDPOINT = 'https://api.anthropic.com/v1/messages'

export interface CompletionParams {
  system: string
  user: string
  /** Hard cap on output tokens. Outreach drafts are short — 600 is plenty. */
  max_tokens?: number
  /** Override default model. */
  model?: string
}

export interface CompletionResult {
  text: string
  model: string
}

export async function complete(params: CompletionParams): Promise<CompletionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set')
  }
  const model = params.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: params.max_tokens ?? 600,
      system: params.system,
      messages: [{ role: 'user', content: params.user }],
    }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`Anthropic API ${res.status}: ${errBody.slice(0, 500)}`)
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text?: string }>
    model: string
  }

  const text = data.content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text!)
    .join('\n')
    .trim()

  if (!text) {
    throw new Error('Anthropic returned empty completion')
  }

  return { text, model: data.model }
}
