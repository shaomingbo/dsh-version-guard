import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { inject } from '../lib/index.js'

const hostPath = fileURLToPath(new URL('../lib/index.js', import.meta.url))

/**
 * Regression: the first release declared `inject = ['connection']` while
 * calling `ctx.interval(...)`. Cordis backs that API with the `timer`
 * service, so the real runtime failed at boot with "cannot get property
 * 'timer' without inject" — a failure the fake test ctx cannot reproduce,
 * because it hands out properties without Cordis's inject proxy semantics.
 * These assertions pin the contract at the source level instead.
 */
test('inject declares every Cordis service the host touches', async () => {
  const source = await readFile(hostPath, 'utf8')
  assert.ok(Array.isArray(inject), 'inject must be an exported array')
  for (const service of ['connection', 'timer']) {
    assert.ok(inject.includes(service), `inject must declare "${service}"`)
  }
  // Any ctx.<name> access outside logger/effect must appear in inject.
  const undeclared = [...source.matchAll(/ctx\.(?!interval\b|logger\b|effect\b)([a-z][a-zA-Z]*)/g)]
    .map((match) => match[1])
    .filter((name) => !inject.includes(name))
  assert.deepEqual(undeclared, [], `ctx services used but not declared in inject: ${undeclared.join(', ')}`)
})

test('ctx.interval usage stays declared with the timer service', async () => {
  const source = await readFile(hostPath, 'utf8')
  if (source.includes('ctx.interval(')) {
    assert.ok(inject.includes('timer'), 'ctx.interval requires the timer service in inject')
  }
})
