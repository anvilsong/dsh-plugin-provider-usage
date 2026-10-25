/**
 * Usage plugin — Host half.
 *
 * One plugin, one row in the bundle patch, one fiber. Each provider is an
 * isolated module under `providers/` that mounts its own Remote service,
 * its own `/usage-*` command, and its own poll timer. Isolation rule: one
 * provider's mount failure is logged and skipped — it must never take the
 * other provider down.
 *
 * Config shape (bundle patch):
 *   providers:
 *     openrouter: { enabled, credentialRef, endpoint, showAccount, refreshMs, timeoutMs, showComposerChip }
 *     kimi:       { enabled, credentialRef, region, baseUrl, refreshMs, timeoutMs, showComposerChip }
 *
 * Remote namespaces stay per provider (`openrouterUsage`, `kimiUsage`), and
 * so do the command names (`/usage-openrouter`, `/usage-kimi`): the package
 * merged, the surfaces did not.
 */

import { mountOpenRouter } from './providers/openrouter.js'
import { mountKimi } from './providers/kimi.js'
import { mountDeepSeek } from './providers/deepseek.js'
import { mountZhipu } from './providers/zhipu.js'
import { mountMiniMax } from './providers/minimax.js'
import { mountNewApi } from './providers/newapi.js'

export const name = 'usage'

/**
 * Services this half needs. `credentials` resolves API keys per call;
 * `commands` mounts the report commands. Both ship in dsh-base.
 */
export const inject = ['credentials', 'commands']

export function apply(ctx, config = {}) {
  const providers = config && typeof config === 'object' ? (config.providers ?? {}) : {}

  const mounts = [
    ['openrouter', mountOpenRouter, providers.openrouter ?? {}],
    ['kimi', mountKimi, providers.kimi ?? {}],
    ['deepseek', mountDeepSeek, providers.deepseek ?? {}],
    ['zhipu', mountZhipu, providers.zhipu ?? {}],
    ['minimax', mountMiniMax, providers.minimax ?? {}],
    ['newapi', mountNewApi, providers.newapi ?? {}],
  ]

  for (const [id, mount, cfg] of mounts) {
    if (cfg && cfg.enabled === false) {
      continue
    }
    try {
      mount(ctx, cfg ?? {})
    } catch (error) {
      // A misconfigured provider must not block the sibling, nor the fiber.
      console.error(`usage: provider "${id}" failed to mount:`, error)
    }
  }
}