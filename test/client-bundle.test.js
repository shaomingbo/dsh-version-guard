import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const clientPath = fileURLToPath(new URL('../lib/client.js', import.meta.url))

test('browser bundle uses the DSH client-module handoff and the settings section', async () => {
  const source = await readFile(clientPath, 'utf8')
  assert.match(source, /window\.__ModuleLoader__\.load/)
  assert.match(source, /id: 'dsh-version-guard'/)
  assert.match(source, /settings\.section/)
  assert.match(source, /connection\.rpc\.call/)
  assert.match(source, /CHANNEL = '\/version-guard'/)
})

test('browser bundle stays out of the sidebar footer the plugins own', async () => {
  // v0.1.1 rendered a sidebar.footer.action entry that crowded the Accounts
  // & Usage dock; the settings section is the agreed placement.
  const source = await readFile(clientPath, 'utf8')
  assert.doesNotMatch(source, /sidebar\.footer\.action/)
  assert.doesNotMatch(source, /shell\.overlay/)
})

test('browser bundle renders version state, changelog, and the pinned command', async () => {
  const source = await readFile(clientPath, 'utf8')
  assert.match(source, /hasUpdate/)
  assert.match(source, /launchCommand/)
  assert.match(source, /navigator\.clipboard\.writeText/)
  assert.match(source, /distTags/)
  assert.match(source, /checkNow/)
})

test('browser bundle degrades gracefully and never blocks the shell', async () => {
  const source = await readFile(clientPath, 'utf8')
  assert.match(source, /\.catch\(/)
  assert.match(source, /console\.error\('\[dsh-version-guard\] apply failed:'/)

  // The client fetches nothing on its own; the host owns the network.
  assert.doesNotMatch(source, /fetch\(/)
})

test('browser bundle ships both locale dictionaries', async () => {
  const source = await readFile(clientPath, 'utf8')
  assert.match(source, /nav: '版本守卫'/)
  assert.match(source, /nav: 'Version Guard'/)
})
