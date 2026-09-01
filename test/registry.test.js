import assert from 'node:assert/strict'
import test from 'node:test'

import {
  channelOf,
  checkUpdate,
  compareVersions,
  isNewer,
  parseVersion,
  recommendUpgrade,
} from '../lib/registry.js'

test('parseVersion handles core, prerelease, build metadata, and junk', () => {
  assert.deepEqual(parseVersion('0.1.2'), { core: [0, 1, 2], prerelease: [] })
  assert.deepEqual(parseVersion('v0.1.2-alpha.3'), { core: [0, 1, 2], prerelease: ['alpha', 3] })
  assert.deepEqual(parseVersion('1.2.3-rc.1+build.7'), { core: [1, 2, 3], prerelease: ['rc', 1] })
  assert.deepEqual(parseVersion('0.0.0-dev'), { core: [0, 0, 0], prerelease: ['dev'] })
  assert.equal(parseVersion('not-a-version'), null)
  assert.equal(parseVersion(''), null)
  assert.equal(parseVersion(null), null)
  assert.equal(parseVersion(undefined), null)
})

test('compareVersions follows SemVer precedence', () => {
  assert.ok(compareVersions('0.1.2-alpha.2', '0.1.2-alpha.3') < 0)
  assert.ok(compareVersions('0.1.2-alpha.3', '0.1.2-alpha.10') < 0, 'numeric prerelease identifiers compare numerically')
  assert.ok(compareVersions('0.1.2-alpha.3', '0.1.2') < 0, 'prerelease sorts below release')
  assert.ok(compareVersions('0.1.2', '0.1.1-rc.2') > 0)
  assert.ok(compareVersions('0.1.2-alpha.3', '0.1.1-rc.2') > 0, 'higher core wins over any prerelease')
  assert.ok(compareVersions('0.1.2-alpha', '0.1.2-alpha.1') < 0, 'fewer prerelease fields sort lower')
  assert.equal(compareVersions('0.1.2', '0.1.2'), 0)
  assert.equal(compareVersions('garbage', '0.1.2'), 0, 'unparseable input is unordered, not an error')
})

test('isNewer and channelOf classify versions', () => {
  assert.equal(isNewer('0.1.2-alpha.4', '0.1.2-alpha.3'), true)
  assert.equal(isNewer('0.1.2-alpha.3', '0.1.2-alpha.3'), false)
  assert.equal(isNewer('0.1.1-rc.2', '0.1.2-alpha.3'), false)
  assert.equal(channelOf('0.1.2-alpha.3'), 'alpha')
  assert.equal(channelOf('0.1.1-rc.2'), 'rc')
  assert.equal(channelOf('1.0.0'), null)
  assert.equal(channelOf('not-a-version'), null)
})

test('recommendUpgrade prefers the running channel, then the highest version', () => {
  const distTags = { latest: '0.1.1-rc.2', next: '0.1.1-rc.2', alpha: '0.1.2-alpha.3' }

  // An alpha user on alpha.2 sees the alpha tag.
  const alphaUser = recommendUpgrade({ currentVersion: '0.1.2-alpha.2', distTags })
  assert.equal(alphaUser.hasUpdate, true)
  assert.equal(alphaUser.recommended, '0.1.2-alpha.3')
  assert.equal(alphaUser.tag, 'alpha')
  assert.equal(alphaUser.reason, 'same-channel')

  // The current alpha.3 itself: nothing newer anywhere.
  const current = recommendUpgrade({ currentVersion: '0.1.2-alpha.3', distTags })
  assert.equal(current.hasUpdate, false)
  assert.equal(current.reason, 'up-to-date')
  assert.equal(current.newerVersions.length, 0)

  // A stable 0.1.0 user gets the highest newer version (alpha.3), flagged as
  // a different channel.
  const stableUser = recommendUpgrade({ currentVersion: '0.1.0', distTags })
  assert.equal(stableUser.hasUpdate, true)
  assert.equal(stableUser.recommended, '0.1.2-alpha.3')
  assert.equal(stableUser.reason, 'other-channel')

  // A 0.1.1-rc.1 user sees rc.2 as the same-channel recommendation even
  // though alpha.3 is numerically higher.
  const rcUser = recommendUpgrade({ currentVersion: '0.1.1-rc.1', distTags })
  assert.equal(rcUser.hasUpdate, true)
  assert.equal(rcUser.recommended, '0.1.1-rc.2')
  assert.equal(rcUser.tag, 'latest')
  assert.equal(rcUser.reason, 'same-channel')

  // An unparseable running version never recommends anything.
  const unknown = recommendUpgrade({ currentVersion: 'dev-local', distTags })
  assert.equal(unknown.hasUpdate, false)
  assert.equal(unknown.reason, 'current-version-unparseable')
})

function packumentResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

test('checkUpdate maps a healthy registry response onto a recommendation', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return packumentResponse({
      'dist-tags': { latest: '0.1.1-rc.2', next: '0.1.1-rc.2', alpha: '0.1.2-alpha.3' },
      time: { '0.1.2-alpha.3': '2026-08-31T16:20:52.856Z' },
    })
  }
  const result = await checkUpdate({
    currentVersion: '0.1.2-alpha.2',
    fetchImpl,
    now: () => 1_000,
  })
  assert.equal(result.hasUpdate, true)
  assert.equal(result.recommended, '0.1.2-alpha.3')
  assert.equal(result.recommendedTag, 'alpha')
  assert.equal(result.publishedAt, '2026-08-31T16:20:52.856Z')
  assert.equal(result.checkedAt, 1_000)
  assert.equal(result.error, undefined)
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /registry\.npmjs\.org\/%40deepseek-ai%2Fdsh$/)
  assert.ok(calls[0].init.signal instanceof AbortSignal)
})

test('checkUpdate reports up-to-date without a recommendation', async () => {
  const result = await checkUpdate({
    currentVersion: '0.1.2-alpha.3',
    fetchImpl: async () => packumentResponse({
      'dist-tags': { latest: '0.1.1-rc.2', alpha: '0.1.2-alpha.3' },
      time: {},
    }),
  })
  assert.equal(result.hasUpdate, false)
  assert.equal(result.recommended, null)
  assert.equal(result.publishedAt, null)
})

test('checkUpdate degrades HTTP, malformed, and network failures to an error field', async () => {
  const httpError = await checkUpdate({
    currentVersion: '0.1.0',
    fetchImpl: async () => packumentResponse({}, 503),
  })
  assert.equal(httpError.hasUpdate, false)
  assert.match(httpError.error, /HTTP 503/)

  const malformed = await checkUpdate({
    currentVersion: '0.1.0',
    fetchImpl: async () => packumentResponse({ 'dist-tags': 'oops' }),
  })
  assert.equal(malformed.hasUpdate, false)
  assert.match(malformed.error, /dist-tags/)

  const network = await checkUpdate({
    currentVersion: '0.1.0',
    fetchImpl: async () => { throw new Error('socket hang up') },
  })
  assert.equal(network.hasUpdate, false)
  assert.equal(network.error, 'socket hang up')
})

test('checkUpdate rejects a missing running version before any network call', async () => {
  let called = false
  const result = await checkUpdate({
    currentVersion: undefined,
    fetchImpl: async () => { called = true; return packumentResponse({}) },
  })
  assert.equal(called, false)
  assert.equal(result.hasUpdate, false)
  assert.match(result.error, /current version/)
})

test('checkUpdate honors a custom package name and registry URL', async () => {
  const calls = []
  await checkUpdate({
    currentVersion: '0.1.0',
    packageName: '@deepseek-ai/dsh',
    registryUrl: 'https://registry.npmmirror.com/',
    fetchImpl: async (url) => { calls.push(url); return packumentResponse({ 'dist-tags': {} }) },
  })
  assert.deepEqual(calls, ['https://registry.npmmirror.com/%40deepseek-ai%2Fdsh'])
})
