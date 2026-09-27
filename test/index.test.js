import test from 'node:test'
import assert from 'node:assert/strict'

// Server half: import the ESM module and exercise the registered HTTP
// handlers with minimal req/res doubles — no live host needed.
process.env.DSH_VERSION = 'test-9.9.9'

const mod = await import('../src/index.js')

function makeHost() {
  const routes = new Map()
  return {
    routes,
    register(spec) { routes.set(spec.path, spec.handler) },
  }
}

test('plugin exports follow the cordis bundle rule', () => {
  assert.equal(mod.name, 'dsh-devkit')
  assert.deepEqual(mod.inject, [])
  assert.equal(typeof mod.apply, 'function')
  assert.equal(typeof mod.default.apply, 'function')
})

test('routes register with or without a pre-existing webServer', async () => {
  // with webServer present at apply time
  const ctxA = { get: () => ({ register() {} }), inject() {}, effect(fn) { fn() } }
  mod.apply(ctxA)
  // without webServer -> deferred inject
  let injected = null
  const ctxB = {
    get: () => undefined,
    inject(deps, fn) { injected = { deps, fn } },
    effect(fn) { fn() },
  }
  mod.apply(ctxB)
  assert.deepEqual(injected.deps, ['webServer'])
  const sub = { webServer: makeHost(), effect(fn) { fn() } }
  injected.fn(sub)
  assert.ok(sub.webServer.routes.has('/api/devkit/commands'))
  assert.ok(sub.webServer.routes.has('/api/devkit/health'))
})

function resDouble() {
  const res = {
    headers: null, body: null, status: 0,
    writeHead(status, headers) { res.status = status; res.headers = headers },
    end(body) { res.body = body },
  }
  return res
}

test('GET /api/devkit/commands returns builtin metadata + shortcuts', async () => {
  const host = makeHost()
  const ctx = { get: () => undefined, inject(deps, fn) { fn({ webServer: host, effect(fn) { fn() } }) }, effect(fn) { fn() } }
  mod.apply(ctx)
  const handler = host.routes.get('/api/devkit/commands')
  const res = resDouble()
  await handler({ method: 'GET' }, res)
  const data = JSON.parse(res.body)
  assert.equal(res.status, 200)
  assert.equal(data.ok, true)
  assert.ok(Array.isArray(data.commands) && data.commands.length >= 8)
  assert.ok(data.commands.every((c) => c.id.startsWith('devkit.')))
  assert.ok(Array.isArray(data.shortcuts))
})

test('commands endpoint rejects non-GET', async () => {
  const host = makeHost()
  const ctx = { get: () => undefined, inject(deps, fn) { fn({ webServer: host, effect(fn) { fn() } }) }, effect(fn) { fn() } }
  mod.apply(ctx)
  const res = resDouble()
  await host.routes.get('/api/devkit/commands')({ method: 'POST' }, res)
  assert.equal(res.status, 405)
})

test('GET /api/devkit/health reports plugin facts', async () => {
  const host = makeHost()
  const ctx = { get: () => undefined, inject(deps, fn) { fn({ webServer: host, effect(fn) { fn() } }) }, effect(fn) { fn() } }
  mod.apply(ctx)
  const res = resDouble()
  await host.routes.get('/api/devkit/health')({ method: 'GET' }, res)
  const data = JSON.parse(res.body)
  assert.equal(res.status, 200)
  assert.equal(data.ok, true)
  assert.equal(data.plugin, '@240xu/dsh-devkit')
  assert.match(data.version, /^\d+\.\d+\.\d+/)
  assert.ok(data.node.startsWith('v'))
  assert.equal(data.dsh, 'test-9.9.9')
  assert.ok(data.commands >= 8)
  assert.ok(res.headers['content-type'].includes('application/json'))
})

test('health endpoint rejects non-GET', async () => {
  const host = makeHost()
  const ctx = { get: () => undefined, inject(deps, fn) { fn({ webServer: host, effect(fn) { fn() } }) }, effect(fn) { fn() } }
  mod.apply(ctx)
  const res = resDouble()
  await host.routes.get('/api/devkit/health')({ method: 'DELETE' }, res)
  assert.equal(res.status, 405)
})
