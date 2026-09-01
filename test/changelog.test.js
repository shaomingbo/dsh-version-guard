import assert from 'node:assert/strict'
import test from 'node:test'

import { fetchChangelog, releaseTag, splitBilingualBody } from '../lib/changelog.js'

const BILINGUAL_BODY = `[中文](#cn-v0.1.2-alpha.3) | [English](#en-v0.1.2-alpha.3)

<h3 id="cn-v0.1.2-alpha.3">体验优化</h3>

* 长会话右侧导航支持预览和跳转 @someone

<h3>问题修复</h3>

* 修复后端卡顿误判断连 @imccyu

---

<h3 id="en-v0.1.2-alpha.3">Improvements</h3>

* Preview and jump to all paginated turns @someone

<h3>Bug Fixes</h3>

* Fix backend stalls being mistaken for disconnects @imccyu

---

Full Changelog: https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.2-alpha.2...dsh-v0.1.2-alpha.3
`

test('releaseTag normalizes the v prefix', () => {
  assert.equal(releaseTag('0.1.2-alpha.3'), 'dsh-v0.1.2-alpha.3')
  assert.equal(releaseTag('v0.1.2'), 'dsh-v0.1.2')
})

test('splitBilingualBody separates the zh and en sections and trims the trailer', () => {
  const sections = splitBilingualBody(BILINGUAL_BODY)
  assert.match(sections.zh, /体验优化/)
  assert.match(sections.zh, /长会话右侧导航/)
  assert.doesNotMatch(sections.zh, /Full Changelog/)
  assert.doesNotMatch(sections.zh, /Improvements/)
  assert.match(sections.en, /Improvements/)
  assert.match(sections.en, /paginated turns/)
  assert.doesNotMatch(sections.en, /体验优化/)
  assert.doesNotMatch(sections.en, /Full Changelog/)
})

test('splitBilingualBody degrades monolingual and empty bodies to raw', () => {
  const plain = splitBilingualBody('Just some notes.\n- item one\n')
  assert.equal(plain.zh, null)
  assert.equal(plain.en, null)
  assert.match(plain.raw, /item one/)

  const empty = splitBilingualBody('')
  assert.equal(empty.raw, '')
  assert.equal(empty.zh, null)

  const junk = splitBilingualBody(undefined)
  assert.equal(junk.raw, '')
})

test('fetchChangelog returns the requested locale with metadata', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return {
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'dsh-v0.1.2-alpha.3',
        name: 'v0.1.2-alpha.3',
        body: BILINGUAL_BODY,
        published_at: '2026-08-31T16:03:39Z',
        html_url: 'https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-alpha.3',
      }),
    }
  }
  const zh = await fetchChangelog({ version: '0.1.2-alpha.3', locale: 'zh', fetchImpl, now: () => 5 })
  assert.equal(zh.error, undefined)
  assert.match(zh.body, /体验优化/)
  assert.equal(zh.localized, true)
  assert.equal(zh.publishedAt, '2026-08-31T16:03:39Z')
  assert.equal(zh.fetchedAt, 5)
  assert.match(zh.htmlUrl, /releases\/tag\//)

  const en = await fetchChangelog({ version: '0.1.2-alpha.3', locale: 'en', fetchImpl })
  assert.match(en.body, /Improvements/)
  assert.equal(calls.length, 2)
  assert.match(calls[0].url, /releases\/tags\/dsh-v0\.1\.2-alpha\.3$/)
})

test('fetchChangelog falls back to the raw body when the locale section is missing', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ tag_name: 'dsh-v0.1.0', body: 'Plain notes only.', published_at: null, html_url: null }),
  })
  const result = await fetchChangelog({ version: '0.1.0', locale: 'zh', fetchImpl })
  assert.equal(result.error, undefined)
  assert.equal(result.localized, false)
  assert.match(result.body, /Plain notes only\./)
})

test('fetchChangelog degrades 404, HTTP errors, empty bodies, and network failures', async () => {
  const missing = await fetchChangelog({
    version: '9.9.9',
    fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }),
  })
  assert.match(missing.error, /no GitHub release/)

  const serverError = await fetchChangelog({
    version: '0.1.0',
    fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({}) }),
  })
  assert.match(serverError.error, /HTTP 502/)

  const emptyBody = await fetchChangelog({
    version: '0.1.0',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ tag_name: 'dsh-v0.1.0', body: '' }) }),
  })
  assert.match(emptyBody.error, /empty/)

  const network = await fetchChangelog({
    version: '0.1.0',
    fetchImpl: async () => { throw new Error('rate limit exceeded') },
  })
  assert.equal(network.error, 'rate limit exceeded')
})

test('fetchChangelog validates its inputs without touching the network', async () => {
  let called = false
  const fetchImpl = async () => { called = true }
  assert.match((await fetchChangelog({ version: '', fetchImpl })).error, /required/)
  assert.match((await fetchChangelog({ version: '0.1.0', locale: 'fr', fetchImpl })).error, /locale/)
  assert.equal(called, false)
})
