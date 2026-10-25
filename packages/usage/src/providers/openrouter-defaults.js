/**
 * Shared defaults and the OpenRouter endpoint contract.
 *
 * Both halves import from here so the Host and the Client cannot drift.
 */

/** The credential reference this plugin resolves by default. */
export const DEFAULT_CREDENTIAL_REF = 'OPENROUTER_API_KEY'

/** Ordinary key. Reports per-key usage, limits and remaining budget. */
export const ENDPOINT_KEY = 'https://openrouter.ai/api/v1/key'

/**
 * Management key only. Reports account-wide credits purchased and used.
 * OpenRouter refuses this call for an ordinary key with HTTP 403.
 */
export const ENDPOINT_CREDITS = 'https://openrouter.ai/api/v1/credits'

/**
 * Whether the second, account-wide call runs on every refresh.
 * The account call uses the SAME credential; it succeeds only for a
 * management key and is refused with HTTP 403 otherwise.
 */
export const DEFAULT_SHOW_ACCOUNT = true

/** Default refresh period, in milliseconds. */
export const DEFAULT_REFRESH_MS = 120_000

/** Request timeout, in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 15_000
