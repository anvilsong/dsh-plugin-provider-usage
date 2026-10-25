# dsh-plugin-provider-usage

Real provider usage for DeepSeek Harness, in one plugin. Six providers;
each is an isolated module that mounts its own Remote service, its own
`/usage-*` command, and its own poll timer.

## Verification status

Honest list, per provider:

| Provider | Status |
|---|---|
| OpenRouter | Verified live against the real API |
| Kimi Code | Verified live against the real API |
| DeepSeek | Tested against the real reply shape; not yet run with a live key |
| GLM Coding Plan | Tested against the real reply shape; not yet run with a live key |
| MiniMax Coding Plan | Tested against the real reply shape; not yet run with a live key |
| NewAPI | Tested against the real reply shape; needs a self-hosted site |

If a live read disagrees with the parser for your account, open an issue with
the `/usage-<provider>` output.

## Providers

| Provider | Source | Shows | Command | Chip shows under |
|---|---|---|---|---|
| OpenRouter | `/api/v1/key` + `/api/v1/credits` | credits, key meters (day/week/month), BYOK, limits | `/usage-openrouter` | `openrouter` |
| Kimi Code | `GET {base}/usages` | quota windows, requests, Extra Usage wallet | `/usage-kimi` | `kimi-coding` |
| DeepSeek | `GET {base}/user/balance` | balance per currency (granted / topped up) | `/usage-deepseek` | `deepseek` |
| GLM Coding Plan | `GET {base}/api/monitor/usage/quota/limit` | 5-hour and 7-day windows, tool-call counts, plan level | `/usage-zhipu` | `zai-coding-cn`, `zai` |
| MiniMax Coding Plan | `GET {base}/v1/api/openplatform/coding_plan/remains` | 5-hour and 7-day windows | `/usage-minimax` | `minimax-cn`, `minimax` |
| NewAPI | `GET {baseUrl}/api/usage/token` | token quota as USD (granted / used / remaining) | `/usage-newapi` | none by default — set `gate` in config |

Design notes:

1. GLM's monitor API takes the RAW key in `Authorization` — no Bearer prefix.
2. MiniMax reports REMAINING percent; the plugin converts to used percent.
3. NewAPI is config-only: no default site, disabled until `baseUrl` is set.
4. Kimi gets an honest User-Agent; the terms forbid CLI mimicry.

## Surfaces

| Surface | Behavior |
|---|---|
| Settings → Models provider card | A compact usage line inside each provider's own card; click expands the full panel. Renders ONLY when the owner reports the row's key configured (`keyConfigured`) |
| Composer chip | Gated on the session's active provider; click opens the panel as a popover |
| Commands | `/usage-<provider>` refreshes, then prints a text report |

## Provider gating

The provider-card line registers one occupant per catalog route the
provider covers (GLM: `zai-coding-cn` and `zai`), keyed on the slot's
`entryKey = settingsNs`. Each chip reads the session's active provider from
the shared per-session model directory (`ctx.modelDirectories`, lazy
`ctx.get` — never injected). A blank session resolves the catalog default,
so the chip matches the model the composer trigger shows. Unknown selection
hides the chip. The Host config can override the gate list per provider
(`gate: [...]`), which is how a config-only provider like NewAPI gets a
chip — and a card.

## Config

```yaml
- insert:
    - id: usage
      name: dsh-plugin-provider-usage
      config:
        providers:
          openrouter: { enabled: true, credentialRef: OPENROUTER_API_KEY, showComposerChip: true }
          kimi:       { enabled: true, credentialRef: KIMI_CODING_API_KEY, region: cn }
          deepseek:   { enabled: true, credentialRef: DEEPSEEK_API_KEY }
          zhipu:      { enabled: true, credentialRef: ZHIPU_API_KEY, region: cn }   # cn | global
          minimax:    { enabled: true, credentialRef: MINIMAX_API_KEY, region: cn } # cn | global
          newapi:     { enabled: false }  # set baseUrl (and optionally gate) to enable
```

1. `enabled: false` unmounts one provider without touching the others.
2. One provider's mount failure is logged and skipped — the siblings stay up.
3. A provider without a credential shows a "not configured" panel, not an
   error storm. Add the key in Settings → Models (or the credentials file)
   under the listed ref.
