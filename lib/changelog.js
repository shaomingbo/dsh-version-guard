/**
 * GitHub release-notes parsing for dsh-version-guard: fetch the upstream
 * release for a DSH version and split its bilingual body into per-locale
 * sections. Pure and injectable so tests never touch the network.
 */

export const DEFAULT_REPO = { owner: 'deepseek-ai', repo: 'deepseek-harness' }
const TIMEOUT_MS = 10_000
const LOCALES = new Set(['zh', 'en'])

/** The upstream release tag for a DSH version, e.g. `dsh-v0.1.2-alpha.3`. */
export function releaseTag(version) {
  return `dsh-v${String(version).replace(/^v/, '')}`
}

/**
 * Split a bilingual release body (`<h3 id="cn-…">` … `<h3 id="en-…">` …)
 * into `{ zh, en, raw }`. Bodies without the markers fall back to `raw` only.
 */
export function splitBilingualBody(body) {
  const raw = typeof body === 'string' ? body : ''
  if (raw.length === 0) return { zh: null, en: null, raw: '' }
  const zhMatch = raw.match(/<h3\s+id="cn-[^"]*"[^>]*>/)
  const enMatch = raw.match(/<h3\s+id="en-[^"]*"[^>]*>/)
  if (zhMatch === null && enMatch === null) return { zh: null, en: null, raw }
  const cutTrailer = (text) => text
    .replace(/\n---\s*\n[\s\S]*$/, '\n')
    .replace(/\n+$/, '\n')
    .trim()
  const zhStart = zhMatch === null ? -1 : zhMatch.index
  const enStart = enMatch === null ? -1 : enMatch.index
  const zh = zhStart === -1
    ? null
    : cutTrailer(raw.slice(zhStart, enStart === -1 ? raw.length : enStart))
  const en = enStart === -1
    ? null
    : cutTrailer(raw.slice(enStart, raw.length))
  return { zh, en, raw }
}

function failure(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Fetch the release notes for one DSH version. Never throws: failures
 * degrade to `{ error }`.
 */
export async function fetchChangelog({
  version,
  locale = 'zh',
  owner = DEFAULT_REPO.owner,
  repo = DEFAULT_REPO.repo,
  fetchImpl = globalThis.fetch,
  timeoutMs = TIMEOUT_MS,
  now = Date.now,
} = {}) {
  const fetchedAt = now()
  const base = { version, locale, fetchedAt }
  if (typeof version !== 'string' || version.length === 0) {
    return { ...base, error: 'version is required' }
  }
  if (!LOCALES.has(locale)) {
    return { ...base, error: `unsupported locale: ${locale}` }
  }
  try {
    const tag = releaseTag(version)
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/tags/${encodeURIComponent(tag)}`
    const response = await fetchImpl(url, {
      headers: { accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (response.status === 404) {
      return { ...base, error: `no GitHub release for ${tag}` }
    }
    if (!response.ok) {
      return { ...base, error: `GitHub releases responded with HTTP ${response.status}` }
    }
    const release = await response.json()
    const sections = splitBilingualBody(release?.body)
    const body = sections[locale] ?? sections.raw
    if (typeof body !== 'string' || body.length === 0) {
      return { ...base, error: 'release body is empty' }
    }
    return {
      version,
      locale,
      fetchedAt,
      tag: release?.tag_name ?? tag,
      name: typeof release?.name === 'string' ? release.name : null,
      body,
      rawBody: sections.raw,
      publishedAt: typeof release?.published_at === 'string' ? release.published_at : null,
      htmlUrl: typeof release?.html_url === 'string' ? release.html_url : null,
      localized: sections[locale] !== null,
    }
  } catch (error) {
    return { ...base, error: failure(error) }
  }
}
