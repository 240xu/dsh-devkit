import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

// REAL EXECUTION smoke test: src/client.js is a classic script that normally
// only runs in the browser bundle. Here we load it in a vm context with
// minimal window/document/React stubs and drive the factory for real —
// registry population, public API, dedup semantics, keyboard wiring and the
// toast DOM path are exercised, not just type-checked.

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const CODE = fs.readFileSync(path.join(ROOT, 'src', 'client.js'), 'utf8')

const noop = () => {}

function makeCtx(capturedSlots) {
  return {
    get: () => undefined,
    inject: noop,
    effect: (fn) => fn(),
    slots: {
      inject: (slot, reg) => { (capturedSlots[slot] = capturedSlots[slot] || []).push(reg) },
      register: () => ({}),
    },
  }
}

function makeEnv() {
  const noop = () => {}
  const captured = { loaded: null, events: [], keyHandlers: [], warns: [] }
  const fakeElement = () => ({
    style: { cssText: '' },
    setAttribute: noop, appendChild: noop, remove: noop, addEventListener: noop,
    querySelector: () => null, querySelectorAll: () => [],
    classList: { add: noop },
    textContent: '',
  })
  const window = {
    __ModuleLoader__: { load: (def) => { captured.loaded = def } },
    addEventListener: (type, fn) => { if (type === 'keydown') captured.keyHandlers.push(fn) },
    removeEventListener: noop,
    dispatchEvent: (ev) => { captured.events.push(ev); return true },
    localStorage: { getItem: () => null, setItem: noop },
  }
  const document = {
    querySelector: () => null,
    getElementById: () => null,
    createElement: fakeElement,
    head: { appendChild: noop },
    body: { appendChild: noop },
    activeElement: null,
  }
  const React = {
    Fragment: 'Fragment',
    createElement: (type, props, children) => ({ type, props, children }),
    useCallback: (fn) => fn,
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useRef: (v) => ({ current: v === undefined ? null : v }),
    useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  }
  const require = (name) => {
    if (name === 'react') return React
    throw new Error('unexpected require: ' + name)
  }
  class CustomEvent {
    constructor(type, opts) { this.type = type; this.detail = opts && opts.detail }
  }
  const sandbox = {
    window, document, require, CustomEvent,
    navigator: { language: 'zh-CN', languages: ['zh-CN'] },
    console: { warn: (m) => captured.warns.push(m), error: noop, log: noop },
    setTimeout: () => 0, clearTimeout: noop,
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(CODE, sandbox, { filename: 'client.js' })
  return { sandbox, captured }
}

test('client factory executes headlessly and exposes the public API', () => {
  const { sandbox, captured } = makeEnv()
  assert.ok(captured.loaded, 'ModuleLoader.load was not called')
  assert.equal(captured.loaded.id, '@240xu/dsh-devkit')
  const exports = captured.loaded.factory(sandbox.require)
  assert.equal(typeof exports.apply, 'function')
  assert.equal(JSON.stringify(exports.inject), JSON.stringify(['slots'])) // cross-realm array: compare serialized
  assert.ok(sandbox.window.__dshDevkit, 'window.__dshDevkit not exposed')
  // drive the real apply() path: builtins, probe-gated commands and the
  // keyboard layer all live there, not in the factory
  exports.apply(makeCtx({}))
  assert.ok(sandbox.window.__dshDevkit.listCommands().length >= 9, 'apply() did not populate the registry')
  assert.equal(typeof sandbox.window.__dshDevkit.registerCommand, 'function')
  assert.equal(typeof sandbox.window.__dshDevkit.toast, 'function')
})

test('factory real-run registers exactly the 9 built-in commands', () => {
  const { sandbox, captured } = makeEnv()
  captured.loaded.factory(sandbox.require).apply(makeCtx({}))
  const ids = sandbox.window.__dshDevkit.listCommands().map((c) => c.id)
  assert.equal(JSON.stringify(ids), JSON.stringify([
    'devkit.session.switch',
    'devkit.session.new',
    'devkit.session.delete',
    'devkit.session.exportMarkdown',
    'devkit.messageOps',
    'devkit.websearch.settings',
    'devkit.session.copyId',
    'devkit.devinfo',
    'devkit.shortcuts',
  ])) // cross-realm array
})

test('registerCommand: same id + same run is idempotent (same unregister)', () => {
  const { sandbox, captured } = makeEnv()
  captured.loaded.factory(sandbox.require)
  const api = sandbox.window.__dshDevkit
  const before = api.listCommands().length
  const run = () => {}
  const un1 = api.registerCommand({ id: 'ext.x', title: 'X', run })
  const un2 = api.registerCommand({ id: 'ext.x', title: 'X', run })
  assert.equal(un1, un2, 'idempotent re-registration must return the original unregister')
  assert.equal(api.listCommands().length, before + 1)
})

test('registerCommand: same id + different run warns and is ignored, never throws', () => {
  const { sandbox, captured } = makeEnv()
  captured.loaded.factory(sandbox.require)
  const api = sandbox.window.__dshDevkit
  const before = api.listCommands().length
  const un = api.registerCommand({ id: 'ext.y', title: 'Y', run: () => {} })
  api.registerCommand({ id: 'ext.y', title: 'Y (other)', run: () => 'other' })
  assert.ok(captured.warns.some((w) => String(w).includes('ext.y')), 'console.warn missing for conflicting id')
  assert.equal(api.listCommands().length, before + 1)
  un()
  assert.equal(api.listCommands().length, before)
})

test('keyboard layer: Ctrl+K in a non-input target opens the palette', () => {
  const { sandbox, captured } = makeEnv()
  captured.loaded.factory(sandbox.require).apply(makeCtx({}))
  assert.ok(captured.keyHandlers.length === 1, 'expected exactly one capture-phase keydown handler')
  const handler = captured.keyHandlers[0]
  handler({
    ctrlKey: true, shiftKey: false, key: 'k',
    target: { tagName: 'DIV', isContentEditable: false },
    preventDefault: () => {}, stopPropagation: () => {},
  })
  const ev = captured.events.find((e) => e.type === 'dsh-devkit:open')
  assert.ok(ev, 'OPEN_EVENT not dispatched')
  assert.equal(ev.detail.mode, 'palette')
})

test('keyboard layer: keys typed in a text input do not trigger chords', () => {
  const { sandbox, captured } = makeEnv()
  captured.loaded.factory(sandbox.require).apply(makeCtx({}))
  const handler = captured.keyHandlers[0]
  const before = captured.events.length
  handler({
    ctrlKey: true, shiftKey: false, key: 'k',
    target: { tagName: 'INPUT', isContentEditable: false },
    preventDefault: () => {}, stopPropagation: () => {},
  })
  assert.equal(captured.events.length, before, 'chord fired inside a text input — exemption broken')
})

test('toast executes the DOM path without crashing headlessly', () => {
  const { sandbox, captured } = makeEnv()
  captured.loaded.factory(sandbox.require)
  assert.doesNotThrow(() => sandbox.window.__dshDevkit.toast('hi', { kind: 'ok' }))
  assert.doesNotThrow(() => sandbox.window.__dshDevkit.toast('bye', { kind: 'unknown-kind' }))
})

test('apply() adopts sessions and uiWorkspace services (deferred inject wiring)', () => {
  const { sandbox, captured } = makeEnv()
  const injected = []
  const services = {
    sessions: { list: { getSnapshot: () => ({ ids: [], byId: {} }) }, refresh: () => {} },
  }
  const ctx = {
    // uiWorkspace deliberately absent: apply() must register a deferred
    // inject for it so a late-arriving runtime still gets adopted.
    get: (name) => services[name],
    inject: (deps, fn) => injected.push({ deps }),
    effect: (fn) => fn(),
    slots: { inject: noop, register: () => ({}) },
  }
  captured.loaded.factory(sandbox.require).apply(ctx)
  assert.ok(injected.some((x) => x && x.deps && x.deps.includes('uiWorkspace')), 'uiWorkspace deferred inject missing')
})

test('client VERSION literal stays in lockstep with package.json', () => {
  const { sandbox, captured } = makeEnv()
  captured.loaded.factory(sandbox.require)
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  assert.equal(sandbox.window.__dshDevkit.version, pkg.version)
})
