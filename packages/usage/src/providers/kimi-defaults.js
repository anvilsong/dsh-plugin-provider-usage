/**
 * Shared defaults and the Kimi Code usage endpoint contract.
 *
 * Both halves import from here so the Host and the Client cannot drift.
 */

/** The credential reference this plugin resolves by default. */
export const DEFAULT_CREDENTIAL_REF = 'KIMI_CODING_API_KEY'

/**
 * Kimi Code API base per region. The CLI's region file decides which one a
 * subscription lives on; the quota endpoint is the same path on both.
 */
export const BASE_URL_CN = 'https://api.kimi.com/coding/v1'
export const BASE_URL_GLOBAL = 'https://api.kimi.ai/coding/v1'

/**
 * Quota and Extra Usage (booster wallet) figures.
 * Answers 401 for a Kimi Platform key (api.moonshot.ai) — that is a different
 * product with a different wallet.
 */
export const USAGE_PATH = '/usages'

/**
 * Extra Usage amounts arrive as fixed-point micro-cents:
 * divide by this to get cents. Mirrors the CLI's own parser.
 */
export const FIXED_POINT_CENTS = 1_000_000

/** Default refresh period, in milliseconds. */
export const DEFAULT_REFRESH_MS = 120_000

/** Request timeout, in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 15_000
