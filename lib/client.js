/**
 * Browser half of dsh-version-guard: a Settings section (设置 → Version
 * Guard) showing the running DSH version, update recommendations, release
 * notes, and the pinned launch command. All data comes from the host over
 * the loopback /version-guard channel; the client never touches the network
 * itself. The sidebar footer is deliberately left to the plugins that own it.
 */

window.__ModuleLoader__.load({
  id: 'dsh-version-guard',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const CHANNEL = '/version-guard'
    const NS = 'dsh-version-guard'

    const en = {
      nav: 'Version Guard',
      title: 'DSH Version',
      current: 'Current version',
      updateAvailable: 'Update available',
      upToDate: 'Up to date',
      unknownVersion: 'Current DSH version could not be detected.',
      checkNow: 'Check now',
      checking: 'Checking…',
      lastChecked: 'Last checked',
      never: 'never',
      channel: 'channel',
      launchCommand: 'Launch command (pinned version)',
      copy: 'Copy',
      copied: 'Copied',
      changelog: 'Release notes',
      changelogLoadFailed: 'Failed to load release notes.',
      viewOnGitHub: 'View on GitHub',
      checkFailed: 'Check failed',
      distTags: 'Release channels',
      distTagsIntro: 'Available channels and latest releases',
      currentChannelBadge: 'Current',
      channelDescAlpha: 'Preview & latest features',
      channelDescLatest: 'Official stable release',
      channelDescNext: 'Release candidate',
      channelDescDefault: 'Release channel',
      published: 'Published',
      sameChannel: 'Same channel you are running',
      otherChannel: 'From a different release channel',
      pinnedHint: 'Pin the exact version: floating tags once resolved to an older DSH.',
    }

    const zh = {
      nav: '版本守卫',
      title: 'DSH 版本',
      current: '当前版本',
      updateAvailable: '有新版本可用',
      upToDate: '已是最新',
      unknownVersion: '无法检测当前 DSH 版本。',
      checkNow: '立即检查',
      checking: '检查中…',
      lastChecked: '上次检查',
      never: '尚未检查',
      channel: '通道',
      launchCommand: '启动命令（固定版本）',
      copy: '复制',
      copied: '已复制',
      changelog: '更新日志',
      changelogLoadFailed: '更新日志加载失败。',
      viewOnGitHub: '在 GitHub 查看',
      checkFailed: '检查失败',
      distTags: '发布通道',
      distTagsIntro: '各通道当前最新版本',
      currentChannelBadge: '当前通道',
      channelDescAlpha: '尝鲜与前沿特性',
      channelDescLatest: '正式稳定版本',
      channelDescNext: '发布候选版本',
      channelDescDefault: '发布通道',
      published: '发布于',
      sameChannel: '与你当前使用的发布通道一致',
      otherChannel: '来自其他发布通道',
      pinnedHint: '务必固定精确版本：浮动 tag 曾解析到更旧的 DSH。',
    }

    const C = {
      bgCard: 'var(--dsw-alias-bg-layer-3, #3a3a3c)',
      border: 'var(--dsw-alias-border-l2, #ffffff1f)',
      text: 'var(--dsw-alias-label-primary, #f9fafb)',
      muted: 'var(--dsw-alias-label-secondary, #cfd3d6)',
      accent: 'var(--dsw-alias-state-business-primary, #4176e6)',
      ok: '#30a46c',
      warn: '#f0a020',
      danger: '#ec1313',
    }

    const buttonStyle = {
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      background: 'transparent',
      color: C.text,
      cursor: 'pointer',
      font: 'inherit',
      fontSize: 13,
      padding: '6px 12px',
    }
    const chromeButtonStyle = {
      height: 28,
      padding: '0 12px',
      borderRadius: 14,
      border: `1px solid var(--dsw-alias-border-l2, ${C.border})`,
      background: 'var(--dsw-alias-bg-layer-1, transparent)',
      color: 'var(--dsw-alias-label-primary, #f9fafb)',
      cursor: 'pointer',
      font: 'inherit',
      fontSize: 13,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
    }
    const primaryStyle = {
      ...buttonStyle,
      background: C.accent,
      borderColor: C.accent,
      color: '#fff',
    }
    const mutedStyle = { margin: 0, color: C.muted, fontSize: 13, lineHeight: 1.5 }
    const cardStyle = {
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      background: C.bgCard,
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }
    const codeStyle = {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12.5,
      background: 'rgba(0,0,0,.25)',
      borderRadius: 6,
      padding: '8px 10px',
      wordBreak: 'break-all',
      userSelect: 'all',
    }
    const releaseBodyStyle = {
      margin: 0,
      fontSize: 13,
      lineHeight: 1.55,
      color: C.muted,
      whiteSpace: 'pre-wrap',
      maxHeight: 300,
      overflowY: 'auto',
    }
    const channelListStyle = {
      display: 'flex',
      flexDirection: 'column',
      borderRadius: 10,
      border: `1px solid ${C.border}`,
      background: C.bgCard,
      overflow: 'hidden',
    }
    const channelItemStyle = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: '10px 14px',
      borderBottom: `1px solid ${C.border}`,
      transition: 'background 0.15s ease',
    }
    const channelBadgeStyle = {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '1px 6px',
      borderRadius: 10,
      fontSize: 11,
      fontWeight: 500,
      background: 'rgba(65, 118, 230, 0.15)',
      color: C.accent,
      border: '1px solid rgba(65, 118, 230, 0.3)',
    }
    const channelVersionPillStyle = {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12.5,
      padding: '3px 8px',
      borderRadius: 6,
      background: 'rgba(0, 0, 0, 0.25)',
      color: C.text,
      border: `1px solid ${C.border}`,
    }
    const sectionStyle = {
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      maxWidth: 640,
      color: C.text,
    }

    const sectionActive = {
      active: false,
      listeners: new Set(),
      subscribe(listener) {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
      },
      getSnapshot() { return this.active },
      set(next) {
        if (this.active === next) return
        this.active = next
        for (const listener of this.listeners) listener()
      },
    }

    const checkNowRef = { current: null }

    function createStore() {
      const state = {
        status: null,
        checking: false,
        changelog: null,
        changelogLoading: false,
        copied: false,
        error: null,
      }
      const listeners = new Set()
      return {
        get state() { return state },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
        update(patch) {
          Object.assign(state, typeof patch === 'function' ? patch(state) : patch)
          for (const listener of listeners) listener()
        },
      }
    }

    function useStore(store) {
      const [, force] = React.useState(0)
      React.useEffect(() => store.subscribe(() => force((n) => n + 1)), [store])
      return store.state
    }

    async function rpc(ctx, endpoint, payload = {}) {
      const result = await ctx.connection.rpc.call(CHANNEL, endpoint, payload)
      if (result && result.ok === false) {
        throw new Error(result.error?.message ?? 'version-guard request failed')
      }
      return result?.value ?? result
    }

    function readLocale(ctx) {
      try { return ctx.locale } catch { return undefined }
    }

    function fallbackT(key, params) {
      const zhUi = String(navigator.language || 'en').toLowerCase().startsWith('zh')
      let text = (zhUi ? zh[key] : undefined) ?? en[key] ?? key
      if (params) {
        for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value))
      }
      return text
    }

    function registerCopy(locale) {
      try {
        return locale.register(NS, { zh, en })
      } catch (error) {
        if (!String(error?.message ?? error).includes('already has locale')) throw error
        return () => {}
      }
    }

    function formatTime(value, locale) {
      if (typeof value !== 'number' && typeof value !== 'string') return null
      const date = typeof value === 'number' ? new Date(value) : new Date(value)
      if (Number.isNaN(date.getTime())) return null
      return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      }).format(date)
    }

    function ChangelogSection({ ctx, store, state, t }) {
      React.useEffect(() => {
        if (state.changelog !== null || state.changelogLoading) return
        store.update({ changelogLoading: true })
        void rpc(ctx, 'changelog', {})
          .then((changelog) => store.update({ changelog, changelogLoading: false }))
          .catch(() => store.update({ changelog: { error: 'load failed' }, changelogLoading: false }))
      }, [ctx, store, state.changelog, state.changelogLoading])
      if (state.changelogLoading) return h('p', { style: mutedStyle }, '…')
      if (state.changelog === null || state.changelog.error !== undefined) {
        return h('p', { style: mutedStyle }, t('changelogLoadFailed'))
      }
      const children = [
        h('pre', { key: 'body', style: releaseBodyStyle }, state.changelog.body),
      ]
      if (state.changelog.htmlUrl) {
        children.push(h('a', {
          key: 'link',
          href: state.changelog.htmlUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
          style: { color: C.accent, fontSize: 13 },
        }, t('viewOnGitHub')))
      }
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } }, children)
    }

    function UpdateCard({ ctx, store, state, t, localeName }) {
      const status = state.status
      const sameChannel = status.recommendationReason === 'same-channel'
      return h('div', { style: { ...cardStyle, borderColor: C.warn } },
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
          h('strong', { style: { fontSize: 16, color: C.warn } }, status.recommended),
          h('span', { style: { ...mutedStyle, fontSize: 12 } }, `${t('channel')}: ${status.recommendedTag ?? '—'}`),
        ),
        h('p', { style: mutedStyle },
          sameChannel ? t('sameChannel') : t('otherChannel'),
          status.publishedAt ? ` · ${t('published')} ${formatTime(status.publishedAt, localeName)}` : ''),
        h('strong', { style: { fontSize: 13 } }, t('changelog')),
        h(ChangelogSection, { ctx, store, state, t }),
        h('div', null,
          h('p', { style: { ...mutedStyle, marginBottom: 4 } }, t('launchCommand')),
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'stretch' } },
            h('code', { style: { ...codeStyle, flex: 1 } }, status.launchCommand),
            h('button', {
              type: 'button',
              style: state.copied ? primaryStyle : buttonStyle,
              onClick: async () => {
                try {
                  await navigator.clipboard.writeText(status.launchCommand)
                  store.update({ copied: true })
                  setTimeout(() => store.update({ copied: false }), 1600)
                } catch { /* clipboard unavailable; the text is selectable */ }
              },
            }, state.copied ? t('copied') : t('copy')),
          ),
          h('p', { style: { ...mutedStyle, fontSize: 12, marginTop: 4 } }, t('pinnedHint')),
        ),
      )
    }

    function detectChannel(version) {
      if (typeof version !== 'string' || !version) return null
      const match = version.trim().match(/^v?\d+\.\d+\.\d+(?:-([0-9A-Za-z.-]+))?/)
      if (!match || !match[1]) return 'latest'
      const id = match[1].split('.')[0]?.toLowerCase()
      if (id === 'alpha' || id === 'beta' || id === 'rc' || id === 'next' || id === 'dev') return id
      return id || 'latest'
    }

    function channelDescription(tag, t) {
      const lower = String(tag).toLowerCase()
      if (lower === 'alpha') return t('channelDescAlpha')
      if (lower === 'latest') return t('channelDescLatest')
      if (lower === 'next') return t('channelDescNext')
      return t('channelDescDefault')
    }

    function VersionGuardSection({ ctx, store, t, localeName }) {
      const state = useStore(store)
      const status = state.status

      const runCheck = React.useCallback(() => {
        store.update({ checking: true, changelog: null })
        void rpc(ctx, 'check', { force: true })
          .then((next) => store.update({ status: next, checking: false, error: null }))
          .catch((error) => store.update({ checking: false, error: error.message }))
      }, [ctx, store])

      React.useEffect(() => {
        checkNowRef.current = runCheck
        sectionActive.set(true)
        return () => {
          checkNowRef.current = null
          sectionActive.set(false)
        }
      }, [runCheck])

      React.useEffect(() => {
        if (status === null && !state.checking) runCheck()
      }, [status, state.checking, runCheck])

      const rows = status === null ? [] : Object.entries(status.distTags ?? {})
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      const checkedAt = status === null ? null : formatTime(status.checkedAt, localeName)
      const currentChannel = detectChannel(status?.currentVersion)

      return h('div', { style: sectionStyle },
        h('div', { style: { display: 'flex', alignItems: 'center' } },
          h('strong', { style: { fontSize: 16, fontWeight: 500 } }, t('title')),
        ),
        state.error !== null ? h('p', { style: { ...mutedStyle, color: C.danger } }, `${t('checkFailed')}: ${state.error}`) : null,
        status === null
          ? h('p', { style: mutedStyle }, t('checking'))
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
            typeof status.currentVersion !== 'string'
              ? h('p', { style: { ...mutedStyle, color: C.warn } }, t('unknownVersion'))
              : h('div', { style: cardStyle },
                h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
                  h('span', { style: { ...mutedStyle, fontSize: 12 } }, t('current')),
                  h('strong', { style: { fontSize: 16 } }, status.currentVersion),
                  status.hasUpdate ? null : h('span', { style: { color: C.ok, fontSize: 13, marginLeft: 'auto' } }, `✓ ${t('upToDate')}`),
                ),
                h('p', { style: { ...mutedStyle, fontSize: 12 } }, `${t('lastChecked')}: ${checkedAt ?? t('never')}`),
                typeof status.error === 'string'
                  ? h('p', { style: { ...mutedStyle, fontSize: 12, color: C.warn } }, `${t('checkFailed')}: ${status.error}`)
                  : null,
              ),
            status.hasUpdate ? h(UpdateCard, { ctx, store, state, t, localeName }) : null,
            rows.length > 0 ? h('div', null,
              h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 } },
                h('strong', { style: { fontSize: 13 } }, t('distTags')),
                h('span', { style: { ...mutedStyle, fontSize: 12 } }, t('distTagsIntro')),
              ),
              h('div', { style: channelListStyle },
                ...rows.map(([tag, version]) => {
                  const isCurrent = currentChannel !== null && tag === currentChannel
                  return h('div', {
                    key: tag,
                    style: {
                      ...channelItemStyle,
                      borderBottom: rows[rows.length - 1][0] === tag ? 'none' : channelItemStyle.borderBottom,
                      background: isCurrent ? 'rgba(65, 118, 230, 0.05)' : 'transparent',
                    },
                  },
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                    h('strong', { style: { fontSize: 13.5, color: isCurrent ? C.text : C.muted } }, tag),
                    isCurrent ? h('span', { style: channelBadgeStyle }, t('currentChannelBadge')) : null,
                    h('span', { style: { ...mutedStyle, fontSize: 12 } }, `· ${channelDescription(tag, t)}`),
                  ),
                  h('span', {
                    style: {
                      ...channelVersionPillStyle,
                      borderColor: isCurrent ? 'rgba(65, 118, 230, 0.4)' : channelVersionPillStyle.border,
                      color: isCurrent ? '#fff' : C.muted,
                    },
                  }, version))
                }),
              ),
            ) : null,
          ),
      )
    }

    function CheckAction({ store, t }) {
      const active = React.useSyncExternalStore(
        (listener) => sectionActive.subscribe(listener),
        () => sectionActive.getSnapshot(),
      )
      const state = useStore(store)
      if (!active) return null
      return h('button', {
        type: 'button',
        style: chromeButtonStyle,
        disabled: state.checking,
        onClick: () => { void checkNowRef.current?.() },
      }, state.checking ? t('checking') : t('checkNow'))
    }

    const inject = ['slots', 'locale', 'connection']

    function apply(ctx) {
      try {
        const store = createStore()
        const locale = readLocale(ctx)
        if (locale !== undefined && typeof locale.register === 'function') {
          if (typeof ctx.effect === 'function') ctx.effect(() => registerCopy(locale), 'dsh-version-guard: copy dictionaries')
          else registerCopy(locale)
        }
        const t = locale !== undefined && typeof locale.bind === 'function'
          ? locale.bind(NS)
          : fallbackT
        const localeName = (() => {
          try { return locale?.get?.() ?? (navigator.language?.startsWith('zh') ? 'zh' : 'en') } catch { return 'en' }
        })()

        // Settings-only placement: the sidebar footer belongs to the plugins
        // that own it; version state is page-level information.
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'version-guard',
          order: 16,
          label: () => t('nav'),
        }, () => h(VersionGuardSection, { ctx, store, t, localeName })))
        ctx.slots.inject('settings.action', () => ctx.slots.register({
          name: 'settings.action',
          id: 'version-guard-check',
          order: 21,
        }, () => h(CheckAction, { store, t })))
      } catch (error) {
        console.error('[dsh-version-guard] apply failed:', error)
      }
    }

    return { apply, inject }
  },
})
