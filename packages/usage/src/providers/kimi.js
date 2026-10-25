/**
 * Kimi Code usage plugin — Host half.
 *
 * Responsibilities, in order:
 *   1. Resolve the Kimi Code credential through the credentials service on
 *      every call. Resolution is per-call and never cached, so a key rotated
 *      in Settings → Models reaches the next refresh without a restart.
 *   2. Call `GET {base}/usages` and normalize the reply into one flat shape:
 *      the rolling 5-hour and 7-day windows, the monthly quotas, and the
 *      Extra Usage (booster) wallet.
 *   3. Publish that shape as a Typert Remote service the browser half calls
 *      through `ctx.remote.kimiUsage`.
 *
 * The service exposes two zero-argument Remote methods:
 *   - `snapshot`  the current cached state (no Kimi call).
 *   - `refresh`   resolve the key, call Kimi, publish, return the state.
 *
 * The credential must be a Kimi Code key (created in the Kimi Code Console)
 * or a Kimi Code OAuth access token. A Kimi Platform key (api.moonshot.ai)
 * is refused with 401 — that product has its own pay-as-you-go wallet and
 * does not answer here.
 */

import {
  BASE_URL_CN,
  BASE_URL_GLOBAL,
  DEFAULT_CREDENTIAL_REF,
  DEFAULT_REFRESH_MS,
  DEFAULT_TIMEOUT_MS,
  FIXED_POINT_CENTS,
  USAGE_PATH,
} from './kimi-defaults.js'


/** Read a finite number, tolerating strings, null and undefined. */
function num(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.length > 0) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Parse one quota entry: `{ used_ratio, reset_time }`. */
function quotaEntry(raw) {
  if (!isRecord(raw)) return null
  const usedRatio = num(raw.used_ratio)
  if (usedRatio === null) return null
  return {
    usedRatio,
    resetAt: typeof raw.reset_time === 'string' && raw.reset_time.length > 0 ? raw.reset_time : null,
  }
}

/** Micro-cents → cents, with the CLI's sub-cent rounding kept. */
function fixedPointToCents(value) {
  const cents = value / FIXED_POINT_CENTS
  if (cents > 0 && cents < 1) return 1
  return Math.round(cents)
}

function moneyField(raw) {
  if (!isRecord(raw)) return null
  const cents = num(raw.priceInCents)
  if (cents === null) return null
  return {
    cents,
    currency: typeof raw.currency === 'string' ? raw.currency : '',
  }
}

/** Parse the Extra Usage (booster) wallet. Null when the account has none. */
function boosterWallet(raw) {
  if (!isRecord(raw)) return null
  const balance = raw.balance
  if (!isRecord(balance) || balance.type !== 'BOOSTER') return null
  const amountRaw = num(balance.amount)
  if (amountRaw === null || amountRaw <= 0) return null

  const totalCents = fixedPointToCents(amountRaw)
  const amountLeftRaw = num(balance.amountLeft)
  const balanceCents = amountLeftRaw !== null ? fixedPointToCents(amountLeftRaw) : 0

  const monthlyLimit = moneyField(raw.monthlyChargeLimit)
  const monthlyUsed = moneyField(raw.monthlyUsed)
  const currency =
    monthlyLimit && monthlyLimit.currency.length > 0
      ? monthlyLimit.currency
      : monthlyUsed && monthlyUsed.currency.length > 0
        ? monthlyUsed.currency
        : 'USD'

  return {
    balanceCents,
    totalCents,
    monthlyChargeLimitEnabled: raw.monthlyChargeLimitEnabled === true,
    monthlyChargeLimitCents: monthlyLimit ? monthlyLimit.cents : 0,
    monthlyUsedCents: monthlyUsed ? monthlyUsed.cents : 0,
    currency,
  }
}

/** Parse the plain request counter (`usage`) when the reply carries one. */
function requestCounter(raw) {
  if (!isRecord(raw)) return null
  const limit = num(raw.limit)
  const used = num(raw.used)
  const remaining = num(raw.remaining)
  if (limit === null && used === null && remaining === null) return null
  return {
    limit,
    used,
    remaining,
    resetAt: typeof raw.resetTime === 'string' && raw.resetTime.length > 0 ? raw.resetTime : null,
  }
}

/** Build the flat panel state from a /usages reply. */
function fromUsages(body) {
  const usages = isRecord(body.usages) ? body.usages : {}
  return {
    quotas: {
      fiveHour: quotaEntry(usages.limit_5h),
      sevenDay: quotaEntry(usages.limit_7d),
      monthTotal: quotaEntry(usages.limit_month_total),
      monthCode: quotaEntry(usages.limit_month_code),
    },
    extra: boosterWallet(body.boosterWallet),
    requests: requestCounter(body.usage),
  }
}

/** One quota line for the report; null when the plan omits the window. */
function quotaLine(label, entry) {
  if (!entry) return null
  const pct = `${(entry.usedRatio * 100).toFixed(1)}% used`
  return `${label}: ${pct}${entry.resetAt ? ` (resets ${entry.resetAt})` : ''}`
}

/** Format a cent amount with its currency. */
function money(cents, currency) {
  return `${currency} ${(cents / 100).toFixed(2)}`
}

/** Render the `/usage-kimi` report as plain text. */
function formatReport(state) {
  const lines = ['Kimi Code usage']
  const d = state.data
  if (d) {
    const q = d.quotas ?? {}
    for (const line of [
      quotaLine('5-hour window', q.fiveHour),
      quotaLine('7-day window', q.sevenDay),
      quotaLine('Monthly (all)', q.monthTotal),
      quotaLine('Monthly (code)', q.monthCode),
    ]) {
      if (line) lines.push(line)
    }
    const r = d.requests
    if (r) {
      const count = r.used !== null && r.limit !== null ? `${r.used} / ${r.limit}` : r.used !== null ? `${r.used}` : null
      if (count) lines.push(`Requests: ${count}${r.resetAt ? ` (resets ${r.resetAt})` : ''}`)
    }
    const e = d.extra
    if (e && e.balanceCents !== null) {
      let extra = `Extra usage: ${money(e.balanceCents, e.currency)} left`
      if (e.totalCents !== null) extra += ` of ${money(e.totalCents, e.currency)}`
      if (e.monthlyChargeLimitEnabled) extra += ` · monthly cap ${money(e.monthlyChargeLimitCents, e.currency)}, used ${money(e.monthlyUsedCents, e.currency)}`
      lines.push(extra)
    }
  }
  if (state.status === 'error') lines.push(`Warning: last refresh failed (${state.error}): ${state.detail ?? ''}`.trim())
  if (state.endpoint) lines.push(`Endpoint: ${String(state.endpoint).replace(/^https:\/\//, '')}`)
  if (state.fetchedAt) lines.push(`Read at ${new Date(state.fetchedAt).toLocaleTimeString()}`)
  return lines.join('\n')
}

/** Read a human message out of an error body, when it has one. */
function errorMessage(body, status) {
  const message = body?.error?.message
  if (typeof message === 'string' && message.length > 0) return message
  return `HTTP ${status}`
}

/**
 * One GET against the Kimi Code API under a timeout that also covers the
 * body read.
 * @returns the parsed body, or an object describing the failure.
 */
async function getKimi(url, key, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
        // An honest client identifier; Kimi's terms forbid mimicking the CLI.
        'User-Agent': 'dsh-plugin-kimi-usage/0.1',
      },
      signal: controller.signal,
    })
  } catch (error) {
    clearTimeout(timer)
    const aborted = error?.name === 'AbortError'
    return { failure: aborted ? 'timeout' : 'network', detail: aborted ? `No reply within ${timeoutMs} ms.` : String(error?.message ?? error) }
  }

  let body
  try {
    body = await response.json()
  } catch {
    clearTimeout(timer)
    const aborted = controller.signal.aborted
    return {
      failure: aborted ? 'timeout' : 'bad-response',
      status: response.status,
      detail: aborted
        ? `No reply within ${timeoutMs} ms.`
        : `HTTP ${response.status} with a body that is not JSON. The global endpoint (api.kimi.ai) answers some networks with a Cloudflare challenge — switch region to cn or check egress.`,
    }
  }
  clearTimeout(timer)

  if (!response.ok) {
    const detail =
      response.status === 401
        ? `${errorMessage(body, response.status)} A Kimi Platform key (platform.kimi.ai) is not valid here — create the key in the Kimi Code Console (kimi.com/code/console).`
        : errorMessage(body, response.status)
    return { failure: `http-${response.status}`, status: response.status, detail }
  }

  if (!isRecord(body)) {
    return { failure: 'bad-response', status: response.status, detail: 'Reply was not a JSON object.' }
  }
  return { body }
}

/** Clamp a configured millisecond value into a safe range. */
function clampMs(value, fallback, min, max) {
  const n = Number(value)
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/**
 * The prototype marker the Gateway's SRC discovery reads. Frozen, versioned,
 * and shaped exactly like the markers the shipped `TypertRemoteService` base
 * produces — but hand-written, so no build-time codegen is involved.
 */
const REMOTE_METHOD_MARKER = '@deepseek-ai/dsh-typert-protocol/remote-methods'

export function mountKimi(ctx, config = {}) {
  const credentialRef = config.credentialRef ?? DEFAULT_CREDENTIAL_REF
  // Region decides the default base; an explicit baseUrl wins over both.
  const baseUrl =
    typeof config.baseUrl === 'string' && config.baseUrl.length > 0
      ? config.baseUrl.replace(/\/+$/, '')
      : config.region === 'global'
        ? BASE_URL_GLOBAL
        : BASE_URL_CN
  const usageUrl = baseUrl + USAGE_PATH
  // Clamps: a quota endpoint polled at 0 ms hammers Kimi; a timeout of 0 ms
  // aborts every call.
  const refreshMs = clampMs(config.refreshMs, DEFAULT_REFRESH_MS, 30_000, 3_600_000)
  const timeoutMs = clampMs(config.timeoutMs, DEFAULT_TIMEOUT_MS, 5_000, 120_000)
  const showComposerChip = config.showComposerChip ?? true

  const cache = {
    state: {
      status: 'idle',
      fetchedAt: null,
      error: null,
      detail: null,
      endpoint: baseUrl,
      data: null,
      ui: { composerChip: showComposerChip },
    },
    listeners: new Set(),
  }

  function publish(patch) {
    cache.state = { ...cache.state, ...patch }
    for (const listener of cache.listeners) {
      try {
        listener(cache.state)
      } catch {
        // A broken listener must not stop the others, nor the refresh loop.
      }
    }
  }

  /** One refresh at a time: an interval tick and a button press share this. */
  let inFlight = false

  /**
   * Fetch once and publish the outcome.
   *
   * Every failure path publishes `status: 'error'` with a code and a
   * human-readable `detail`. The last good numbers stay in `data`, so the
   * panel can show them next to the error and state how old they are.
   *
   * @returns the current state after the attempt.
   */
  async function refresh() {
    if (inFlight) return cache.state
    inFlight = true
    try {
      publish({ status: 'loading', error: null, detail: null })

      // Step 1 — resolve the credential. Per-call read, never cached.
      let resolved
      try {
        resolved = await ctx.credentials.resolve(credentialRef)
      } catch (error) {
        publish({
          status: 'error',
          error: 'credential-read-failed',
          detail: String(error?.message ?? error),
        })
        return cache.state
      }

      if (!resolved || typeof resolved.value !== 'string' || resolved.value.length === 0) {
        publish({
          status: 'error',
          error: 'missing-credential',
          detail: `No value for ${credentialRef}. Add a Kimi Code API key in Settings → Models, or sign in with Kimi Code.`,
        })
        return cache.state
      }

      // Step 2 — the quota call.
      const reply = await getKimi(usageUrl, resolved.value, timeoutMs)
      if (reply.failure !== undefined) {
        publish({ status: 'error', error: reply.failure, detail: reply.detail })
        return cache.state
      }

      publish({
        status: 'ready',
        error: null,
        detail: null,
        fetchedAt: Date.now(),
        data: fromUsages(reply.body),
      })
      return cache.state
    } finally {
      inFlight = false
    }
  }

  /**
   * The Remote service the browser half calls through `ctx.remote.kimiUsage`.
   *
   * Methods are zero-argument and closure-based (they never read `this`),
   * because the Gateway invokes them with a shadowed `this` bound to a
   * per-call Context.
   */
  class KimiUsageApi {
    /** The current cached state. No Kimi call. */
    async snapshot() {
      return cache.state
    }

    /** Resolve, call Kimi, publish, and return the state. */
    async refresh() {
      return refresh()
    }
  }

  Object.defineProperty(KimiUsageApi.prototype, REMOTE_METHOD_MARKER, {
    configurable: true,
    value: Object.freeze({
      version: 1,
      methods: Object.freeze([
        Object.freeze({ method: 'snapshot', invocation: Object.freeze({ kind: 'direct' }) }),
        Object.freeze({ method: 'refresh', invocation: Object.freeze({ kind: 'direct' }) }),
      ]),
    }),
  })

  const api = new KimiUsageApi()
  api.typertRemote = Object.freeze({
    service: api,
    serviceKey: 'kimiUsage',
    namespace: 'kimiUsage',
  })

  // `ctx.provide`, not `ctx.set`: `set` only overwrites an already-provided
  // service and throws otherwise.
  ctx.provide('kimiUsage', api)

  // The `/usage-kimi` report command. The handler refreshes first, so the
  // report is never a stale read. A failed refresh with no cached data is a
  // command error; with cached data it reports the numbers plus a warning.
  ctx.commands.register({
    definitionId: 'dsh-plugin-kimi-usage/usage-kimi',
    name: 'usage-kimi',
    description: 'Kimi Code subscription quota windows, requests, and extra balance',
    handler: async () => {
      const state = await refresh()
      if (state.status === 'error' && !state.data) {
        return { kind: 'error', text: `Kimi Code usage unavailable: ${state.detail ?? state.error}` }
      }
      return { kind: 'success', text: formatReport(state) }
    },
  })

  // First read shortly after mount, then on an interval. The timer is a Cordis
  // effect, so unloading the plugin clears it.
  ctx.effect(() => {
    let cancelled = false
    const tick = () => {
      if (!cancelled) void refresh()
    }
    const initial = setTimeout(tick, 1_000)
    const interval = setInterval(tick, refreshMs)
    return () => {
      cancelled = true
      clearTimeout(initial)
      clearInterval(interval)
    }
  })
}
