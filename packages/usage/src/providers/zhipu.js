/**
 * Zhipu (GLM Coding Plan) provider — subscription quota windows.
 *
 * Endpoint: GET {base}/api/monitor/usage/quota/limit
 *   base cn:     https://open.bigmodel.cn
 *   base global: https://api.z.ai
 * Auth: the RAW key in Authorization (no Bearer prefix) — the coding-plan
 * monitor API predates the platform's Bearer convention.
 *
 * Reply: { success, data: { level, limits: [...] } }. Window classification:
 * unit 3 → 5-hour, unit 6 → 7-day; TOKENS_LIMIT and CREDIT_LIMIT both count
 * (Credit plans use the same window semantics). TIME_LIMIT is the tool-call
 * window. nextResetTime is epoch ms. `percentage` is the used percent.
 */

import { fetchUsageJson, isRecord, mountProvider, num } from './net.js'

const DEFAULT_CREDENTIAL_REF = 'ZHIPU_API_KEY'
const BASE_URL_CN = 'https://open.bigmodel.cn'
const BASE_URL_GLOBAL = 'https://api.z.ai'

function windowLine(label, w) {
  const pctText = w.usedRatio !== null ? `${(w.usedRatio * 100).toFixed(1)}% used` : '—'
  let line = `${label}: ${pctText}`
  if (w.limit !== null && w.remaining !== null) line += ` (${w.limit - w.remaining} / ${w.limit})`
  if (w.resetAt) line += ` · resets ${w.resetAt}`
  return line
}

function formatReport(state) {
  const lines = ['GLM Coding Plan usage']
  const d = state.data
  if (d) {
    if (d.level) lines.push(`Plan: ${d.level}`)
    for (const w of d.windows) lines.push(windowLine(w.label, w))
    const p = d.prompts
    if (p) {
      lines.push(windowLine('Tool calls', p))
      for (const det of p.details.slice(0, 6)) lines.push(`  ${det.model}: ${det.usage}`)
    }
  }
  if (state.status === 'error') lines.push(`Warning: last refresh failed (${state.error}): ${state.detail ?? ''}`.trim())
  if (state.endpoint) lines.push(`Endpoint: ${String(state.endpoint).replace(/^https:\/\//, '')}`)
  if (state.fetchedAt) lines.push(`Read at ${new Date(state.fetchedAt).toLocaleTimeString()}`)
  return lines.join('\n')
}

/** Percent used: `percentage` first, else currentValue/usage. 0–100 → ratio. */
function usedRatio(item) {
  const percentage = num(item.percentage)
  if (percentage !== null) return percentage / 100
  const current = num(item.currentValue)
  const usage = num(item.usage)
  if (current !== null && usage !== null && usage > 0) return current / usage
  return null
}

function resetIso(item) {
  const ms = num(item.nextResetTime)
  return ms !== null ? new Date(ms).toISOString() : null
}

export function mountZhipu(ctx, config = {}) {
  const credentialRef = config.credentialRef ?? DEFAULT_CREDENTIAL_REF
  const baseUrl =
    typeof config.baseUrl === 'string' && config.baseUrl.length > 0
      ? config.baseUrl.replace(/\/+$/, '')
      : config.region === 'global'
        ? BASE_URL_GLOBAL
        : BASE_URL_CN
  const url = baseUrl + '/api/monitor/usage/quota/limit'

  mountProvider(ctx, {
    id: 'zhipu',
    title: 'GLM Coding Plan',
    serviceKey: 'zhipuUsage',
    commandName: 'usage-zhipu',
    commandDescription: 'GLM Coding Plan quota windows (5-hour, 7-day, tool calls)',
    endpoint: baseUrl,
    defaultGate: ['zai-coding-cn', 'zai'],
    formatReport,
    fetchState: async (c, cfg) => {
      const result = await fetchUsageJson(c, {
        credentialRef,
        url,
        auth: 'raw',
        timeoutMs: cfg.timeoutMs,
        hint401: 'Check the GLM Coding Plan key — this API takes the raw key, no Bearer prefix.',
      })
      if (result.failure) return result
      const body = result.body
      if (body.success === false) {
        return { failure: 'api-error', detail: String(body.msg ?? 'The API returned an error.') }
      }
      const limits = isRecord(body.data) && Array.isArray(body.data.limits) ? body.data.limits : null
      if (!limits) return { failure: 'bad-response', detail: 'Reply lacks data.limits.' }

      let fiveHour = null
      let sevenDay = null
      let prompts = null
      const unclassified = []
      const seenTypes = []
      for (const item of limits) {
        if (!isRecord(item)) continue
        const type = typeof item.type === 'string' ? item.type.toLowerCase() : ''
        if (type && !seenTypes.includes(type)) seenTypes.push(type)
        if (type === 'time_limit') {
          if (prompts === null) {
            const details = Array.isArray(item.usageDetails)
              ? item.usageDetails
                  .filter((x) => isRecord(x) && typeof x.modelCode === 'string' && num(x.usage) !== null)
                  .map((x) => ({ model: x.modelCode, usage: num(x.usage) }))
              : []
            prompts = { key: 'prompts', label: 'Tool calls', usedRatio: usedRatio(item), limit: num(item.usage), remaining: num(item.remaining), resetAt: resetIso(item), details }
          }
          continue
        }
        if (type !== 'tokens_limit' && type !== 'credit_limit') continue
        const entry = { usedRatio: usedRatio(item), limit: num(item.usage), remaining: num(item.remaining), resetAt: resetIso(item) }
        const unit = num(item.unit)
        if (unit === 3 && fiveHour === null) fiveHour = entry
        else if (unit === 6 && sevenDay === null) sevenDay = entry
        else unclassified.push(entry)
      }
      // Unknown units fill empty slots, soonest reset first.
      unclassified.sort((a, b) => (a.resetAt ? Date.parse(a.resetAt) : Infinity) - (b.resetAt ? Date.parse(b.resetAt) : Infinity))
      for (const entry of unclassified) {
        if (fiveHour === null) fiveHour = entry
        else if (sevenDay === null) sevenDay = entry
      }
      if (!fiveHour && !sevenDay && !prompts) {
        return { failure: 'bad-response', detail: `No parseable quota window; types seen: ${seenTypes.join(', ') || 'none'}.` }
      }
      const windows = []
      if (fiveHour) windows.push({ key: 'fiveHour', label: '5-hour window', ...fiveHour })
      if (sevenDay) windows.push({ key: 'sevenDay', label: '7-day window', ...sevenDay })
      const level = isRecord(body.data) && typeof body.data.level === 'string' ? body.data.level : null
      return { endpoint: baseUrl, data: { kind: 'quota', level, windows, prompts } }
    },
  }, config)
}
