/**
 * Usage plugin — browser half. One client module, two providers.
 *
 * Providers: OpenRouter (credits + key meters) and Kimi Code (subscription
 * quota + Extra Usage wallet). Each provider owns:
 *   - one Typert Remote namespace (`openrouterUsage` / `kimiUsage`),
 *   - one store, one poll loop, one Settings → Models footer panel,
 *   - one composer chip, gated on the session's active provider.
 *
 * Built as an installed Client module: a CommonJS-wrapped bundle registered
 * through `window.__ModuleLoader__`. React arrives through `require("react")`;
 * the client sandbox denies network, so all HTTP happens in the Host half.
 */

window.__ModuleLoader__.load({
  id: 'dsh-plugin-provider-usage',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')

    const CARD_SLOT = 'settings.models.provider-card'
    const CHIP_SLOT = 'conversation.composer.dock'
    const POLL_MS = 5_000
    const MOUNT_RETRY_MS = 250
    const MOUNT_GRACE_MS = 10_000

    /**
     * One store per provider: ONE poll loop feeds every surface of that
     * provider (the Settings → Models panel and the composer chip), so adding
     * a surface never adds provider traffic. `state` holds the unwrapped Host
     * state, or the `{ok:false, error}` envelope when the Remote call failed.
     */
    function makeStore() {
      return {
        state: null,
        waiting: false,

        listeners: new Set(),
        set(next) {
          this.state = next
          for (const fn of this.listeners) {
            try {
              fn(next)
            } catch {
              // A broken subscriber must not break the others.
            }
          }
        },
        subscribe(fn) {
          this.listeners.add(fn)
          if (this.state !== null) fn(this.state)
          return () => this.listeners.delete(fn)
        },
      }
    }

    const orStore = makeStore()
    const kimiStore = makeStore()

    const CSS = [
      // ---- OpenRouter (orup-) ----
      '.orup-root{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;',
      'background:var(--dsw-alias-bg-layer-1);padding:12px 14px;margin-top:12px;',
      'font-size:13px;color:var(--dsw-alias-label-primary)}',
      '.orup-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}',
      '.orup-title{font-weight:600}',
      '.orup-scope{font-size:11px;color:var(--dsw-alias-label-secondary);',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:1px 7px}',
      '.orup-spacer{flex:1}',
      '.orup-btn{font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);',
      'background:transparent;border:1px solid var(--dsw-alias-border-l1);',
      'border-radius:6px;padding:2px 9px;cursor:pointer}',
      '.orup-btn:hover{border-color:var(--dsw-alias-border-l2)}',
      '.orup-btn:disabled{opacity:.5;cursor:default}',
      '.orup-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));',
      'gap:10px 14px}',
      '.orup-label{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.orup-value{font-variant-numeric:tabular-nums;font-weight:600}',
      '.orup-bar{height:4px;border-radius:2px;background:var(--dsw-alias-border-l1);',
      'margin-top:10px;overflow:hidden}',
      '.orup-bar>i{display:block;height:100%}',
      '.orup-msg{color:var(--dsw-alias-label-secondary);line-height:1.5}',
      '.orup-err{color:var(--dsw-alias-state-error-primary);line-height:1.5;',
      'white-space:pre-wrap}',
      '.orup-code{font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:4px}',
      '.orup-ok{color:var(--dsw-alias-state-success-primary)}',
      '.orup-warn{color:var(--dsw-alias-state-warn-primary)}',
      '.orup-bad{color:var(--dsw-alias-state-error-primary)}',
      '.orup-chipwrap{position:relative;display:inline-flex}',
      '.orup-chip{font:inherit;font-size:12px;display:inline-flex;align-items:center;gap:6px;',
      'color:var(--dsw-alias-label-secondary);background:transparent;',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:999px;',
      'padding:2px 10px;cursor:pointer;white-space:nowrap}',
      '.orup-chip:hover{border-color:var(--dsw-alias-border-l2);',
      'color:var(--dsw-alias-label-primary)}',
      '.orup-chip b{font-weight:600;font-variant-numeric:tabular-nums;',
      'color:var(--dsw-alias-label-primary)}',
      '.orup-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-border-l2)}',
      '.orup-dot.orup-ok{background:var(--dsw-alias-state-success-primary)}',
      '.orup-dot.orup-warn{background:var(--dsw-alias-state-warn-primary)}',
      '.orup-dot.orup-bad{background:var(--dsw-alias-state-error-primary)}',
      '.orup-pop{position:absolute;bottom:calc(100% + 8px);right:0;z-index:60;',
      'min-width:340px;max-width:70vw;box-shadow:0 8px 28px rgba(0,0,0,.35)}',
      '.orup-pop .orup-root{margin-top:0}',
      // ---- Kimi Code (kmup-) ----
      '.kmup-root{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;',
      'background:var(--dsw-alias-bg-layer-1);padding:12px 14px;margin-top:12px;',
      'font-size:13px;color:var(--dsw-alias-label-primary)}',
      '.kmup-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}',
      '.kmup-title{font-weight:600}',
      '.kmup-scope{font-size:11px;color:var(--dsw-alias-label-secondary);',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:1px 7px}',
      '.kmup-spacer{flex:1}',
      '.kmup-btn{font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);',
      'background:transparent;border:1px solid var(--dsw-alias-border-l1);',
      'border-radius:6px;padding:2px 9px;cursor:pointer}',
      '.kmup-btn:hover{border-color:var(--dsw-alias-border-l2)}',
      '.kmup-btn:disabled{opacity:.5;cursor:default}',
      '.kmup-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));',
      'gap:10px 14px}',
      '.kmup-label{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.kmup-value{font-variant-numeric:tabular-nums;font-weight:600}',
      '.kmup-bar{height:4px;border-radius:2px;background:var(--dsw-alias-border-l1);',
      'margin-top:10px;overflow:hidden}',
      '.kmup-bar>i{display:block;height:100%}',
      '.kmup-msg{color:var(--dsw-alias-label-secondary);line-height:1.5}',
      '.kmup-err{color:var(--dsw-alias-state-error-primary);line-height:1.5;',
      'white-space:pre-wrap}',
      '.kmup-code{font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:4px}',
      '.kmup-ok{color:var(--dsw-alias-state-success-primary)}',
      '.kmup-warn{color:var(--dsw-alias-state-warn-primary)}',
      '.kmup-bad{color:var(--dsw-alias-state-error-primary)}',
      '.kmup-chipwrap{position:relative;display:inline-flex}',
      '.kmup-chip{font:inherit;font-size:12px;display:inline-flex;align-items:center;gap:6px;',
      'color:var(--dsw-alias-label-secondary);background:transparent;',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:999px;',
      'padding:2px 10px;cursor:pointer;white-space:nowrap}',
      '.kmup-chip:hover{border-color:var(--dsw-alias-border-l2);',
      'color:var(--dsw-alias-label-primary)}',
      '.kmup-chip b{font-weight:600;font-variant-numeric:tabular-nums;',
      'color:var(--dsw-alias-label-primary)}',
      '.kmup-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-border-l2)}',
      '.kmup-dot.kmup-ok{background:var(--dsw-alias-state-success-primary)}',
      '.kmup-dot.kmup-warn{background:var(--dsw-alias-state-warn-primary)}',
      '.kmup-dot.kmup-bad{background:var(--dsw-alias-state-error-primary)}',
      '.kmup-pop{position:absolute;bottom:calc(100% + 8px);right:0;z-index:60;',
      'min-width:360px;max-width:70vw;box-shadow:0 8px 28px rgba(0,0,0,.35)}',
      '.kmup-pop .kmup-root{margin-top:0}',
      // ---- Generic provider (pup-): DeepSeek, GLM, MiniMax, NewAPI ----
      '.pup-root{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;',
      'background:var(--dsw-alias-bg-layer-1);padding:12px 14px;margin-top:12px;',
      'font-size:13px;color:var(--dsw-alias-label-primary)}',
      '.pup-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}',
      '.pup-title{font-weight:600}',
      '.pup-scope{font-size:11px;color:var(--dsw-alias-label-secondary);',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:1px 7px}',
      '.pup-spacer{flex:1}',
      '.pup-btn{font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);',
      'background:transparent;border:1px solid var(--dsw-alias-border-l1);',
      'border-radius:6px;padding:2px 9px;cursor:pointer}',
      '.pup-btn:hover{border-color:var(--dsw-alias-border-l2)}',
      '.pup-btn:disabled{opacity:.5;cursor:default}',
      '.pup-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));',
      'gap:10px 14px}',
      '.pup-label{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.pup-value{font-variant-numeric:tabular-nums;font-weight:600}',
      '.pup-bar{height:4px;border-radius:2px;background:var(--dsw-alias-border-l1);',
      'margin-top:10px;overflow:hidden}',
      '.pup-bar>i{display:block;height:100%}',
      '.pup-msg{color:var(--dsw-alias-label-secondary);line-height:1.5}',
      '.pup-err{color:var(--dsw-alias-state-error-primary);line-height:1.5;',
      'white-space:pre-wrap}',
      '.pup-code{font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:4px}',
      '.pup-ok{color:var(--dsw-alias-state-success-primary)}',
      '.pup-warn{color:var(--dsw-alias-state-warn-primary)}',
      '.pup-bad{color:var(--dsw-alias-state-error-primary)}',
      '.pup-chipwrap{position:relative;display:inline-flex}',
      '.pup-chip{font:inherit;font-size:12px;display:inline-flex;align-items:center;gap:6px;',
      'color:var(--dsw-alias-label-secondary);background:transparent;',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:999px;',
      'padding:2px 10px;cursor:pointer;white-space:nowrap}',
      '.pup-chip:hover{border-color:var(--dsw-alias-border-l2);',
      'color:var(--dsw-alias-label-primary)}',
      '.pup-chip b{font-weight:600;font-variant-numeric:tabular-nums;',
      'color:var(--dsw-alias-label-primary)}',
      '.pup-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-border-l2)}',
      '.pup-dot.pup-ok{background:var(--dsw-alias-state-success-primary)}',
      '.pup-dot.pup-warn{background:var(--dsw-alias-state-warn-primary)}',
      '.pup-dot.pup-bad{background:var(--dsw-alias-state-error-primary)}',
      '.pup-pop{position:absolute;bottom:calc(100% + 8px);right:0;z-index:60;',
      'min-width:340px;max-width:70vw;box-shadow:0 8px 28px rgba(0,0,0,.35)}',
      '.pup-pop .pup-root{margin-top:0}',
    ].join('')

    // ---------- shared formatters ----------

    /** Format a dollar amount, or an em dash when the field is absent. */
    function usd(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      if (value !== 0 && Math.abs(value) < 0.01) return '$' + value.toFixed(4)
      return '$' + value.toFixed(2)
    }

    /** Cents in a currency as a short string. */
    function centsMoney(cents, currency) {
      if (typeof cents !== 'number' || !Number.isFinite(cents)) return '—'
      const amount = cents / 100
      if (currency === 'CNY' || currency === 'RMB') return '¥' + amount.toFixed(2)
      if (currency === 'USD') return '$' + amount.toFixed(2)
      return amount.toFixed(2) + (currency ? ' ' + currency : '')
    }

    /** A quota ratio as a percent string. */
    function pct(ratio) {
      if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return '—'
      return (ratio * 100).toFixed(ratio > 0 && ratio < 0.001 ? 2 : 1) + '%'
    }

    /** A reset timestamp as a short local string. */
    function when(iso) {
      if (typeof iso !== 'string' || iso.length === 0) return null
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return null
      return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    }

    /**
     * Indicator level for a remaining budget (OpenRouter).
     * Null for an uncapped key, which is not a problem state.
     */
    function budgetLevel(remaining, limit) {
      if (typeof remaining !== 'number' || typeof limit !== 'number' || limit <= 0) return null
      const f = remaining / limit
      if (f <= 0.05) return 'bad'
      if (f <= 0.2) return 'warn'
      return 'ok'
    }

    /** Indicator level for one quota ratio (fraction USED). */
    function quotaLevel(ratio) {
      if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return null
      if (ratio >= 0.95) return 'bad'
      if (ratio >= 0.8) return 'warn'
      return 'ok'
    }

    /** The worst ratio across the Kimi quotas that are present. */
    function worstRatio(quotas) {
      if (!quotas) return null
      let worst = null
      for (const key of ['fiveHour', 'sevenDay', 'monthTotal', 'monthCode']) {
        const q = quotas[key]
        if (q && typeof q.usedRatio === 'number') {
          if (worst === null || q.usedRatio > worst) worst = q.usedRatio
        }
      }
      return worst
    }

    // ---------- shared components / hooks ----------

    /** One label/value metric cell. `px` selects the stylesheet family. */
    function Metric({ px, label, value, cls, sub }) {
      return React.createElement(
        'div',
        null,
        React.createElement('div', { className: `${px}-label` }, label),
        React.createElement('div', { className: `${px}-value` + (cls ? ` ${px}-${cls}` : '') }, value),
        sub ? React.createElement('div', { className: `${px}-label` }, sub) : null,
      )
    }

    /** Subscribe a component to one provider store. */
    function useStore(store) {
      const [state, setState] = React.useState(store.state)
      React.useEffect(() => store.subscribe((next) => setState(next)), [store])
      return state
    }

    /**
     * The provider of the session's active model, read from the shared
     * per-session ModelDirectory (`ctx.modelDirectories`). It resolves the
     * catalog default for a blank session, so the chip matches what the
     * composer model trigger shows. `undefined` = unknown yet (the chip hides
     * until known, so it never shows under the wrong provider).
     *
     * Deliberately NOT an `inject` entry: the service name is internal, and
     * a missing inject leaves the whole client entry pending — fatal at web
     * boot. A lazy `ctx.get` degrades to "chip hidden" instead.
     */
    function useActiveProvider(getDirectory, sessionId) {
      const [provider, setProvider] = React.useState(undefined)
      React.useEffect(() => {
        const dir = sessionId ? getDirectory(sessionId) : undefined
        if (!dir) {
          setProvider(undefined)
          return undefined
        }
        const update = () => {
          const current = dir.getSnapshot().current
          setProvider(current && typeof current.provider === 'string' ? current.provider : null)
        }
        update()
        return dir.subscribe(update)
      }, [sessionId])
      return provider
    }

    /** Shared Refresh-button wiring for one provider panel. */
    function useRefresher(store, getNs) {
      const [busy, setBusy] = React.useState(false)
      const onRefresh = React.useCallback(() => {
        const ns = getNs()
        if (!ns) return
        setBusy(true)
        Promise.resolve()
          .then(() => ns.refresh())
          .then((result) => {
            if (result && typeof result === 'object') {
              store.set(result.ok === true ? result.value : result)
            }
          })
          .catch(() => {})
          .then(() => setBusy(false))
      }, [getNs, store])
      return { busy, onRefresh }
    }

    // ---------- OpenRouter ----------

    function OpenRouterPanel({ store, getNs }) {
      const state = useStore(store)
      const { busy, onRefresh } = useRefresher(store, getNs)

      // A Remote call failure arrives as { ok: false, error: { code, message } }.
      const wireError = state && state.ok === false ? state.error : null
      const s = wireError ? null : state
      const d = s && s.data ? s.data : null
      const scope = d && d.scope === 'account' ? 'account' : 'key'
      const lv = d ? budgetLevel(d.remaining, d.limit) : null
      const status = s ? s.status : 'idle'
      // The account section rides beside the key section; it has its own
      // status so a refused account call never hides the key figures.
      const acct = s && s.account ? s.account : null
      const a = acct && acct.status === 'ready' ? acct.data : null
      const alv = a ? budgetLevel(a.remaining, a.totalCredits) : null

      const rows = []
      if (d) {
        rows.push(
          React.createElement(Metric, {
            px: 'orup', key: 'used',
            label: scope === 'account' ? 'Used (account)' : 'Used (key)',
            value: usd(d.usage),
          }),
          React.createElement(Metric, {
            px: 'orup', key: 'limit',
            label: scope === 'account' ? 'Purchased' : 'Limit',
            value: scope === 'account'
              ? (d.totalCredits === null ? '—' : usd(d.totalCredits))
              : (d.limit === null ? 'uncapped' : usd(d.limit)),
          }),
          React.createElement(Metric, {
            px: 'orup', key: 'remaining',
            label: 'Remaining',
            value: d.remaining === null ? '—' : usd(d.remaining),
            cls: lv,
          }),
        )
        if (d.usageMonthly !== null) {
          rows.push(React.createElement(Metric, { px: 'orup', key: 'month', label: 'This month', value: usd(d.usageMonthly) }))
        }
        if (d.usageDaily !== null) {
          rows.push(React.createElement(Metric, { px: 'orup', key: 'day', label: 'Today', value: usd(d.usageDaily) }))
        }
        if (d.usageWeekly !== null) {
          rows.push(React.createElement(Metric, { px: 'orup', key: 'week', label: 'This week', value: usd(d.usageWeekly) }))
        }
        if (d.byokUsage) {
          rows.push(React.createElement(Metric, { px: 'orup', key: 'byok', label: 'BYOK', value: usd(d.byokUsage) }))
        }
      }

      const note = []
      if (d && d.label) note.push('key ' + d.label)
      if (d && d.isManagementKey) note.push('management key')
      if (d && d.limitReset) note.push('resets ' + d.limitReset)
      if (d && d.freeModels && typeof d.freeModels.remaining === 'number') {
        note.push('free models left today: ' + d.freeModels.remaining)
      }
      if (s && s.fetchedAt) note.push('read ' + new Date(s.fetchedAt).toLocaleTimeString())

      // The account section: balance figures when available, a plain note when
      // the key is ordinary, nothing when the section is switched off.
      const accountBlocks = []
      if (a) {
        accountBlocks.push(
          React.createElement(
            'div',
            { className: 'orup-grid', key: 'account-grid' },
            React.createElement(Metric, {
              px: 'orup', key: 'balance', label: 'Balance (account)',
              value: a.remaining === null ? '—' : usd(a.remaining), cls: alv,
            }),
            React.createElement(Metric, {
              px: 'orup', key: 'purchased', label: 'Purchased',
              value: a.totalCredits === null ? '—' : usd(a.totalCredits),
            }),
            React.createElement(Metric, {
              px: 'orup', key: 'used', label: 'Used (account)',
              value: a.totalUsage === null ? '—' : usd(a.totalUsage),
            }),
          ),
        )
        if (alv) {
          accountBlocks.push(
            React.createElement(
              'div',
              { className: 'orup-bar', key: 'account-bar' },
              React.createElement('i', {
                className: alv === 'bad' ? 'orup-bad' : alv === 'warn' ? 'orup-warn' : 'orup-ok',
                style: {
                  width: Math.max(0, Math.min(100, (a.remaining / a.totalCredits) * 100)) + '%',
                  background: 'currentColor',
                },
              }),
            ),
          )
        }
      } else if (acct && acct.status === 'error') {
        accountBlocks.push(
          React.createElement(
            'div',
            { className: 'orup-msg', key: 'account-note' },
            acct.error === 'management-key-required'
              ? 'Account balance needs a management key. Create one at openrouter.ai/keys and store it as this provider’s key, or leave the key view as-is.'
              : `Account balance unavailable (${acct.error}).`,
          ),
        )
      }

      const children = [
        React.createElement(
          'div',
          { className: 'orup-head', key: 'head' },
          React.createElement('span', { className: 'orup-title' }, 'OpenRouter'),
          React.createElement(
            'span',
            { className: 'orup-scope' },
            scope === 'account' ? 'account-wide' : a ? 'key + account' : 'this key',
          ),
          React.createElement('span', { className: 'orup-spacer' }),
          React.createElement(
            'button',
            {
              className: 'orup-btn', type: 'button', onClick: onRefresh,
              disabled: busy || status === 'loading',
            },
            busy || status === 'loading' ? 'Refreshing…' : 'Refresh',
          ),
        ),
      ]

      if (status === 'idle' && !wireError) {
        children.push(
          React.createElement(
            'div',
            { className: 'orup-msg', key: 'idle' },
            store.waiting
              ? 'The usage host service is not reachable yet. It appears after the Host half activates — try reloading the page, or check that the plugin row is enabled.'
              : 'Not read yet.',
          ),
        )
      }
      if (s && s.status === 'error') {
        children.push(
          React.createElement(
            'div',
            { key: 'err' },
            React.createElement('div', { className: 'orup-err' }, s.detail || 'Read failed.'),
            React.createElement('div', { className: 'orup-code' }, s.error || ''),
          ),
        )
      }
      if (wireError) {
        children.push(
          React.createElement(
            'div',
            { key: 'wire' },
            React.createElement('div', { className: 'orup-err' }, wireError.message || 'The Remote call failed.'),
            React.createElement('div', { className: 'orup-code' }, wireError.code || ''),
          ),
        )
      }
      if (d) {
        children.push(React.createElement('div', { className: 'orup-grid', key: 'grid' }, rows))
        if (lv) {
          children.push(
            React.createElement(
              'div',
              { className: 'orup-bar', key: 'bar' },
              React.createElement('i', {
                className: lv === 'bad' ? 'orup-bad' : lv === 'warn' ? 'orup-warn' : 'orup-ok',
                style: {
                  width: Math.max(0, Math.min(100, (d.remaining / d.limit) * 100)) + '%',
                  background: 'currentColor',
                },
              }),
            ),
          )
        }
        if (note.length) {
          children.push(React.createElement('div', { className: 'orup-code', key: 'note' }, note.join(' · ')))
        }
      }
      if (accountBlocks.length) children.push(...accountBlocks)

      return React.createElement('div', { className: 'orup-root' }, children)
    }

    /**
     * The OpenRouter composer chip: usage and (when available) the account
     * balance, with a colour dot for the budget level. Click opens the panel.
     */
    function OpenRouterChip({ store, getNs }) {
      const state = useStore(store)
      const [open, setOpen] = React.useState(false)

      const wireError = state && state.ok === false ? state.error : null
      const s = wireError ? null : state
      const d = s && s.data ? s.data : null
      const acct = s && s.account ? s.account : null
      const a = acct && acct.status === 'ready' ? acct.data : null

      // Dot colour: the worst of the two levels we can compute.
      const lvk = d ? budgetLevel(d.remaining, d.limit) : null
      const alv = a ? budgetLevel(a.remaining, a.totalCredits) : null
      const dot = lvk === 'bad' || alv === 'bad' ? 'bad' : lvk === 'warn' || alv === 'warn' ? 'warn' : lvk || alv ? 'ok' : ''

      const parts = []
      if (d) parts.push(React.createElement('b', { key: 'used' }, usd(d.usage)))
      if (a && a.remaining !== null) parts.push(React.createElement('b', { key: 'left' }, usd(a.remaining) + ' left'))
      if (!parts.length) parts.push(React.createElement('span', { key: 'empty' }, s && s.status === 'error' ? 'unavailable' : 'usage'))

      return React.createElement(
        'span',
        { className: 'orup-chipwrap' },
        React.createElement(
          'button',
          {
            className: 'orup-chip', type: 'button',
            onClick: () => setOpen((v) => !v),
            title: 'OpenRouter usage',
          },
          React.createElement('span', { className: 'orup-dot' + (dot ? ' orup-' + dot : '') }),
          React.createElement('span', null, 'OpenRouter'),
          ...parts,
          React.createElement('span', { className: 'orup-code' }, wireError ? '!' : s && s.status === 'error' ? '!' : ''),
        ),
        open
          ? React.createElement('div', { className: 'orup-pop' }, React.createElement(OpenRouterPanel, { store, getNs }))
          : null,
      )
    }

    // ---------- Kimi Code ----------

    /** One quota metric, or null when the account does not carry that quota. */
    function quotaMetric(key, label, q) {
      if (!q) return null
      return React.createElement(Metric, {
        px: 'kmup', key, label,
        value: pct(q.usedRatio) + ' used',
        cls: quotaLevel(q.usedRatio),
        sub: q.resetAt ? 'resets ' + (when(q.resetAt) ?? q.resetAt) : null,
      })
    }

    function KimiPanel({ store, getNs }) {
      const state = useStore(store)
      const { busy, onRefresh } = useRefresher(store, getNs)

      const wireError = state && state.ok === false ? state.error : null
      const s = wireError ? null : state
      const d = s && s.data ? s.data : null
      const status = s ? s.status : 'idle'
      const worst = d ? worstRatio(d.quotas) : null
      const wlv = worst !== null ? quotaLevel(worst) : null

      const rows = []
      if (d) {
        const q = d.quotas || {}
        for (const [key, label] of [
          ['fiveHour', '5-hour window'],
          ['sevenDay', '7-day window'],
          ['monthTotal', 'Monthly (all)'],
          ['monthCode', 'Monthly (code)'],
        ]) {
          const m = quotaMetric(key, label, q[key])
          if (m) rows.push(m)
        }
        if (d.requests) {
          rows.push(
            React.createElement(Metric, {
              px: 'kmup', key: 'requests', label: 'Requests',
              value:
                d.requests.used !== null && d.requests.limit !== null
                  ? `${d.requests.used} / ${d.requests.limit}`
                  : '—',
              sub: d.requests.resetAt ? 'resets ' + (when(d.requests.resetAt) ?? d.requests.resetAt) : null,
            }),
          )
        }
      }

      const note = []
      if (s && s.endpoint) note.push(s.endpoint.replace(/^https:\/\//, ''))
      if (s && s.fetchedAt) note.push('read ' + new Date(s.fetchedAt).toLocaleTimeString())

      // Extra Usage (booster wallet): only when the account has one.
      const extraBlocks = []
      const extra = d && d.extra ? d.extra : null
      if (extra) {
        extraBlocks.push(
          React.createElement(
            'div',
            { className: 'kmup-grid', key: 'extra-grid' },
            React.createElement(Metric, {
              px: 'kmup', key: 'balance', label: 'Extra Usage balance',
              value: centsMoney(extra.balanceCents, extra.currency),
              cls:
                extra.totalCents > 0 && extra.balanceCents / extra.totalCents <= 0.05
                  ? 'bad'
                  : extra.totalCents > 0 && extra.balanceCents / extra.totalCents <= 0.2
                    ? 'warn'
                    : 'ok',
            }),
            React.createElement(Metric, {
              px: 'kmup', key: 'topped', label: 'Topped up',
              value: centsMoney(extra.totalCents, extra.currency),
            }),
            extra.monthlyChargeLimitEnabled
              ? React.createElement(Metric, {
                  px: 'kmup', key: 'cap', label: 'Monthly cap',
                  value: centsMoney(extra.monthlyUsedCents, extra.currency) + ' / ' + centsMoney(extra.monthlyChargeLimitCents, extra.currency),
                })
              : null,
          ),
        )
      }

      const children = [
        React.createElement(
          'div',
          { className: 'kmup-head', key: 'head' },
          React.createElement('span', { className: 'kmup-title' }, 'Kimi Code'),
          React.createElement('span', { className: 'kmup-scope' }, 'subscription quota'),
          React.createElement('span', { className: 'kmup-spacer' }),
          React.createElement(
            'button',
            {
              className: 'kmup-btn', type: 'button', onClick: onRefresh,
              disabled: busy || status === 'loading',
            },
            busy || status === 'loading' ? 'Refreshing…' : 'Refresh',
          ),
        ),
      ]

      if (status === 'idle' && !wireError) {
        children.push(
          React.createElement(
            'div',
            { className: 'kmup-msg', key: 'idle' },
            store.waiting
              ? 'The usage host service is not reachable yet. It appears after the Host half activates — try reloading the page, or check that the plugin row is enabled.'
              : 'Not read yet.',
          ),
        )
      }
      if (s && s.status === 'error') {
        children.push(
          React.createElement(
            'div',
            { key: 'err' },
            React.createElement('div', { className: 'kmup-err' }, s.detail || 'Read failed.'),
            React.createElement('div', { className: 'kmup-code' }, s.error || ''),
          ),
        )
      }
      if (wireError) {
        children.push(
          React.createElement(
            'div',
            { key: 'wire' },
            React.createElement('div', { className: 'kmup-err' }, wireError.message || 'The Remote call failed.'),
            React.createElement('div', { className: 'kmup-code' }, wireError.code || ''),
          ),
        )
      }
      if (d && rows.length) {
        children.push(React.createElement('div', { className: 'kmup-grid', key: 'grid' }, rows))
        if (wlv) {
          children.push(
            React.createElement(
              'div',
              { className: 'kmup-bar', key: 'bar' },
              React.createElement('i', {
                className: wlv === 'bad' ? 'kmup-bad' : wlv === 'warn' ? 'kmup-warn' : 'kmup-ok',
                style: { width: Math.max(0, Math.min(100, worst * 100)) + '%', background: 'currentColor' },
              }),
            ),
          )
        }
        if (note.length) {
          children.push(React.createElement('div', { className: 'kmup-code', key: 'note' }, note.join(' · ')))
        }
      }
      if (extraBlocks.length) children.push(...extraBlocks)

      return React.createElement('div', { className: 'kmup-root' }, children)
    }

    /**
     * The Kimi Code composer chip: the worst quota percentage and, when
     * present, the Extra Usage balance, with a colour dot. Click opens the
     * panel in a popover.
     */
    function KimiChip({ store, getNs }) {
      const state = useStore(store)
      const [open, setOpen] = React.useState(false)

      const wireError = state && state.ok === false ? state.error : null
      const s = wireError ? null : state
      const d = s && s.data ? s.data : null

      const worst = d ? worstRatio(d.quotas) : null
      const wlv = worst !== null ? quotaLevel(worst) : null
      const extra = d && d.extra ? d.extra : null
      const elv =
        extra && extra.totalCents > 0
          ? extra.balanceCents / extra.totalCents <= 0.05
            ? 'bad'
            : extra.balanceCents / extra.totalCents <= 0.2
              ? 'warn'
              : 'ok'
          : null
      const dot = wlv === 'bad' || elv === 'bad' ? 'bad' : wlv === 'warn' || elv === 'warn' ? 'warn' : wlv || elv ? 'ok' : ''

      const parts = []
      if (worst !== null) parts.push(React.createElement('b', { key: 'q' }, pct(worst)))
      if (extra) parts.push(React.createElement('b', { key: 'x' }, centsMoney(extra.balanceCents, extra.currency) + ' extra'))
      if (!parts.length) {
        parts.push(React.createElement('span', { key: 'empty' }, s && s.status === 'error' ? 'unavailable' : 'usage'))
      }

      return React.createElement(
        'span',
        { className: 'kmup-chipwrap' },
        React.createElement(
          'button',
          {
            className: 'kmup-chip', type: 'button',
            onClick: () => setOpen((v) => !v),
            title: 'Kimi Code usage',
          },
          React.createElement('span', { className: 'kmup-dot' + (dot ? ' kmup-' + dot : '') }),
          React.createElement('span', null, 'Kimi Code'),
          ...parts,
          React.createElement('span', { className: 'kmup-code' }, wireError ? '!' : s && s.status === 'error' ? '!' : ''),
        ),
        open ? React.createElement('div', { className: 'kmup-pop' }, React.createElement(KimiPanel, { store, getNs })) : null,
      )
    }

    // ---------- generic providers (pup-) ----------

    /** The worst used-ratio across a quota provider's windows. */
    function worstWindow(windows) {
      let worst = null
      for (const w of windows ?? []) {
        if (w && typeof w.usedRatio === 'number') {
          if (worst === null || w.usedRatio > worst) worst = w.usedRatio
        }
      }
      return worst
    }

    /** Amount in a currency code: $ for USD, ¥ for CNY, else suffix. */
    function fiat(amount, currency) {
      if (typeof amount !== 'number' || !Number.isFinite(amount)) return '—'
      if (currency === 'USD') return '$' + amount.toFixed(2)
      if (currency === 'CNY' || currency === 'RMB') return '¥' + amount.toFixed(2)
      return amount.toFixed(2) + (currency ? ' ' + currency : '')
    }

    /**
     * Generic quota panel (GLM, MiniMax): window metrics with reset times,
     * an optional plan-level pill, and GLM's per-tool call breakdown.
     */
    function QuotaPanel({ store, getNs, title }) {
      const state = useStore(store)
      const { busy, onRefresh } = useRefresher(store, getNs)

      const wireError = state && state.ok === false ? state.error : null
      const s = wireError ? null : state
      const d = s && s.data ? s.data : null
      const status = s ? s.status : 'idle'
      const worst = d ? worstWindow(d.windows) : null
      const wlv = worst !== null ? quotaLevel(worst) : null

      const rows = []
      if (d) {
        for (const w of d.windows ?? []) {
          rows.push(React.createElement(Metric, {
            px: 'pup', key: w.key ?? w.label, label: w.label,
            value: pct(w.usedRatio) + ' used',
            cls: quotaLevel(w.usedRatio),
            sub: w.resetAt ? 'resets ' + (when(w.resetAt) ?? w.resetAt) : null,
          }))
        }
        const p = d.prompts
        if (p) {
          rows.push(React.createElement(Metric, {
            px: 'pup', key: 'prompts', label: 'Tool calls',
            value: p.usedRatio !== null ? pct(p.usedRatio) + ' used' : (p.remaining !== null && p.limit !== null ? `${p.limit - p.remaining} / ${p.limit}` : '—'),
            cls: quotaLevel(p.usedRatio),
            sub: p.resetAt ? 'resets ' + (when(p.resetAt) ?? p.resetAt) : null,
          }))
        }
      }

      const note = []
      if (d && d.level) note.push('plan ' + d.level)
      if (s && s.endpoint) note.push(s.endpoint.replace(/^https:\/\//, ''))
      if (s && s.fetchedAt) note.push('read ' + new Date(s.fetchedAt).toLocaleTimeString())

      // GLM's per-tool call counts, when the plan reports them.
      const detailBlocks = []
      const details = d && d.prompts && Array.isArray(d.prompts.details) ? d.prompts.details : []
      if (details.length > 0) {
        detailBlocks.push(
          React.createElement(
            'div',
            { className: 'pup-code', key: 'details' },
            details.slice(0, 8).map((x) => `${x.model}: ${x.usage}`).join(' · '),
          ),
        )
      }

      const children = [
        React.createElement(
          'div',
          { className: 'pup-head', key: 'head' },
          React.createElement('span', { className: 'pup-title' }, title),
          React.createElement('span', { className: 'pup-scope' }, 'subscription quota'),
          React.createElement('span', { className: 'pup-spacer' }),
          React.createElement(
            'button',
            { className: 'pup-btn', type: 'button', onClick: onRefresh, disabled: busy || status === 'loading' },
            busy || status === 'loading' ? 'Refreshing…' : 'Refresh',
          ),
        ),
      ]
      if (status === 'idle' && !wireError) {
        children.push(
          React.createElement(
            'div', { className: 'pup-msg', key: 'idle' },
            store.waiting
              ? 'The usage host service is not reachable yet. It appears after the Host half activates — try reloading the page, or check that the plugin row is enabled.'
              : 'Not read yet.',
          ),
        )
      }
      if (s && s.status === 'error') {
        children.push(
          React.createElement(
            'div', { key: 'err' },
            React.createElement('div', { className: 'pup-err' }, s.detail || 'Read failed.'),
            React.createElement('div', { className: 'pup-code' }, s.error || ''),
          ),
        )
      }
      if (wireError) {
        children.push(
          React.createElement(
            'div', { key: 'wire' },
            React.createElement('div', { className: 'pup-err' }, wireError.message || 'The Remote call failed.'),
            React.createElement('div', { className: 'pup-code' }, wireError.code || ''),
          ),
        )
      }
      if (d && rows.length) {
        children.push(React.createElement('div', { className: 'pup-grid', key: 'grid' }, rows))
        if (wlv) {
          children.push(
            React.createElement(
              'div', { className: 'pup-bar', key: 'bar' },
              React.createElement('i', {
                className: wlv === 'bad' ? 'pup-bad' : wlv === 'warn' ? 'pup-warn' : 'pup-ok',
                style: { width: Math.max(0, Math.min(100, worst * 100)) + '%', background: 'currentColor' },
              }),
            ),
          )
        }
        if (note.length) children.push(React.createElement('div', { className: 'pup-code', key: 'note' }, note.join(' · ')))
      }
      if (detailBlocks.length) children.push(...detailBlocks)

      return React.createElement('div', { className: 'pup-root' }, children)
    }

    /**
     * Generic balance panel (DeepSeek, NewAPI): one row of metrics per
     * balance entry, or the granted/used/remaining triple.
     */
    function BalancePanel({ store, getNs, title }) {
      const state = useStore(store)
      const { busy, onRefresh } = useRefresher(store, getNs)

      const wireError = state && state.ok === false ? state.error : null
      const s = wireError ? null : state
      const d = s && s.data ? s.data : null
      const status = s ? s.status : 'idle'

      const rows = []
      if (d && Array.isArray(d.balances)) {
        // DeepSeek shape: per-currency totals with granted/topped-up split.
        for (const b of d.balances) {
          rows.push(React.createElement(Metric, {
            px: 'pup', key: b.currency, label: `Balance (${b.currency})`,
            value: fiat(b.total, b.currency),
            cls: b.total !== null && b.total <= 0 ? 'bad' : b.total !== null && b.total <= 1 ? 'warn' : 'ok',
            sub: b.toppedUp !== null && b.granted !== null && b.granted !== 0
              ? `topped up ${fiat(b.toppedUp, b.currency)} · granted ${fiat(b.granted, b.currency)}`
              : null,
          }))
        }
      } else if (d && d.kind === 'balance') {
        // NewAPI shape: granted/used/remaining in one currency.
        rows.push(
          React.createElement(Metric, { px: 'pup', key: 'granted', label: 'Granted', value: fiat(d.total, d.currency) }),
          React.createElement(Metric, { px: 'pup', key: 'used', label: 'Used', value: fiat(d.used, d.currency) }),
          React.createElement(Metric, {
            px: 'pup', key: 'remaining', label: 'Remaining', value: fiat(d.remaining, d.currency),
            cls: budgetLevel(d.remaining, d.total),
          }),
        )
      }

      const note = []
      if (d && d.isAvailable === false) note.push('balance exhausted — the API refuses calls')
      if (s && s.endpoint) note.push(s.endpoint.replace(/^https:\/\//, ''))
      if (s && s.fetchedAt) note.push('read ' + new Date(s.fetchedAt).toLocaleTimeString())

      const children = [
        React.createElement(
          'div',
          { className: 'pup-head', key: 'head' },
          React.createElement('span', { className: 'pup-title' }, title),
          React.createElement('span', { className: 'pup-scope' }, 'balance'),
          React.createElement('span', { className: 'pup-spacer' }),
          React.createElement(
            'button',
            { className: 'pup-btn', type: 'button', onClick: onRefresh, disabled: busy || status === 'loading' },
            busy || status === 'loading' ? 'Refreshing…' : 'Refresh',
          ),
        ),
      ]
      if (status === 'idle' && !wireError) {
        children.push(
          React.createElement(
            'div', { className: 'pup-msg', key: 'idle' },
            store.waiting
              ? 'The usage host service is not reachable yet. It appears after the Host half activates — try reloading the page, or check that the plugin row is enabled.'
              : 'Not read yet.',
          ),
        )
      }
      if (s && s.status === 'error') {
        children.push(
          React.createElement(
            'div', { key: 'err' },
            React.createElement('div', { className: 'pup-err' }, s.detail || 'Read failed.'),
            React.createElement('div', { className: 'pup-code' }, s.error || ''),
          ),
        )
      }
      if (wireError) {
        children.push(
          React.createElement(
            'div', { key: 'wire' },
            React.createElement('div', { className: 'pup-err' }, wireError.message || 'The Remote call failed.'),
            React.createElement('div', { className: 'pup-code' }, wireError.code || ''),
          ),
        )
      }
      if (d && rows.length) {
        children.push(React.createElement('div', { className: 'pup-grid', key: 'grid' }, rows))
        if (note.length) children.push(React.createElement('div', { className: 'pup-code', key: 'note' }, note.join(' · ')))
      }

      return React.createElement('div', { className: 'pup-root' }, children)
    }

    /** Generic quota chip: worst window percent + dot; click opens the panel. */
    function QuotaChip({ store, getNs, title }) {
      const state = useStore(store)
      const [open, setOpen] = React.useState(false)
      const wireError = state && state.ok === false ? state.error : null
      const s = wireError ? null : state
      const d = s && s.data ? s.data : null
      const worst = d ? worstWindow(d.windows) : null
      const wlv = worst !== null ? quotaLevel(worst) : null
      const parts = []
      if (worst !== null) parts.push(React.createElement('b', { key: 'q' }, pct(worst)))
      if (!parts.length) parts.push(React.createElement('span', { key: 'empty' }, s && s.status === 'error' ? 'unavailable' : 'usage'))
      return React.createElement(
        'span',
        { className: 'pup-chipwrap' },
        React.createElement(
          'button',
          { className: 'pup-chip', type: 'button', onClick: () => setOpen((v) => !v), title: title + ' usage' },
          React.createElement('span', { className: 'pup-dot' + (wlv ? ' pup-' + wlv : '') }),
          React.createElement('span', null, title),
          ...parts,
          React.createElement('span', { className: 'pup-code' }, wireError || (s && s.status === 'error') ? '!' : ''),
        ),
        open ? React.createElement('div', { className: 'pup-pop' }, React.createElement(QuotaPanel, { store, getNs, title })) : null,
      )
    }

    /** Generic balance chip: remaining + dot; click opens the panel. */
    function BalanceChip({ store, getNs, title }) {
      const state = useStore(store)
      const [open, setOpen] = React.useState(false)
      const wireError = state && state.ok === false ? state.error : null
      const s = wireError ? null : state
      const d = s && s.data ? s.data : null

      let text = null
      let lv = null
      if (d && Array.isArray(d.balances) && d.balances.length > 0) {
        const b = d.balances[0]
        text = fiat(b.total, b.currency)
        lv = b.total !== null && b.total <= 0 ? 'bad' : b.total !== null && b.total <= 1 ? 'warn' : 'ok'
      } else if (d && d.kind === 'balance' && d.remaining !== null) {
        text = fiat(d.remaining, d.currency) + ' left'
        lv = budgetLevel(d.remaining, d.total)
      }
      const parts = []
      if (text) parts.push(React.createElement('b', { key: 'b' }, text))
      if (!parts.length) parts.push(React.createElement('span', { key: 'empty' }, s && s.status === 'error' ? 'unavailable' : 'balance'))
      return React.createElement(
        'span',
        { className: 'pup-chipwrap' },
        React.createElement(
          'button',
          { className: 'pup-chip', type: 'button', onClick: () => setOpen((v) => !v), title: title + ' balance' },
          React.createElement('span', { className: 'pup-dot' + (lv ? ' pup-' + lv : '') }),
          React.createElement('span', null, title),
          ...parts,
          React.createElement('span', { className: 'pup-code' }, wireError || (s && s.status === 'error') ? '!' : ''),
        ),
        open ? React.createElement('div', { className: 'pup-pop' }, React.createElement(BalancePanel, { store, getNs, title })) : null,
      )
    }

    // ---------- provider-card extras ----------

    /**
     * The quota windows of a state, in one shape: zhipu/minimax carry a
     * `windows` array, kimi carries the fixed `quotas` record.
     */
    function windowsOf(d) {
      if (Array.isArray(d.windows)) return d.windows
      if (d.quotas && typeof d.quotas === 'object') {
        return Object.entries(d.quotas).map(([key, q]) => ({ key, usedRatio: q && typeof q.usedRatio === 'number' ? q.usedRatio : null }))
      }
      return []
    }

    /** One compact usage summary per provider, from its latest state. */
    function summarize(p, s) {
      const d = s && s.data ? s.data : null
      if (!d) return null
      if (p.id === 'openrouter') {
        const parts = [`used ${usd(d.usage)}`]
        const a = s.account && s.account.status === 'ready' ? s.account.data : null
        if (a && a.remaining !== null) parts.push(`balance ${usd(a.remaining)} left`)
        if (d.usageMonthly !== null) parts.push(`month ${usd(d.usageMonthly)}`)
        return parts.join(' · ')
      }
      if (d.kind === 'quota' || d.quotas) {
        const short = { fiveHour: '5h', sevenDay: '7d', monthTotal: 'mo', monthCode: 'code' }
        const parts = windowsOf(d)
          .filter((w) => typeof w.usedRatio === 'number')
          .map((w) => `${short[w.key] ?? w.label} ${pct(w.usedRatio)}`)
        if (d.extra) parts.push(`extra ${centsMoney(d.extra.balanceCents, d.extra.currency)}`)
        return parts.join(' · ') || null
      }
      if (d.kind === 'balance') {
        if (Array.isArray(d.balances) && d.balances.length > 0) {
          const b = d.balances[0]
          return `balance ${fiat(b.total, b.currency)}`
        }
        if (d.remaining !== null) return `${fiat(d.remaining, d.currency)} left`
      }
      return null
    }

    /** The worst indicator level for the summary dot. */
    function summaryLevel(p, s) {
      const d = s && s.data ? s.data : null
      if (!d) return ''
      if (s.status === 'error') return 'bad'
      if (p.id === 'openrouter') {
        const a = s.account && s.account.status === 'ready' ? s.account.data : null
        const lv = a ? budgetLevel(a.remaining, a.totalCredits) : d.remaining !== null ? budgetLevel(d.remaining, d.limit) : null
        return lv ?? ''
      }
      if (d.kind === 'quota' || d.quotas) {
        const worst = worstWindow(windowsOf(d))
        return worst !== null ? (quotaLevel(worst) ?? '') : ''
      }
      if (d.kind === 'balance' && !Array.isArray(d.balances)) return budgetLevel(d.remaining, d.total) ?? ''
      return ''
    }

    /**
     * One provider card's usage line (`settings.models.provider-card`).
     * Renders nothing until the owner confirms the row's key is configured —
     * usage belongs to set-up providers only. Click expands the full panel.
     */
    function CardExtras({ p, store, getNs, keyConfigured }) {
      const state = useStore(store)
      const [open, setOpen] = React.useState(false)
      if (keyConfigured === false) return null
      const wireError = state && state.ok === false ? state.error : null
      const s = wireError ? null : state
      const summary = summarize(p, s)
      const lv = summaryLevel(p, s)
      const errText = wireError
        ? wireError.message || 'The Remote call failed.'
        : s && s.status === 'error'
          ? s.detail || 'Read failed.'
          : null
      if (!summary && !errText) return null

      return React.createElement(
        'div',
        { className: `${p.px}-root`, style: { marginTop: '8px', padding: '8px 12px' } },
        React.createElement(
          'button',
          {
            className: `${p.px}-btn`, type: 'button',
            style: { border: 'none', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 6 },
            onClick: () => setOpen((v) => !v),
            title: `${p.title} usage`,
          },
          React.createElement('span', { className: `${p.px}-dot` + (lv ? ` ${p.px}-${lv}` : '') }),
          React.createElement('span', null, summary ?? 'Usage unavailable'),
          React.createElement('span', { className: `${p.px}-code`, style: { marginTop: 0 } }, open ? '▴ less' : '▾ details'),
        ),
        errText && !summary
          ? React.createElement('div', { className: `${p.px}-err`, style: { marginTop: 6 } }, errText)
          : null,
        open ? React.createElement(p.panel, { store, getNs }) : null,
      )
    }

    // ---------- registration ----------

    /**
     * Services this half needs. A plain array of names. There is deliberately
     * NO `typert` entry and NO `styles` entry: `$mount` resolves typert
     * through the service shadow, and `styles` is a dynamic-package symbol,
     * not an injectable service.
     */
    const inject = ['slots', 'remote']

    // Stable per-provider wrappers: an inline arrow in the PROVIDERS table
    // would be a new component type per render and remount the popover each
    // time, dropping the chip's open state.
    function DeepSeekPanel(props) { return React.createElement(BalancePanel, { ...props, title: 'DeepSeek' }) }
    function DeepSeekChip(props) { return React.createElement(BalanceChip, { ...props, title: 'DeepSeek' }) }
    function ZhipuPanel(props) { return React.createElement(QuotaPanel, { ...props, title: 'GLM Coding Plan' }) }
    function ZhipuChip(props) { return React.createElement(QuotaChip, { ...props, title: 'GLM' }) }
    function MiniMaxPanel(props) { return React.createElement(QuotaPanel, { ...props, title: 'MiniMax Coding Plan' }) }
    function MiniMaxChip(props) { return React.createElement(QuotaChip, { ...props, title: 'MiniMax' }) }
    function NewApiPanel(props) { return React.createElement(BalancePanel, { ...props, title: 'NewAPI' }) }
    function NewApiChip(props) { return React.createElement(BalanceChip, { ...props, title: 'NewAPI' }) }

    /** The per-provider wiring table: namespace, store, surfaces, gate. */
    const PROVIDERS = [
      {
        id: 'openrouter',
        px: 'orup',
        title: 'OpenRouter',
        namespace: 'openrouterUsage',
        store: orStore,
        panel: OpenRouterPanel,
        chip: OpenRouterChip,
        settingsId: 'openrouter-usage',
        chipId: 'openrouter-usage-chip',
        label: 'OpenRouter usage',
        chipLabel: 'OpenRouter usage chip',
        gate: ['openrouter'],
      },
      {
        id: 'kimi',
        px: 'kmup',
        title: 'Kimi Code',
        namespace: 'kimiUsage',
        store: kimiStore,
        panel: KimiPanel,
        chip: KimiChip,
        settingsId: 'kimi-usage',
        chipId: 'kimi-usage-chip',
        label: 'Kimi Code usage',
        chipLabel: 'Kimi Code usage chip',
        gate: ['kimi-coding'],
      },
      {
        id: 'deepseek',
        px: 'pup',
        title: 'DeepSeek',
        namespace: 'deepseekUsage',
        store: makeStore(),
        panel: DeepSeekPanel,
        chip: DeepSeekChip,
        settingsId: 'deepseek-usage',
        chipId: 'deepseek-usage-chip',
        label: 'DeepSeek balance',
        chipLabel: 'DeepSeek balance chip',
        gate: ['deepseek', 'deepseek-official'],
      },
      {
        id: 'zhipu',
        px: 'pup',
        title: 'GLM Coding Plan',
        namespace: 'zhipuUsage',
        store: makeStore(),
        panel: ZhipuPanel,
        chip: ZhipuChip,
        settingsId: 'zhipu-usage',
        chipId: 'zhipu-usage-chip',
        label: 'GLM Coding Plan usage',
        chipLabel: 'GLM Coding Plan usage chip',
        gate: ['zai-coding-cn', 'zai'],
      },
      {
        id: 'minimax',
        px: 'pup',
        title: 'MiniMax Coding Plan',
        namespace: 'minimaxUsage',
        store: makeStore(),
        panel: MiniMaxPanel,
        chip: MiniMaxChip,
        settingsId: 'minimax-usage',
        chipId: 'minimax-usage-chip',
        label: 'MiniMax Coding Plan usage',
        chipLabel: 'MiniMax Coding Plan usage chip',
        gate: ['minimax-cn', 'minimax'],
      },
      {
        id: 'newapi',
        px: 'pup',
        title: 'NewAPI',
        namespace: 'newapiUsage',
        store: makeStore(),
        panel: NewApiPanel,
        chip: NewApiChip,
        settingsId: 'newapi-usage',
        chipId: 'newapi-usage-chip',
        label: 'NewAPI token quota',
        chipLabel: 'NewAPI token quota chip',
        // No default gate: a NewAPI relay maps to no catalog provider. Set
        // `gate` in the provider config to unhide the chip.
        gate: [],
      },
    ]

    /** Insert one stylesheet into the document, removed when the plugin unloads. */
    function insertStyles() {
      const id = 'usage-plugin-styles'
      if (typeof document === 'undefined') return () => {}
      const existing = document.getElementById(id)
      if (existing) return () => {}
      const el = document.createElement('style')
      el.id = id
      el.textContent = CSS
      document.head.appendChild(el)
      return () => {
        const live = document.getElementById(id)
        if (live && live.parentNode) live.parentNode.removeChild(live)
      }
    }

    /**
     * The hand-written Remote contribution for the WHOLE package. The typert
     * registry admits one registration per package name, so all provider
     * namespaces ride one mount — six separate mounts fail after the first
     * with "Remote package is already registered".
     */
    function contribution(namespaces) {
      const descriptor = (namespace, method) => ({
        id: `dsh-plugin-provider-usage#${namespace}/${method}`,
        service: namespace,
        namespace,
        method,
        invocation: { kind: 'direct' },
        parameters: [],
        result: { mode: 'src-json' },
      })
      return {
        package: 'dsh-plugin-provider-usage',
        descriptors: namespaces.flatMap((ns) => [descriptor(ns, 'snapshot'), descriptor(ns, 'refresh')]),
      }
    }

    function apply(ctx) {
      ctx.effect(insertStyles, 'usage: stylesheet')

      /**
       * Resolve the session's shared ModelDirectory store, or undefined when
       * the model-selection service is absent. Lazy get, never injected.
       */
      const getDirectory = (sessionId) => {
        try {
          const dirs = ctx.get('modelDirectories')
          if (!dirs || typeof dirs.directoryFor !== 'function') return undefined
          return dirs.directoryFor(sessionId).store
        } catch {
          return undefined
        }
      }

      /**
       * Mount ALL Remote namespaces in one effect owned by this plugin fiber,
       * so unloading the plugin unmounts them together. A mount failure must
       * never throw out of `apply`: a throw here fails web boot for the whole
       * application. The surfaces keep polling until the namespaces appear.
       */
      const namespaces = new Map()
      ctx.effect(async () => {
        let dispose
        try {
          dispose = await ctx.remote.$mount(contribution(PROVIDERS.map((p) => p.namespace)))
        } catch {
          return () => {}
        }
        for (const p of PROVIDERS) {
          try {
            const ns = ctx.get('remote.' + p.namespace)
            if (ns) namespaces.set(p.namespace, ns)
          } catch {
            // A missing namespace leaves the provider's surfaces polling.
          }
        }
        return () => dispose()
      }, 'usage: mount remotes')

      for (const p of PROVIDERS) {
        const getNs = () => namespaces.get(p.namespace)

        /** ONE poll loop per provider, feeding both of its surfaces. */
        ctx.effect(() => {
          let alive = true
          let timer
          const startedAt = Date.now()
          const tick = async () => {
            const ns = getNs()
            if (ns) {
              p.store.waiting = false
              try {
                const result = await ns.snapshot()
                if (alive && result && typeof result === 'object') {
                  p.store.set(result.ok === true ? result.value : result)
                }
              } catch {
                // A failed read keeps the last state; the next tick retries.
              }
              if (alive) timer = setTimeout(tick, POLL_MS)
            } else {
              if (alive && Date.now() - startedAt > MOUNT_GRACE_MS && !p.store.waiting) {
                p.store.waiting = true
                p.store.set(p.store.state) // notify so the idle hint appears
              }
              if (alive) timer = setTimeout(tick, MOUNT_RETRY_MS)
            }
          }
          void tick()
          return () => {
            alive = false
            clearTimeout(timer)
          }
        }, `usage: poll ${p.namespace}`)

        // See the registration below the loop: cards are keyed by settings
        // namespace, not by route — every pi-ai row dispatches 'llm-pi-ai'.

        // The composer chip. Hidden when the Host config says so
        // (`ui.composerChip` rides the state; default on) and unless the
        // session's active model belongs to one of this provider's gates.
        // The Host config can override the gate list (`ui.gate`), which is
        // the only way a config-only provider like NewAPI gets a chip.
        ctx.slots.inject(CHIP_SLOT, () =>
          ctx.slots.register(
            { name: CHIP_SLOT, id: p.chipId, order: 10, label: () => p.chipLabel },
            function ChipPanel(props) {
              const state = p.store.state
              const provider = useActiveProvider(getDirectory, props.sessionId)
              if (state && state.ui && state.ui.composerChip === false) return null
              const gates = state && state.ui && Array.isArray(state.ui.gate) ? state.ui.gate : p.gate
              if (!gates.includes(provider)) return null
              return React.createElement(p.chip, { ...props, store: p.store, getNs })
            },
          ),
        )
      }

    /**
     * Provider cards are keyed by SETTINGS NAMESPACE, not route: every pi-ai
     * row dispatches `entryKey = 'llm-pi-ai'`, the official DeepSeek row
     * dispatches 'llm-deepseek'. One occupant per namespace branches on the
     * row's route id (`props.provider.provider`) against the provider gates.
     */
    const cardNamespaces = ['llm-pi-ai', 'llm-deepseek']
    for (const settingsNs of cardNamespaces) {
      ctx.slots.inject(CARD_SLOT, () =>
        ctx.slots.register(
          { name: CARD_SLOT, key: settingsNs },
          function UsageCardOccupant(props) {
            const route = props && props.provider && typeof props.provider.provider === 'string' ? props.provider.provider : null
            const p = PROVIDERS.find((candidate) => candidate.gate.includes(route))
            if (!p) return null
            return React.createElement(CardExtras, { ...props, p, store: p.store, getNs: () => namespaces.get(p.namespace) })
          },
        ),
      )
    }
    }

    exports.SLOT = CARD_SLOT
    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
