# dsh-plugins

Workspace for DeepSeek Harness plugins. One repository; every plugin is a
package under `packages/`.

## Preview

Provider usage appears inside configured provider cards and in a composer
chip that follows the active provider.

![Provider usage in Settings → Models](docs/images/models-provider-usage.webp)

| OpenRouter chip | Kimi Code chip |
|---|---|
| ![OpenRouter usage chip](docs/images/composer-openrouter-chip.webp) | ![Kimi Code usage chip](docs/images/composer-kimi-chip.webp) |

## Packages

| Package | Name | What it does |
|---|---|---|
| [packages/usage](packages/usage) | `dsh-plugin-provider-usage` | Real provider usage for six providers: OpenRouter credits, Kimi Code quota, DeepSeek balance, GLM + MiniMax coding-plan windows, NewAPI token quota. Settings → Models panels, composer chips gated on the active provider, `/usage-*` commands. |

## Layout rule

- Host half: `packages/<name>/src/index.host.js` + optional `src/providers/`.
- Client half: `src/client.js`, a single self-contained ModuleLoader bundle
  (the client loader resolves only `react`; relative imports are not bundled).
- Packages ship directly from `src/`; no build or copy step is required.
- Every package carries `dsh.bundle.patch` + `dsh.client` in its
  `package.json` and a `cordis.patch.yml` with a `- insert:` row.

## Install

The desktop profile links the package directly:

```jsonc
// ~/.dsh/profiles/desktop/package.json
"dependencies": { "dsh-plugin-provider-usage": "link:/Users/macbook/projects/dsh-plugins/packages/usage" },
"dsh": { "profile": { "bundles": [ ..., "dsh-plugin-provider-usage" ] } }
```

After a change: reload the page (client-only) or restart the app (host-side
or composition change).
