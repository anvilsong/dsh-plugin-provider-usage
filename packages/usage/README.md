# dsh-plugin-provider-usage

[![npm version](https://img.shields.io/npm/v/dsh-plugin-provider-usage.svg)](https://www.npmjs.com/package/dsh-plugin-provider-usage)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/anvilsong/dsh-plugin-provider-usage/blob/main/packages/usage/LICENSE)

Provider balances and subscription quota inside
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).
One plugin supports OpenRouter, Kimi Code, DeepSeek, GLM Coding Plan,
MiniMax Coding Plan, and NewAPI.

Usage appears inside configured provider cards. A composer chip follows the
active provider. `/usage-*` commands print the same data in a session.
The plugin reads existing DSH credentials; it does not need a separate
account list.

## Screenshots

### Usage inside provider cards

Configured providers show a compact usage summary in **Settings → Models**.
Select **details** to expand the full panel without leaving the provider card.

![Kimi Code and OpenRouter usage inside their provider cards](https://raw.githubusercontent.com/anvilsong/dsh-plugin-provider-usage/main/docs/images/models-provider-usage.webp)

### Composer chips

The chip follows the active provider. Select it to open the usage panel.

| OpenRouter active | Kimi Code active |
|---|---|
| ![OpenRouter composer chip showing key usage and remaining balance](https://raw.githubusercontent.com/anvilsong/dsh-plugin-provider-usage/main/docs/images/composer-openrouter-chip.webp) | ![Kimi Code composer chip showing quota usage](https://raw.githubusercontent.com/anvilsong/dsh-plugin-provider-usage/main/docs/images/composer-kimi-chip.webp) |

## Install

An existing DeepSeek Harness installation is required.

### Desktop app

1. Open **Settings → Plugins → Add plugin**.
2. Choose **Install a third-party plugin**.
3. Enter `dsh-plugin-provider-usage` and install it.
4. Enable the plugin. Restart the app if DSH requests it.

The `desktop` profile is managed by the app. Do not modify its package files
by hand.

### Web or another CLI profile

```sh
dsh plugin --profile web add dsh-plugin-provider-usage@latest
```

Replace `web` with your profile name when needed. Restart `dsh web` and
refresh the page after installation.

### Upgrade or remove

Use the same **Settings → Plugins** page on Desktop. For a CLI profile:

```sh
dsh plugin --profile web update dsh-plugin-provider-usage
dsh plugin --profile web remove dsh-plugin-provider-usage
```

Restart the host and refresh the page after changing the installed version.

## Compatibility and verification

- Verified with DeepSeek Harness Desktop **0.2.1-rc.3** and Cordis **4.0.5**.
- Node.js **22 or newer** is recommended for source development.
- The Web profile uses the same Host and Web APIs, but has not been verified
  separately.
- Older DSH versions are untested. The package declares its Cordis peer range
  so the host can reject an incompatible installation.

Provider verification is reported separately and honestly:

| Provider | Status |
|---|---|
| OpenRouter | Verified live against the real API |
| Kimi Code | Verified live against the real API |
| DeepSeek | Tested against the real reply shape; not yet run with a live key |
| GLM Coding Plan | Tested against the real reply shape; not yet run with a live key |
| MiniMax Coding Plan | Tested against the real reply shape; not yet run with a live key |
| NewAPI | Tested against the real reply shape; needs a self-hosted site |

If a live reply differs from the parser,
[open an issue](https://github.com/anvilsong/dsh-plugin-provider-usage/issues).
Include the `/usage-<provider>` output, but remove all credentials and private
account data first.

## Providers

| Provider | Source | Shows | Command | Chip shows under |
|---|---|---|---|---|
| OpenRouter | `/api/v1/key` + `/api/v1/credits` | credits, key meters (day/week/month), BYOK, limits | `/usage-openrouter` | `openrouter` |
| Kimi Code | `GET {base}/usages` | quota windows, requests, Extra Usage wallet | `/usage-kimi` | `kimi-coding` |
| DeepSeek | `GET {base}/user/balance` | balance per currency (granted / topped up) | `/usage-deepseek` | `deepseek`, `deepseek-official` |
| GLM Coding Plan | `GET {base}/api/monitor/usage/quota/limit` | 5-hour and 7-day windows, tool-call counts, plan level | `/usage-zhipu` | `zai-coding-cn`, `zai` |
| MiniMax Coding Plan | `GET {base}/v1/api/openplatform/coding_plan/remains` | 5-hour and 7-day windows | `/usage-minimax` | `minimax-cn`, `minimax` |
| NewAPI | `GET {baseUrl}/api/usage/token` | token quota as USD (granted / used / remaining) | `/usage-newapi` | none by default — set `gate` in config |

Provider notes:

1. GLM's monitor API takes the raw key in `Authorization`, with no Bearer
   prefix.
2. MiniMax reports remaining percent. The plugin converts it to used percent.
3. NewAPI has no default site. It needs `enabled: true` and `baseUrl`.
4. Kimi uses an honest User-Agent. The plugin does not imitate another CLI.
5. OpenRouter account-wide credits require a management key. Ordinary keys
   still provide per-key usage and limits.

## Credentials and security

| Provider | Default credential reference |
|---|---|
| OpenRouter | `OPENROUTER_API_KEY` |
| Kimi Code | `KIMI_CODING_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| GLM Coding Plan | `ZHIPU_API_KEY` |
| MiniMax Coding Plan | `MINIMAX_API_KEY` |
| NewAPI | `NEWAPI_API_KEY` |

Configure model-provider keys in **Settings → Models**. The plugin also reads
credentials that the DSH credentials service resolves from its credential
store or environment.

Security properties:

1. The Host resolves a key only when it makes a request.
2. Raw keys stay in the Host process. Remote snapshots contain usage data,
   not credentials.
3. Keys go only to the configured provider endpoint. A custom `baseUrl`
   changes that destination, so use a site you trust.
4. Usage snapshots stay in memory. The plugin writes no usage history,
   account list, analytics, or telemetry to disk.

## Surfaces

| Surface | Behavior |
|---|---|
| Settings → Models provider card | A compact usage line inside each provider's own card; click expands the full panel. Renders only when DSH reports the row's key configured |
| Composer chip | Follows the session's active provider; click opens the panel as a popover |
| Commands | `/usage-<provider>` refreshes, then prints a text report |

Provider cards register by settings namespace and then match each row's
provider route. This matters because all pi-ai rows share one settings
namespace. GLM covers `zai-coding-cn` and `zai`; MiniMax covers `minimax-cn`
and `minimax`.

Each chip reads the active provider from the shared per-session model
directory. A blank session resolves the catalog default. An unknown provider
hides the chip. The Host config can override a provider's `gate` list. This is
how a config-only provider such as NewAPI gets a chip and a card.

## Configuration

The defaults are enough for the five public providers. NewAPI is disabled
until you configure its site.

To change defaults, override the included plugin row in
`~/.dsh/profiles/<profile>/cordis.patch.yml`:

```yaml
- id: include:usage
  name: dsh-plugin-provider-usage
  config:
    providers:
      openrouter:
        enabled: true
        credentialRef: OPENROUTER_API_KEY
        showAccount: true
        showComposerChip: true
      kimi:
        enabled: true
        credentialRef: KIMI_CODING_API_KEY
        region: cn
        refreshMs: 120000
        timeoutMs: 15000
        showComposerChip: true
      deepseek:
        enabled: true
        credentialRef: DEEPSEEK_API_KEY
        showComposerChip: true
      zhipu:
        enabled: true
        credentialRef: ZHIPU_API_KEY
        region: cn
        showComposerChip: true
      minimax:
        enabled: true
        credentialRef: MINIMAX_API_KEY
        region: cn
        showComposerChip: true
      newapi:
        enabled: false
        credentialRef: NEWAPI_API_KEY
        # baseUrl: https://your-newapi-host.example
        # gate: ['your-provider-route-id']
```

**Config is replaced as a whole.** Restate every provider section you want to
keep. Do not add a second `- insert:` row for this plugin.

To enable NewAPI, change its section to `enabled: true`, set `baseUrl`, and
make `NEWAPI_API_KEY` available to the DSH credentials service. Set `gate` to
the model-provider route that should show its chip and card.

| Option | Default | Meaning |
|---|---|---|
| `enabled` | `true`; NewAPI `false` | Mount or skip one provider without affecting the others |
| `credentialRef` | provider-specific | Credential reference resolved by DSH |
| `showComposerChip` | `true` | Show or hide the composer chip |
| `refreshMs` | `120000` | Poll interval; clamped to 30 seconds–1 hour |
| `timeoutMs` | `15000` | Request timeout; clamped to 5–120 seconds |
| `gate` | provider-specific | Provider route ids that show the chip and card |
| `region` | `cn` | `cn` or `global` for Kimi, GLM, and MiniMax |
| `baseUrl` | provider default | API base override; required for NewAPI |
| `endpoint` | `key` | OpenRouter primary endpoint: `key` or `credits` |
| `showAccount` | `true` | Also request OpenRouter account-wide credits |

One provider's mount or request failure does not disable its siblings.
A failed refresh keeps the last good data and reports the error.

## Troubleshooting

- **No usage line on a provider card:** DSH must report that row's key as
  configured. NewAPI also needs a `gate` matching an existing provider route.
- **Kimi returns HTTP 401:** use a Kimi Code Console key, not a Kimi Platform
  key. Check the configured region as well.
- **A command reports an error:** the report includes the credential,
  timeout, network, HTTP, or response-shape failure. Use that text when
  opening an issue.
- **The UI did not change after configuration:** restart the Host, then
  reload the Web page.

## Development

The package is plain JavaScript ESM. It has no build step and no bundled
runtime dependencies.

```sh
git clone https://github.com/anvilsong/dsh-plugin-provider-usage.git
cd dsh-plugin-provider-usage

node --check packages/usage/src/index.host.js
node --check packages/usage/src/client.js

# Link the working copy into a development profile:
dsh plugin --profile web add "$PWD/packages/usage"
```

Reload the page after a client-only change. Restart the Host after a Host or
composition change. Run `npm pack --dry-run` from `packages/usage` before a
release to inspect the published file list.

## License

[MIT](https://github.com/anvilsong/dsh-plugin-provider-usage/blob/main/packages/usage/LICENSE)
