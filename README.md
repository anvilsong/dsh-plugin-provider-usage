# dsh-plugins

Local workspace for our DeepSeek Harness plugins. One repo; every plugin is a
package under `packages/`.

## Packages

| Package | Name | What it does |
|---|---|---|
| [packages/usage](packages/usage) | `dsh-plugin-provider-usage` | Real provider usage for six providers: OpenRouter credits, Kimi Code quota, DeepSeek balance, GLM + MiniMax coding-plan windows, NewAPI token quota. Settings → Models panels, composer chips gated on the active provider, `/usage-*` commands. |

Supersedes the standalone `dsh-plugin-openrouter-usage` and
`dsh-plugin-kimi-usage` projects (kept in `~/projects` for history).

## Layout rule

- Host half: `packages/<name>/src/index.host.js` + optional `src/providers/`.
  Copied to `lib/` verbatim — no build step.
- Client half: `src/client.js`, a single self-contained ModuleLoader bundle
  (the client loader resolves only `react`; relative imports are not bundled).
  Copied to `lib/client.js` verbatim.
- Every package carries `dsh.bundle.patch` + `dsh.client` in its
  `package.json` and a `cordis.patch.yml` with a `- insert:` row.

## Install

The desktop profile links the package directly:

```jsonc
// ~/.dsh/profiles/desktop/package.json
"dependencies": { "dsh-plugin-provider-usage": "link:/Users/macbook/projects/dsh-plugins/packages/usage" },
"dsh": { "profile": { "bundles": [ ..., "dsh-plugin-usage" ] } }
```

After a change: copy `src/` to `lib/`, then reload the page (client-only) or
restart the app (host-side or composition change).
