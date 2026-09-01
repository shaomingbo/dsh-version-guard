import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CHANNEL,
  apply,
  createVersionGuardHost,
  detectDshVersion,
  launchCommandFor,
} from '../lib/index.js'

const HEALTHY = {
  currentVersion: '0.1.2-alpha.2',
  checkedAt: 1,
  distTags: { latest: '0.1.1-rc.2', alpha: '0.1.2-alpha.3' },
  hasUpdate: true,
  recommended: '0.1.2-alpha.3',
  recommendedTag: 'alpha',
  recommendationReason: 'same-channel',
  newerVersions: ['0.1.2-alpha.3'],
  publishedAt: '2026-08-31T16:20:52.856Z',
}

function stubHost(overrides = {}) {
  const checks = []
  const changelogCalls = []
  let checkCount = 0
  const host = createVersionGuardHost({
    currentVersion: '0.1.2-alpha.2',
    now: () => 100_000,
    checkUpdateImpl: async (input) => {
      checkCount += 1
      checks.push(input)
      if (overrides.failCheck) return { ...HEALTHY, currentVersion: input.currentVersion, hasUpdate: false, error: 'registry responded with HTTP 503', distTags: {}, recommended: null, recommendedTag: null, recommendationReason: undefined, newerVersions: [], publishedAt: null }
      return { ...HEALTHY, currentVersion: input.currentVersion, checkedAt: 1 + checkCount }
    },
    fetchChangelogImpl: async (input) => {
      changelogCalls.push(input)
      return { version: input.version, locale: input.locale, fetchedAt: 9, body: `notes for ${input.version}`, localized: true }
    },
    ...overrides,
  })
  return { host, checks, changelogCalls }
}

test('launchCommandFor always pins an exact version', () => {
  assert.equal(launchCommandFor('0.1.2-alpha.3'), 'pnpm dlx @deepseek-ai/dsh@0.1.2-alpha.3 web')
  assert.equal(launchCommandFor('0.1.1-rc.2'), 'pnpm dlx @deepseek-ai/dsh@0.1.1-rc.2 web')
})

test('detectDshVersion resolves through the injected require and degrades to null', () => {
  // Inside this repo the real manifest is not resolvable; the guard must
  // degrade to null rather than throw.
  assert.equal(detectDshVersion({ requireImpl: { resolve: () => { throw new Error('missing') } } }), null)
  // When the manifest resolves but readFileSync fails, the same degradation
  // applies (exercise via a path that cannot be read).
  assert.equal(detectDshVersion({ requireImpl: { resolve: () => '/definitely/not/a/real/path.json' } }), null)
})

test('handle(status) runs the first check and caches it; check() forces a refresh', async () => {
  const { host, checks } = stubHost()
  const first = await host.handle('status', {})
  assert.equal(first.ok, true)
  assert.equal(first.value.hasUpdate, true)
  assert.equal(first.value.recommended, '0.1.2-alpha.3')
  assert.equal(first.value.launchCommand, 'pnpm dlx @deepseek-ai/dsh@0.1.2-alpha.3 web')
  assert.equal(checks.length, 1)

  const cached = await host.handle('status', {})
  assert.equal(checks.length, 1, 'status reuses the cached result')
  assert.equal(cached.value.checkedAt, first.value.checkedAt)

  const forced = await host.handle('check', {})
  assert.equal(checks.length, 2)
  assert.ok(forced.value.checkedAt > first.value.checkedAt)
})

test('handle(launch-command) pins to the recommendation, or the running version', async () => {
  const { host } = stubHost()
  const result = await host.handle('launch-command', {})
  assert.equal(result.value.command, 'pnpm dlx @deepseek-ai/dsh@0.1.2-alpha.3 web')

  const failing = stubHost({ failCheck: true })
  const degraded = await failing.host.handle('launch-command', {})
  assert.equal(degraded.value.command, 'pnpm dlx @deepseek-ai/dsh@0.1.2-alpha.2 web')
})

test('handle(changelog) defaults to the recommended version and caches per locale', async () => {
  const { host, changelogCalls } = stubHost()
  const first = await host.handle('changelog', {})
  assert.equal(first.ok, true)
  assert.equal(first.value.version, '0.1.2-alpha.3')
  assert.equal(first.value.locale, 'zh')
  assert.equal(changelogCalls.length, 1)

  await host.handle('changelog', {})
  await host.handle('changelog', { locale: 'en' })
  assert.equal(changelogCalls.length, 2, 'cache hits skip the network; distinct locales fetch separately')
  assert.equal(changelogCalls[1].locale, 'en')

  const explicit = await host.handle('changelog', { version: '0.1.1-rc.2' })
  assert.equal(explicit.value.version, '0.1.1-rc.2')
  assert.equal(changelogCalls.length, 3)
})

test('handle(changelog) falls back to the running version when up to date', async () => {
  let checkCount = 0
  const host = createVersionGuardHost({
    currentVersion: '0.1.2-alpha.3',
    checkUpdateImpl: async (input) => ({
      ...HEALTHY,
      currentVersion: input.currentVersion,
      checkedAt: 1 + (checkCount += 1),
      hasUpdate: false,
      recommended: null,
      recommendedTag: null,
      newerVersions: [],
      publishedAt: null,
    }),
    fetchChangelogImpl: async (input) => ({ version: input.version, locale: input.locale, fetchedAt: 9, body: 'x', localized: true }),
  })
  const result = await host.handle('changelog', {})
  assert.equal(result.value.version, '0.1.2-alpha.3')
})

test('handle validates payloads and rejects unknown endpoints', async () => {
  const { host } = stubHost()
  await assert.rejects(() => host.handle('changelog', { locale: 'fr' }), /locale/)
  await assert.rejects(() => host.handle('changelog', { version: 'x'.repeat(100) }), /short string/)
  await assert.rejects(() => host.handle('nope', {}), /unknown endpoint/)
})

test('a missing running version degrades to an error status without network calls', async () => {
  let called = false
  const host = createVersionGuardHost({
    currentVersion: null,
    checkUpdateImpl: async () => { called = true; return {} },
  })
  const status = await host.handle('status', {})
  assert.equal(status.ok, true)
  assert.equal(status.value.currentVersion, null)
  assert.match(status.value.error, /current DSH version unavailable/)
  assert.equal(status.value.launchCommand, null)
  assert.equal(called, false, 'no registry call is possible without a version')
})

test('concurrent checks collapse into one in-flight request', async () => {
  let resolves = []
  let checkCount = 0
  const host = createVersionGuardHost({
    currentVersion: '0.1.2-alpha.2',
    checkUpdateImpl: (input) => new Promise((resolve) => {
      checkCount += 1
      resolves.push(() => resolve({ ...HEALTHY, currentVersion: input.currentVersion, checkedAt: 1 + checkCount }))
    }),
  })
  const first = host.check()
  const second = host.check()
  assert.equal(checkCount, 1, 'the second call joins the in-flight request')
  for (const resolve of resolves) resolve()
  const [a, b] = await Promise.all([first, second])
  assert.equal(a.checkedAt, b.checkedAt)
})

function fakeCtx(overrides = {}) {
  const handlers = new Map()
  const intervals = []
  const warnings = []
  const ctx = {
    logger: { warn: (message) => warnings.push(message) },
    connection: {
      rpc: {
        handle: (channel, handler, opts) => handlers.set(channel, { handler, opts }),
      },
    },
    interval: (fn, ms) => intervals.push({ fn, ms }),
    ...overrides,
  }
  return { ctx, handlers, intervals, warnings }
}

test('apply registers the loopback channel, runs a boot check, and schedules polling', async () => {
  const { ctx, handlers, intervals } = fakeCtx()
  apply(ctx, {
    currentVersion: '0.1.2-alpha.2',
    checkIntervalMs: 60_000,
    checkUpdateImpl: async () => ({ ...HEALTHY, checkedAt: 1 }),
    fetchChangelogImpl: async () => ({ version: 'v', locale: 'zh', fetchedAt: 1, body: 'b', localized: true }),
  })
  assert.equal(handlers.has(CHANNEL), true)
  assert.equal(handlers.get(CHANNEL).opts, undefined ?? handlers.get(CHANNEL).opts, 'sanity')
  assert.deepEqual(handlers.get(CHANNEL).opts, { authority: 'loopback' })
  assert.equal(intervals.length, 1)
  assert.equal(intervals[0].ms, 60_000)

  // The boot check resolves asynchronously; wait a tick and call through RPC.
  await new Promise((resolve) => setTimeout(resolve, 0))
  const response = await handlers.get(CHANNEL).handler('status', {})
  assert.equal(response.ok, true)
  assert.equal(response.value.hasUpdate, true)

  intervals[0].fn()
  await new Promise((resolve) => setTimeout(resolve, 0))
})

test('apply captures RPC handler errors into failure envelopes', async () => {
  const { ctx, handlers } = fakeCtx()
  apply(ctx, {
    currentVersion: '0.1.2-alpha.2',
    checkUpdateImpl: async () => ({ ...HEALTHY, checkedAt: 1 }),
    fetchChangelogImpl: async () => { throw new Error('boom') },
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  const response = await handlers.get(CHANNEL).handler('changelog', {})
  assert.equal(response.ok, false)
  assert.equal(response.error.message, 'boom')
})
