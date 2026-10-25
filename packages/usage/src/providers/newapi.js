/**
 * NewAPI provider — relay token quota as a USD balance.
 *
 * Endpoint: GET {baseUrl}/api/usage/token. There is NO default base: a NewAPI
 * site is self-hosted, so `baseUrl` is mandatory config and the provider
 * stays disabled until one is set.
 * Auth: Bearer (the relay token).
 *
 * Reply: { code, message?, data: { total_granted, total_used,
 * total_available, unlimited_quota } } — quota units; 500000 units = 1 USD.
 */

import { fetchUsageJson, isRecord, mountProvider, num } from './net.js'

const QUOTA_PER_USD = 500000

function usd(quota) {
  return quota === null ? null : quota / QUOTA_PER_USD
}

function fmtUsd(value) {
  return value === null ? '—' : `$${value.toFixed(2)}`
}

function formatReport(state) {
  const lines = ['NewAPI token quota']
  const d = state.data
  if (d) {
    lines.push(`Granted: ${fmtUsd(d.total)} · used: ${fmtUsd(d.used)} · remaining: ${fmtUsd(d.remaining)}`)
  }
  if (state.status === 'error') lines.push(`Warning: last refresh failed (${state.error}): ${state.detail ?? ''}`.trim())
  if (state.endpoint) lines.push(`Endpoint: ${String(state.endpoint).replace(/^https:\/\//, '')}`)
  if (state.fetchedAt) lines.push(`Read at ${new Date(state.fetchedAt).toLocaleTimeString()}`)
  return lines.join('\n')
}

export function mountNewApi(ctx, config = {}) {
  const credentialRef = config.credentialRef ?? 'NEWAPI_API_KEY'
  const baseUrl = typeof config.baseUrl === 'string' && config.baseUrl.length > 0 ? config.baseUrl.replace(/\/+$/, '') : null

  if (!baseUrl) {
    // Config-only provider: without a site URL there is nothing to poll.
    // Mount nothing, but say why once.
    console.warn('usage: provider "newapi" has no baseUrl; set one in the bundle config to enable it.')
    return
  }

  mountProvider(ctx, {
    id: 'newapi',
    title: 'NewAPI',
    serviceKey: 'newapiUsage',
    commandName: 'usage-newapi',
    commandDescription: 'NewAPI relay token quota as a USD balance',
    endpoint: baseUrl,
    defaultGate: null,
    formatReport,
    fetchState: async (c, cfg) => {
      const result = await fetchUsageJson(c, {
        credentialRef,
        url: baseUrl + '/api/usage/token',
        timeoutMs: cfg.timeoutMs,
      })
      if (result.failure) return result
      const body = result.body
      if (typeof body.message === 'string' && body.code !== 200) {
        return { failure: 'api-error', detail: body.message }
      }
      const data = isRecord(body.data) ? body.data : null
      if (!data) return { failure: 'bad-response', detail: 'Reply lacks data.' }
      if (data.unlimited_quota === true) {
        return { failure: 'unlimited-quota', detail: 'This token has unlimited quota; there is no remaining balance to read.' }
      }
      const total = num(data.total_granted)
      const remaining = num(data.total_available)
      if (total === null && remaining === null) {
        return { failure: 'bad-response', detail: 'Reply lacks total_granted/total_available.' }
      }
      return {
        endpoint: baseUrl,
        data: { kind: 'balance', total: usd(total), used: usd(num(data.total_used)), remaining: usd(remaining), currency: 'USD' },
      }
    },
  }, config)
}
