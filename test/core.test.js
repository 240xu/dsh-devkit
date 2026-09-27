import test from 'node:test'
import assert from 'node:assert/strict'
import { BUILTIN_COMMANDS, SHORTCUTS, VERSION, matchCommands, isTextInputTarget, ChordResolver } from '../src/core.js'

// --- BUILTIN_COMMANDS shape -------------------------------------------------

test('builtin commands carry id/title/keywords', () => {
  assert.ok(BUILTIN_COMMANDS.length >= 8)
  for (const c of BUILTIN_COMMANDS) {
    assert.match(c.id, /^devkit\./)
    assert.ok(c.titleZh && c.titleEn)
    assert.ok(Array.isArray(c.keywordsZh) && c.keywordsZh.length > 0)
  }
})

test('shortcut sheet is non-empty and mentions the chord', () => {
  assert.ok(SHORTCUTS.some((s) => s.keys === 'Ctrl+K Ctrl+S'))
})

test('VERSION is a semver string', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+/)
})

// --- matchCommands -----------------------------------------------------------

test('empty query returns all commands', () => {
  assert.equal(matchCommands(BUILTIN_COMMANDS, '').length, BUILTIN_COMMANDS.length)
  assert.equal(matchCommands(BUILTIN_COMMANDS, '   ').length, BUILTIN_COMMANDS.length)
  assert.equal(matchCommands(BUILTIN_COMMANDS, null).length, BUILTIN_COMMANDS.length)
})

test('matches by zh title substring', () => {
  const ids = matchCommands(BUILTIN_COMMANDS, '切换').map((c) => c.id)
  assert.ok(ids.includes('devkit.session.switch'))
  assert.ok(!ids.includes('devkit.shortcuts'))
})

test('matches by english keyword with english language', () => {
  const ids = matchCommands(BUILTIN_COMMANDS, 'switch', 'en').map((c) => c.id)
  assert.ok(ids.includes('devkit.session.switch'))
})

test('matches by id even in zh language', () => {
  const ids = matchCommands(BUILTIN_COMMANDS, 'exportMarkdown').map((c) => c.id)
  assert.deepEqual(ids, ['devkit.session.exportMarkdown'])
})

test('multi-token queries AND across tokens', () => {
  assert.deepEqual(
    matchCommands(BUILTIN_COMMANDS, '会话 删除').map((c) => c.id),
    ['devkit.session.delete'],
  )
  // either token alone hits several
  assert.ok(matchCommands(BUILTIN_COMMANDS, '会话').length > 1)
})

test('keywords hit: 中文 shortcut keyword for the sheet', () => {
  const ids = matchCommands(BUILTIN_COMMANDS, '键位').map((c) => c.id)
  assert.deepEqual(ids, ['devkit.shortcuts'])
})

test('no match yields empty list (palette shows 没有匹配命令)', () => {
  assert.deepEqual(matchCommands(BUILTIN_COMMANDS, 'zzz不存在'), [])
})

test('matching is case-insensitive', () => {
  assert.ok(matchCommands(BUILTIN_COMMANDS, 'DEVKIT').length === BUILTIN_COMMANDS.length)
  assert.ok(matchCommands(BUILTIN_COMMANDS, 'Markdown').length >= 1)
})

// --- isTextInputTarget --------------------------------------------------------

test('text inputs are detected for keyboard exemption', () => {
  assert.equal(isTextInputTarget({ tagName: 'INPUT' }), true)
  assert.equal(isTextInputTarget({ tagName: 'textarea' }), true)
  assert.equal(isTextInputTarget({ tagName: 'SELECT' }), true)
  assert.equal(isTextInputTarget({ tagName: 'DIV', isContentEditable: true }), true)
})

test('non-text targets and null pass through', () => {
  assert.equal(isTextInputTarget({ tagName: 'DIV' }), false)
  assert.equal(isTextInputTarget({ tagName: 'BODY' }), false)
  assert.equal(isTextInputTarget(null), false)
  assert.equal(isTextInputTarget(undefined), false)
})

// --- ChordResolver --------------------------------------------------------------

test('Ctrl+K opens the palette and arms the chord', () => {
  const r = new ChordResolver()
  const res = r.feed({ ctrlKey: true, shiftKey: false, key: 'k' }, 1000)
  assert.equal(res.action, 'palette')
  assert.equal(res.consume, true)
})

test('Ctrl+K Ctrl+S within window opens the shortcut sheet', () => {
  const r = new ChordResolver()
  r.feed({ ctrlKey: true, shiftKey: false, key: 'k' }, 1000)
  const res = r.feed({ ctrlKey: true, shiftKey: false, key: 's' }, 2000)
  assert.equal(res.action, 'shortcuts')
  assert.equal(res.consume, true)
})

test('Ctrl+K Ctrl+S after the window decays to plain palette already open', () => {
  const r = new ChordResolver({ chordWindowMs: 1500 })
  r.feed({ ctrlKey: true, shiftKey: false, key: 'k' }, 1000)
  const res = r.feed({ ctrlKey: true, shiftKey: false, key: 's' }, 1000 + 1600)
  assert.equal(res.action, null)
})

test('Ctrl+Shift+P opens the palette directly', () => {
  const r = new ChordResolver()
  const res = r.feed({ ctrlKey: true, shiftKey: true, key: 'p' }, 1000)
  assert.equal(res.action, 'palette')
  assert.equal(res.consume, true)
})

test('plain Ctrl+S without a chord is not consumed (browser save)', () => {
  const r = new ChordResolver()
  const res = r.feed({ ctrlKey: true, shiftKey: false, key: 's' }, 1000)
  assert.equal(res.action, null)
  assert.equal(res.consume, false)
})

test('other keys disarm the chord silently', () => {
  const r = new ChordResolver()
  r.feed({ ctrlKey: true, shiftKey: false, key: 'k' }, 1000)
  const res = r.feed({ ctrlKey: false, shiftKey: false, key: 'x' }, 1100)
  assert.equal(res.action, null)
  assert.equal(res.consume, false)
  // chord disarmed: Ctrl+S is no longer a sheet shortcut
  const res2 = r.feed({ ctrlKey: true, shiftKey: false, key: 's' }, 1200)
  assert.equal(res2.action, null)
})

test('key case does not matter', () => {
  const r = new ChordResolver()
  assert.equal(r.feed({ ctrlKey: true, shiftKey: false, key: 'K' }, 1).action, 'palette')
  assert.equal(r.feed({ ctrlKey: true, shiftKey: false, key: 'S' }, 2).action, 'shortcuts')
})
