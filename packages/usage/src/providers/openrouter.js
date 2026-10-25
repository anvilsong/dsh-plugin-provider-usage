/**
 * OpenRouter usage plugin — Host half.
 *
 * Responsibilities, in order:
 *   1. Resolve the OpenRouter API key through the credentials service on every
 *      call. The service documents resolution as per-call and never cached, so a
 *      key rotated in Settings → Models reaches the next refresh without a
 *      restart. We must not hold the resolved value across calls.
 *   2. Call OpenRouter and normalize the reply into one flat shape.
 *   3. Publish that shape as a Typert Remote service the browser half calls
 *      through `ctx.remote.openrouterUsage`.
 *
 * The service exposes two zero-argument Remote methods:
 *   - `snapshot`  the current cached state (no OpenRouter call).
 *   - `refresh`   resolve the key, call OpenRouter, publish, return the state.
 *
 * Zero-argument methods need no parameter codecs, so the Gateway's conservative
 * SRC path can resolve them without generated schemas. The return values are
 * plain JSON objects, which is all the wire carries.
 *
 * Two endpoints are supported and they are NOT interchangeable:
 *   - /api/v1/key      works with an ordinary key; per-key scope.
 *   - /api/v1/credits  requires a MANAGEMENT key; account-wide scope.
 * The plugin asks for whichever is configured and reports the refusal verbatim
 * rather than masking it, because "403 management key required" is the answer
 * the operator needs.
 */

import {
  DEFAULT_CREDENTIAL_REF,
  DEFAULT_REFRESH_MS,
  DEFAULT_SHOW_ACCOUNT,
  DEFAULT_TIMEOUT_MS,
  ENDPOINT_CREDITS,
  ENDPOINT_KEY,
} from './openrouter-defaults.js'


/**
 * Normalize a numeric field, tolerating null and undefined.
 * OpenRouter sends `limit: null` for an uncapped key, which is meaningful and
 * must survive as null rather than collapsing to 0.
 */
function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Build the panel state from a /api/v1/key reply.
 *
 * @param data the `data` object of the reply.
 */
function fromKey(data) {
  const usage = num(data.usage)
  const limit = num(data.limit)
  const remaining = num(data.limit_remaining)

  return {
    scope: 'key',
    label: typeof data.label === 'string' ? data.label : null,
    usage,
    usageDaily: num(data.usage_daily),
    usageWeekly: num(data.usage_weekly),
    usageMonthly: num(data.usage_monthly),
    byokUsage: num(data.byok_usage),
    limit,
    remaining,
    limitReset: typeof data.limit_reset === 'string' ? data.limit_reset : null,
    isFreeTier: data.is_free_tier === true,
    isManagementKey: data.is_management_key === true,
    expiresAt: typeof data.expires_at === 'string' ? data.expires_at : null,
    freeModels: data.free_model_daily_requests ?? null,
    totalCredits: null,
    totalUsage: null,
  }
}

/** Build the account section from a /api/v1/credits reply. */
function accountFromCredits(data) {
  const totalCredits = num(data.total_credits)
  const totalUsage = num(data.total_usage)

  // The credits endpoint reports purchased and used totals; the difference is
  // the account-wide remaining balance.
  const remaining =
    totalCredits !== null && totalUsage !== null ? totalCredits - totalUsage : null

  return { totalCredits, totalUsage, remaining }
}

/** Build the flat panel state when the whole panel runs in account scope. */
function fromCredits(data) {
  const a = accountFromCredits(data)
  return {
    scope: 'account',
    label: null,
    usage: a.totalUsage,
    usageDaily: null,
    usageWeekly: null,
    usageMonthly: null,
    byokUsage: null,
    limit: a.totalCredits,
    remaining: a.remaining,
    limitReset: null,
    isFreeTier: false,
    isManagementKey: true,
    expiresAt: null,
    freeModels: null,
    totalCredits: a.totalCredits,
    totalUsage: a.totalUsage,
  }
}

/** Read the `message` out of an OpenRouter error body, when it has one. */
function errorMessage(body, status) {
  const message = body?.error?.message
  if (typeof message === 'string' && message.length > 0) return message
  return `HTTP ${status}`
}

/**
 * One GET against OpenRouter under the shared timeout budget.
 * @returns the parsed body, or an object describing the failure.
 */
async function getOpenRouter(url, key, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
  } catch (error) {
    clearTimeout(timer)
    const aborted = error?.name === 'AbortError'
    return { failure: aborted ? 'timeout' : 'network', detail: aborted ? `No reply within ${timeoutMs} ms.` : String(error?.message ?? error) }
  }

  // Read the body under the same timeout — a hung body must not outlive it.
  let body
  try {
    body = await response.json()
  } catch (error) {
    clearTimeout(timer)
    const aborted = error?.name === 'AbortError'
    return {
      failure: aborted ? 'timeout' : 'bad-response',
      status: response.status,
      detail: aborted ? `No reply within ${timeoutMs} ms.` : `HTTP ${response.status} with a body that is not JSON.`,
    }
  }
  clearTimeout(timer)

  if (!response.ok) {
    return {
      failure: response.status === 403 ? 'management-key-required' : `http-${response.status}`,
      status: response.status,
      detail: errorMessage(body, response.status),
    }
  }

  const data = body?.data
  if (!data || typeof data !== 'object') {
    return { failure: 'bad-response', status: response.status, detail: 'Reply carried no data object.' }
  }
  return { data }
}

/** Clamp a configured millisecond value into a safe range. */
function clampMs(value, fallback, min, max) {
  const n = Number(value)
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** Format a dollar figure for the command report; null becomes an em dash. */
function usd(value) {
  return value === null ? '—' : `$${value.toFixed(2)}`
}

/**
 * Render the `/usage-openrouter` report as plain text. Lines with no data are
 * omitted, so a free-tier key and a limited key read differently.
 */
function formatReport(state) {
  const lines = ['OpenRouter usage']
  const d = state.data
  if (d) {
    const title = d.label ? `Key: ${d.label}` : d.scope === 'account' ? 'Account scope (management key)' : 'Key scope'
    lines.push(title)
    if (d.scope === 'key') {
      lines.push(`Used (lifetime): ${usd(d.usage)}`)
      const meters = []
      if (d.usageDaily !== null) meters.push(`today ${usd(d.usageDaily)}`)
      if (d.usageWeekly !== null) meters.push(`this week ${usd(d.usageWeekly)}`)
      if (d.usageMonthly !== null) meters.push(`this month ${usd(d.usageMonthly)}`)
      if (meters.length > 0) lines.push(`Meters: ${meters.join(' · ')}`)
      if (d.byokUsage !== null && d.byokUsage > 0) lines.push(`BYOK usage: ${usd(d.byokUsage)}`)
      if (d.limit !== null) {
        lines.push(`Key limit: ${usd(d.limit)} · remaining ${usd(d.remaining)}${d.limitReset ? ` · resets ${d.limitReset}` : ''}`)
      }
      if (d.isFreeTier && d.freeModels && typeof d.freeModels === 'object') {
        lines.push(`Free tier: ${d.freeModels.daily_limit ?? '?'} requests/day on :free models`)
      }
    } else {
      lines.push(`Credits purchased: ${usd(d.totalCredits)} · used: ${usd(d.totalUsage)} · remaining: ${usd(d.remaining)}`)
    }
  }
  const a = state.account
  if (a && a.status === 'ready' && a.data) {
    lines.push(`Account: credits ${usd(a.data.totalCredits)} · used ${usd(a.data.totalUsage)} · left ${usd(a.data.remaining)}`)
  } else if (a && a.status === 'error' && a.error === 'management-key-required') {
    lines.push('Account balance: needs a management key (ordinary key refused).')
  }
  if (state.status === 'error') lines.push(`Warning: last refresh failed (${state.error}): ${state.detail ?? ''}`.trim())
  if (state.fetchedAt) lines.push(`Read at ${new Date(state.fetchedAt).toLocaleTimeString()}`)
  return lines.join('\n')
}

/**
 * The prototype marker the Gateway's SRC discovery reads. Frozen, versioned,
 * and shaped exactly like the markers the shipped `TypertRemoteService` base
 * produces — but hand-written, so no build-time codegen is involved.
 */
const REMOTE_METHOD_MARKER = '@deepseek-ai/dsh-typert-protocol/remote-methods'

export function mountOpenRouter(ctx, config = {}) {
  const credentialRef = config.credentialRef ?? DEFAULT_CREDENTIAL_REF
  // Primary scope: `credits` switches the whole panel to the account view.
  const endpoint = config.endpoint === 'credits' ? ENDPOINT_CREDITS : ENDPOINT_KEY
  // `showAccount`: also fetch /api/v1/credits with the SAME key and render the
  // account balance beside the key figures. 403 for an ordinary key renders as
  // a plain note, not an error.
  const showAccount = config.showAccount ?? DEFAULT_SHOW_ACCOUNT
  // Clamps: a billing endpoint polled at 0 ms hammers OpenRouter; a timeout of
  // 0 ms aborts every call. Defaults sit well inside both ranges.
  const refreshMs = clampMs(config.refreshMs, DEFAULT_REFRESH_MS, 30_000, 3_600_000)
  const timeoutMs = clampMs(config.timeoutMs, DEFAULT_TIMEOUT_MS, 5_000, 120_000)

  // `showComposerChip`: whether the browser half renders the compact usage
  // chip below the composer card. It rides the state as `ui.composerChip`,
  // because the row config lives on the Host and the Client never sees it.
  const showComposerChip = config.showComposerChip ?? true

  const cache = {
    state: {
      status: 'idle',
      fetchedAt: null,
      error: null,
      detail: null,
      data: null,
      account: { status: 'unavailable', data: null, error: null, detail: null },
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
   * human-readable `detail`. The last good numbers stay in `data`, so the panel
   * can show them next to the error and state how old they are.
   *
   * The key section and the account section are independent: a refused account
   * call never hides the key figures.
   *
   * @returns the current state after the attempt.
   */
  async function refresh() {
    if (inFlight) return cache.state
    inFlight = true
    try {
      publish({ status: 'loading', error: null, detail: null })

      // Step 1 — resolve the key. Per-call read, never cached.
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
        // The credentials service treats an empty stored value as absent, so this
        // branch covers both "never set" and "set to blank".
        publish({
          status: 'error',
          error: 'missing-credential',
          detail: `No value for ${credentialRef}. Add an OpenRouter API key in Settings → Models.`,
        })
        return cache.state
      }

      // Step 2 — primary call.
      const primary = await getOpenRouter(endpoint, resolved.value, timeoutMs)
      if (primary.failure !== undefined) {
        publish({
          status: 'error',
          error: primary.failure,
          detail: primary.detail,
        })
        return cache.state
      }

      // Step 3 — account call with the SAME key, independent of the primary.
      let account = { status: 'unavailable', data: null, error: null, detail: null }
      if (showAccount && endpoint === ENDPOINT_KEY) {
        const credits = await getOpenRouter(ENDPOINT_CREDITS, resolved.value, timeoutMs)
        if (credits.data !== undefined) {
          account = { status: 'ready', data: accountFromCredits(credits.data), error: null, detail: null }
        } else {
          account = {
            status: 'error',
            data: null,
            // An ordinary key is expected here: the refusal is information,
            // not a fault. The panel renders it as a note.
            error: credits.failure,
            detail: credits.detail,
          }
        }
      }

      publish({
        status: 'ready',
        error: null,
        detail: null,
        fetchedAt: Date.now(),
        data: endpoint === ENDPOINT_CREDITS ? fromCredits(primary.data) : fromKey(primary.data),
        account,
      })
      return cache.state
    } finally {
      inFlight = false
    }
  }

  /**
   * The Remote service the browser half calls through
   * `ctx.remote.openrouterUsage`.
   *
   * Methods are zero-argument and closure-based (they never read `this`),
   * because the Gateway invokes them with a shadowed `this` bound to a
   * per-call Context.
   */
  class OpenRouterUsageApi {
    /** The current cached state. No OpenRouter call. */
    async snapshot() {
      return cache.state
    }

    /** Resolve, call OpenRouter, publish, and return the state. */
    async refresh() {
      return refresh()
    }
  }

  Object.defineProperty(OpenRouterUsageApi.prototype, REMOTE_METHOD_MARKER, {
    configurable: true,
    value: Object.freeze({
      version: 1,
      methods: Object.freeze([
        Object.freeze({ method: 'snapshot', invocation: Object.freeze({ kind: 'direct' }) }),
        Object.freeze({ method: 'refresh', invocation: Object.freeze({ kind: 'direct' }) }),
      ]),
    }),
  })

  const api = new OpenRouterUsageApi()
  // The visible Gateway binding. The Gateway's SRC discovery reads exactly
  // these three fields; the shape mirrors what `TypertRemoteService` produces.
  api.typertRemote = Object.freeze({
    service: api,
    serviceKey: 'openrouterUsage',
    namespace: 'openrouterUsage',
  })

  // `ctx.provide`, not `ctx.set`: `set` only overwrites an already-provided
  // service and throws otherwise. The provide is an effect owned by this
  // plugin's fiber, so unloading the plugin unregisters the service.
  ctx.provide('openrouterUsage', api)

  // The `/usage-openrouter` report command. The handler refreshes first, so
  // the report is never a stale read. A failed refresh with no cached data is
  // a command error; a failed refresh WITH cached data reports the numbers
  // plus a warning line.
  ctx.commands.register({
    definitionId: 'dsh-plugin-openrouter-usage/usage-openrouter',
    name: 'usage-openrouter',
    description: 'OpenRouter credit balance and per-key usage meters',
    handler: async () => {
      const state = await refresh()
      if (state.status === 'error' && !state.data) {
        return { kind: 'error', text: `OpenRouter usage unavailable: ${state.detail ?? state.error}` }
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
