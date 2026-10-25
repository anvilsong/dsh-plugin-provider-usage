/**
 * MiniMax Coding Plan provider — subscription quota windows.
 *
 * Endpoint: GET {base}/v1/api/openplatform/coding_plan/remains
 *   base cn:     https://api.minimaxi.com
 *   base global: https://api.minimax.io
 * Auth: Bearer.
 *
 * Reply: { base_resp: { status_code, status_msg }, model_remains: [...] }.
 * The `general` entry carries REMAINING percents (not used):
 * current_interval_remaining_percent (5-hour), and when
 * current_weekly_status === 1, current_weekly_remaining_percent (7-day).
 * end_time / weekly_end_time are epoch ms.
 */

import { fetchUsageJson, isRecord, mountProvider, num } from './net.js'

const DEFAULT_CREDENTIAL_REF = 'MINIMAX_API_KEY'
const BASE_URL_CN = 'https://api.minimaxi.com'
const BASE_URL_GLOBAL = 'https://api.minimax.io'

function windowLine(label, w) {
  const pctText = w.usedRatio !== null ? `${(w.usedRatio * 100).toFixed(1)}% used` : '—'
  return `${label}: ${pctText}${w.resetAt ? ` · resets ${w.resetAt}` : ''}`
}

function formatReport(state) {
  const lines = ['MiniMax Coding Plan usage']
  const d = state.data
  if (d) {
    for (const w of d.windows) lines.push(windowLine(w.label, w))
  }
  if (state.status === 'error') lines.push(`Warning: last refresh failed (${state.error}): ${state.detail ?? ''}`.trim())
  if (state.endpoint) lines.push(`Endpoint: ${String(state.endpoint).replace(/^https:\/\//, '')}`)
  if (state.fetchedAt) lines.push(`Read at ${new Date(state.fetchedAt).toLocaleTimeString()}`)
  return lines.join('\n')
}

function resetIso(ms) {
  const n = num(ms)
  return n !== null ? new Date(n).toISOString() : null
}

export function mountMiniMax(ctx, config = {}) {
  const credentialRef = config.credentialRef ?? DEFAULT_CREDENTIAL_REF
  const baseUrl =
    typeof config.baseUrl === 'string' && config.baseUrl.length > 0
      ? config.baseUrl.replace(/\/+$/, '')
      : config.region === 'global'
        ? BASE_URL_GLOBAL
        : BASE_URL_CN
  const url = baseUrl + '/v1/api/openplatform/coding_plan/remains'

  mountProvider(ctx, {
    id: 'minimax',
    title: 'MiniMax Coding Plan',
    serviceKey: 'minimaxUsage',
    commandName: 'usage-minimax',
    commandDescription: 'MiniMax Coding Plan quota windows (5-hour, 7-day)',
    endpoint: baseUrl,
    defaultGate: ['minimax-cn', 'minimax'],
    formatReport,
    fetchState: async (c, cfg) => {
      const result = await fetchUsageJson(c, { credentialRef, url, timeoutMs: cfg.timeoutMs })
      if (result.failure) return result
      const body = result.body
      const baseResp = isRecord(body.base_resp) ? body.base_resp : null
      if (baseResp && num(baseResp.status_code) !== 0) {
        return { failure: 'api-error', detail: String(baseResp.status_msg ?? 'The API returned an error.') }
      }
      const remains = Array.isArray(body.model_remains) ? body.model_remains : []
      const general = remains.find((m) => isRecord(m) && m.model_name === 'general')
      if (!general) return { failure: 'bad-response', detail: 'Reply lacks the "general" model entry.' }

      const windows = []
      const intervalRemain = num(general.current_interval_remaining_percent)
      if (intervalRemain !== null) {
        windows.push({
          key: 'fiveHour', label: '5-hour window',
          usedRatio: Math.max(0, 100 - intervalRemain) / 100,
          resetAt: resetIso(general.end_time),
        })
      }
      if (num(general.current_weekly_status) === 1) {
        const weeklyRemain = num(general.current_weekly_remaining_percent)
        if (weeklyRemain !== null) {
          windows.push({
            key: 'sevenDay', label: '7-day window',
            usedRatio: Math.max(0, 100 - weeklyRemain) / 100,
            resetAt: resetIso(general.weekly_end_time),
          })
        }
      }
      if (windows.length === 0) return { failure: 'bad-response', detail: 'Reply carries no usage windows.' }
      return { endpoint: baseUrl, data: { kind: 'quota', windows } }
    },
  }, config)
}
