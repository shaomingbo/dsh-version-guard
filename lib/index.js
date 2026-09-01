/**
 * Host half of dsh-version-guard: detect the running DSH version, poll npm
 * dist-tags for newer releases, pull the matching GitHub release notes, and
 * serve everything over the loopback-only /version-guard channel. Failures
 * stay contained: every network path degrades to a cached or error result,
 * and this bundle never stops, restarts, patches, or upgrades anything.
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { checkUpdate } from './registry.js'
import { fetchChangelog } from './changelog.js'

export const CHANNEL = '/version-guard'
// `timer` backs ctx.interval; Cordis throws "cannot get property 'timer'
// without inject" at boot when the polling schedule is used undeclared.
export const inject = ['connection', 'timer']

const DEFAULT_CHECK_INTERVAL_MS = 3_600_000
const CHANGELOG_TTL_MS = 3_600_000
const MIN_CHECK_INTERVAL_MS = 60_000

/** Read the running DSH Web App version from its installed package.json. */
export function detectDshVersion({ requireImpl = createRequire(import.meta.url) } = {}) {
  try {
    const manifestPath = requireImpl.resolve('@deepseek-ai/dsh-web-app/package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    return typeof manifest.version === 'string' && manifest.version.length > 0
      ? manifest.version
      : null
  } catch {
    return null
  }
}

/**
 * The pinned command that boots the given version. Always pins an exact
 * version: floating tags resolved to an older DSH once already.
 */
export function launchCommandFor(version) {
  return `pnpm dlx @deepseek-ai/dsh@${version} web`
}

function requireObject(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('request payload must be an object')
  }
  return payload
}

function requireLocale(value) {
  if (value === undefined || value === null || value === '') return 'zh'
  if (value !== 'zh' && value !== 'en') throw new Error('locale must be "zh" or "en"')
  return value
}

function publicStatus(status) {
  // The cache also holds the raw fetch impl and timers; project the wire shape.
  return {
    currentVersion: status.currentVersion,
    checkedAt: status.checkedAt,
    distTags: status.distTags,
    hasUpdate: status.hasUpdate,
    recommended: status.recommended,
    recommendedTag: status.recommendedTag,
    recommendationReason: status.recommendationReason,
    newerVersions: status.newerVersions,
    publishedAt: status.publishedAt,
    error: status.error ?? null,
    launchCommand: status.launchCommand,
  }
}

export function createVersionGuardHost(options = {}) {
  const now = options.now ?? (() => Date.now())
  const log = options.log ?? (() => {})
  const runUpdateCheck = options.checkUpdateImpl ?? checkUpdate
  const runChangelogFetch = options.fetchChangelogImpl ?? fetchChangelog
  const checkIntervalMs = Math.max(
    MIN_CHECK_INTERVAL_MS,
    options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS,
  )
  const changelogTtlMs = options.changelogTtlMs ?? CHANGELOG_TTL_MS

  const state = {
    currentVersion: options.currentVersion ?? null,
    status: null,
    changelogs: new Map(),
    checking: null,
  }

  async function check(force = false) {
    if (typeof state.currentVersion !== 'string') {
      state.status = {
        currentVersion: null,
        checkedAt: now(),
        distTags: {},
        hasUpdate: false,
        error: 'current DSH version unavailable',
        launchCommand: null,
      }
      return publicStatus(state.status)
    }
    if (!force && state.status !== null && state.status.error === undefined) {
      return publicStatus(state.status)
    }
    if (state.checking !== null) return state.checking
    state.checking = (async () => {
      const result = await runUpdateCheck({ currentVersion: state.currentVersion, fetchImpl: options.fetchImpl })
      state.status = {
        ...result,
        launchCommand: launchCommandFor(result.hasUpdate && result.recommended !== null
          ? result.recommended
          : state.currentVersion),
      }
      if (result.error !== undefined) log(`version-guard: update check failed: ${result.error}`)
      else if (result.hasUpdate) log(`version-guard: update available: ${result.recommended} (running ${state.currentVersion})`)
      state.checking = null
      return publicStatus(state.status)
    })()
    return state.checking
  }

  function cachedChangelog(version, locale) {
    const key = `${version}:${locale}`
    const hit = state.changelogs.get(key)
    if (hit === undefined) return null
    if (now() - hit.fetchedAt > changelogTtlMs) {
      state.changelogs.delete(key)
      return null
    }
    return hit
  }

  async function changelog(payload = {}) {
    const input = requireObject(payload)
    const locale = requireLocale(input.locale)
    const status = state.status ?? await check()
    const version = input.version !== undefined
      ? String(input.version)
      : (status.hasUpdate && status.recommended !== null ? status.recommended : state.currentVersion)
    if (typeof version !== 'string' || version.length === 0 || version.length > 64) {
      throw new Error('version must be a short string')
    }
    const cached = cachedChangelog(version, locale)
    if (cached !== null) return cached
    const result = await runChangelogFetch({ version, locale, fetchImpl: options.fetchImpl })
    if (result.error === undefined) state.changelogs.set(`${version}:${locale}`, result)
    else log(`version-guard: changelog fetch failed for ${version}: ${result.error}`)
    return result
  }

  async function handle(endpoint, payload) {
    if (endpoint === 'status') {
      requireObject(payload ?? {})
      const status = state.status !== null ? publicStatus(state.status) : await check()
      return { ok: true, value: status }
    }
    if (endpoint === 'check') {
      requireObject(payload ?? {})
      return { ok: true, value: await check(true) }
    }
    if (endpoint === 'changelog') {
      return { ok: true, value: await changelog(payload) }
    }
    if (endpoint === 'launch-command') {
      requireObject(payload ?? {})
      const status = state.status ?? await check()
      return { ok: true, value: { command: status.launchCommand } }
    }
    throw new Error(`unknown endpoint: ${endpoint}`)
  }

  return {
    handle,
    check,
    changelog,
    get status() {
      return state.status === null ? null : publicStatus(state.status)
    },
    get checkIntervalMs() {
      return checkIntervalMs
    },
  }
}

export function apply(ctx, config = {}) {
  const currentVersion = config.currentVersion ?? detectDshVersion()
  const host = createVersionGuardHost({
    currentVersion,
    fetchImpl: config.fetchImpl,
    checkIntervalMs: config.checkIntervalMs,
    checkUpdateImpl: config.checkUpdateImpl,
    fetchChangelogImpl: config.fetchChangelogImpl,
    log: (message) => ctx.logger?.warn?.(message),
  })

  ctx.connection.rpc.handle(CHANNEL, async (endpoint, payload) => {
    try {
      return await host.handle(endpoint, payload)
    } catch (error) {
      return {
        ok: false,
        error: { code: 'internal', message: error instanceof Error ? error.message : String(error) },
      }
    }
  }, { authority: 'loopback' })

  // Initial check in the background so a slow registry never delays boot;
  // then refresh on the configured cadence.
  void host.check().catch(() => {})
  ctx.interval(() => {
    void host.check(true).catch(() => {})
  }, host.checkIntervalMs)
}
