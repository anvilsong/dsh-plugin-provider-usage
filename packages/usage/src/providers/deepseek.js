/**
 * DeepSeek provider — account balance.
 *
 * Endpoint: GET {base}/user/balance (base default https://api.deepseek.com).
 * Auth: Bearer. Reply: { is_available, balance_infos: [{ currency,
 * total_balance, granted_balance, topped_up_balance }] } — amounts are
 * STRINGS on the wire.
 */

import { fetchUsageJson, mountProvider, num } from './net.js'

const DEFAULT_CREDENTIAL_REF = 'DEEPSEEK_API_KEY'
const DEFAULT_BASE = 'https://api.deepseek.com'

function fmtAmount(value, currency) {
  if (value === null) return '—'
  return `${value.toFixed(2)} ${currency}`
}

function formatReport(state) {
  const lines = ['DeepSeek balance']
  const d = state.data
  if (d) {
    for (const b of d.balances) {
      let line = `${b.currency}: ${fmtAmount(b.total, b.currency)}`
      const parts = []
      if (b.toppedUp !== null) parts.push(`topped up ${fmtAmount(b.toppedUp, b.currency)}`)
      if (b.granted !== null && b.granted !== 0) parts.push(`granted ${fmtAmount(b.granted, b.currency)}`)
      if (parts.length > 0) line += ` (${parts.join(' · ')})`
      lines.push(line)
    }
    if (d.isAvailable === false) lines.push('Balance status: insufficient — the API refuses calls until topped up.')
  }
  if (state.status === 'error') lines.push(`Warning: last refresh failed (${state.error}): ${state.detail ?? ''}`.trim())
  if (state.endpoint) lines.push(`Endpoint: ${String(state.endpoint).replace(/^https:\/\//, '')}`)
  if (state.fetchedAt) lines.push(`Read at ${new Date(state.fetchedAt).toLocaleTimeString()}`)
  return lines.join('\n')
}

export function mountDeepSeek(ctx, config = {}) {
  const credentialRef = config.credentialRef ?? DEFAULT_CREDENTIAL_REF
  const baseUrl = (typeof config.baseUrl === 'string' && config.baseUrl.length > 0 ? config.baseUrl : DEFAULT_BASE).replace(/\/+$/, '')
  const url = baseUrl + '/user/balance'

  mountProvider(ctx, {
    id: 'deepseek',
    title: 'DeepSeek',
    serviceKey: 'deepseekUsage',
    commandName: 'usage-deepseek',
    commandDescription: 'DeepSeek account balance per currency',
    endpoint: baseUrl,
    defaultGate: ['deepseek', 'deepseek-official'],
    formatReport,
    fetchState: async (c, cfg) => {
      const result = await fetchUsageJson(c, {
        credentialRef,
        url,
        timeoutMs: cfg.timeoutMs,
      })
      if (result.failure) return result
      const body = result.body
      if (body.error) {
        return { failure: 'api-error', detail: String(body.error.message ?? body.error.type ?? 'The API returned an error.') }
      }
      const infos = Array.isArray(body.balance_infos) ? body.balance_infos : null
      if (!infos) return { failure: 'bad-response', detail: 'Reply lacks balance_infos.' }
      return {
        endpoint: baseUrl,
        data: {
          kind: 'balance',
          isAvailable: body.is_available !== false,
          balances: infos.map((info) => ({
            currency: typeof info?.currency === 'string' ? info.currency : 'CNY',
            total: num(info?.total_balance),
            granted: num(info?.granted_balance),
            toppedUp: num(info?.topped_up_balance),
          })),
        },
      }
    },
  }, config)
}
