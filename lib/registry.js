/**
 * npm registry queries for dsh-version-guard: fetch the packument for the
 * DSH launcher package, compare the running version against every dist-tag,
 * and recommend the closest upgrade. Pure and injectable so tests never touch
 * the network.
 */

export const DEFAULT_PACKAGE = '@deepseek-ai/dsh'
export const DEFAULT_REGISTRY = 'https://registry.npmjs.org'
const TIMEOUT_MS = 10_000

const PRERELEASE_CHANNELS = new Set(['alpha', 'beta', 'rc', 'dev', 'next'])

/**
 * Parse a SemVer string into comparable parts. Returns null for anything the
 * build tooling could plausibly produce but SemVer cannot order (local
 * `link:` dev versions, `0.0.0`, git descriptors).
 */
export function parseVersion(version) {
  if (typeof version !== 'string') return null
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/)
  if (!match) return null
  const core = [Number(match[1]), Number(match[2]), Number(match[3])]
  const prerelease = match[4] === undefined ? [] : match[4].split('.').map((part) => {
    const numeric = /^\d+$/.test(part) ? Number(part) : part
    return numeric
  })
  return { core, prerelease }
}

function comparePrereleasePart(a, b) {
  const aNumeric = typeof a === 'number'
  const bNumeric = typeof b === 'number'
  if (aNumeric && bNumeric) return a - b
  if (aNumeric) return -1
  if (bNumeric) return 1
  return a < b ? -1 : a > b ? 1 : 0
}

/** Full SemVer ordering, including prerelease precedence rules. */
export function compareVersions(a, b) {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (left === null || right === null) return 0
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) return left.core[index] - right.core[index]
  }
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0
  if (left.prerelease.length === 0) return 1
  if (right.prerelease.length === 0) return -1
  const shared = Math.min(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < shared; index += 1) {
    const ordering = comparePrereleasePart(left.prerelease[index], right.prerelease[index])
    if (ordering !== 0) return ordering
  }
  return left.prerelease.length - right.prerelease.length
}

export function isNewer(candidate, current) {
  return compareVersions(candidate, current) > 0
}

/** The prerelease channel of a version: 'alpha', 'rc', or null for releases. */
export function channelOf(version) {
  const parsed = parseVersion(version)
  if (parsed === null || parsed.prerelease.length === 0) return null
  const identifier = parsed.prerelease[0]
  const name = typeof identifier === 'string' ? identifier.toLowerCase() : ''
  for (const channel of PRERELEASE_CHANNELS) {
    if (name === channel || name.startsWith(`${channel}.`) || name.startsWith(`${channel}-`)) return channel
  }
  return name || null
}

function dedupeSortedDesc(values) {
  const unique = [...new Set(values.filter((value) => parseVersion(value) !== null))]
  return unique.sort((a, b) => compareVersions(b, a))
}

/**
 * Recommend the best upgrade target: among dist-tag versions strictly newer
 * than the running one, prefer the running version's own channel (an alpha
 * user follows alpha), then the highest version overall.
 */
export function recommendUpgrade({ currentVersion, distTags = {} }) {
  const parsed = parseVersion(currentVersion)
  if (parsed === null) {
    return { hasUpdate: false, reason: 'current-version-unparseable', recommended: null, tag: null, newerVersions: [] }
  }
  const currentChannel = channelOf(currentVersion)
  const newer = dedupeSortedDesc(Object.values(distTags)).filter((version) => isNewer(version, currentVersion))
  if (newer.length === 0) {
    return { hasUpdate: false, reason: 'up-to-date', recommended: null, tag: null, newerVersions: [] }
  }
  const tagFor = (version) => Object.entries(distTags).find(([, value]) => value === version)?.[0] ?? null
  const sameChannel = newer.filter((version) => currentChannel !== null && channelOf(version) === currentChannel)
  const recommended = (sameChannel[0] ?? newer[0])
  return {
    hasUpdate: true,
    reason: sameChannel.includes(recommended) ? 'same-channel' : 'other-channel',
    recommended,
    tag: tagFor(recommended),
    newerVersions: newer,
  }
}

function fetchFailure(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Query the registry and evaluate the running version against dist-tags.
 * Never throws: failures degrade to `{ hasUpdate: false, error }`.
 */
export async function checkUpdate({
  currentVersion,
  packageName = DEFAULT_PACKAGE,
  registryUrl = DEFAULT_REGISTRY,
  fetchImpl = globalThis.fetch,
  timeoutMs = TIMEOUT_MS,
  now = Date.now,
} = {}) {
  const checkedAt = now()
  const base = { currentVersion, checkedAt, distTags: {}, hasUpdate: false }
  if (typeof currentVersion !== 'string' || currentVersion.length === 0) {
    return { ...base, error: 'current version unavailable' }
  }
  try {
    const url = `${String(registryUrl).replace(/\/+$/, '')}/${encodeURIComponent(packageName)}`
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) {
      return { ...base, error: `registry responded with HTTP ${response.status}` }
    }
    const packument = await response.json()
    const distTags = packument?.['dist-tags']
    if (distTags === null || typeof distTags !== 'object' || Array.isArray(distTags)) {
      return { ...base, error: 'registry response has no dist-tags object' }
    }
    const tags = {}
    for (const [tag, version] of Object.entries(distTags)) {
      if (typeof version === 'string') tags[tag] = version
    }
    const time = packument?.time
    const recommendation = recommendUpgrade({ currentVersion, distTags: tags })
    const publishedAt = recommendation.recommended !== null
      && time !== null && typeof time === 'object'
      && typeof time[recommendation.recommended] === 'string'
      ? time[recommendation.recommended]
      : null
    return {
      currentVersion,
      checkedAt,
      distTags: tags,
      hasUpdate: recommendation.hasUpdate,
      recommended: recommendation.recommended,
      recommendedTag: recommendation.tag,
      recommendationReason: recommendation.reason,
      newerVersions: recommendation.newerVersions,
      publishedAt,
    }
  } catch (error) {
    return { ...base, error: fetchFailure(error) }
  }
}
