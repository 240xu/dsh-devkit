import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePaletteQuery, pushMru, applyMruRank, ProbeCache, MRU_CAP, MRU_KEY } from '../src/core.js'

// --- parsePaletteQuery ---------------------------------------------------------

test('prefix routing: > is command mode', () => {
  assert.deepEqual(parsePaletteQuery('>se'), { mode: 'commands', rest: 'se' })
})
test('prefix routing: # is session search mode', () => {
  assert.deepEqual(parsePaletteQuery('#报错'), { mode: 'sessions', rest: '报错' })
})
test('prefix routing: @ is plugin group mode', () => {
  assert.deepEqual(parsePaletteQuery('@devkit'), { mode: 'plugins', rest: 'devkit' })
})
test('no prefix = mixed mode, query passed through', () => {
  assert.deepEqual(parsePaletteQuery('删 会话'), { mode: 'mixed', rest: '删 会话' })
})
test('bare prefix yields empty rest (full list of that mode)', () => {
  assert.deepEqual(parsePaletteQuery('#'), { mode: 'sessions', rest: '' })
  assert.deepEqual(parsePaletteQuery('>'), { mode: 'commands', rest: '' })
})
test('null/undefined input degrades to mixed with empty rest', () => {
  assert.deepEqual(parsePaletteQuery(null), { mode: 'mixed', rest: '' })
  assert.deepEqual(parsePaletteQuery(undefined), { mode: 'mixed', rest: '' })
})
test('prefix mid-string is not a mode switch', () => {
  assert.deepEqual(parsePaletteQuery('a#b'), { mode: 'mixed', rest: 'a#b' })
})

// --- MRU ring + ranking ----------------------------------------------------------

test('pushMru moves to front and dedupes', () => {
  let l = pushMru([], 'a')
  l = pushMru(l, 'b')
  l = pushMru(l, 'a')
  assert.deepEqual(l, ['a', 'b'])
})

test('pushMru caps at 20 (ring drop of oldest)', () => {
  let l = []
  for (let i = 0; i < 25; i++) l = pushMru(l, 'c' + i)
  assert.equal(l.length, MRU_CAP)
  assert.equal(l[0], 'c24')
  assert.equal(l.includes('c0'), false)
  assert.equal(l.includes('c19'), true)
})

test('pushMru does not mutate the input list', () => {
  const orig = ['a', 'b']
  const next = pushMru(orig, 'c')
  assert.deepEqual(orig, ['a', 'b'])
  assert.deepEqual(next, ['c', 'a', 'b'])
})

test('applyMruRank puts recorded ids first, keeps their MRU order', () => {
  const items = [{ id: 'x' }, { id: 'y' }, { id: 'z' }]
  const out = applyMruRank(items, ['z', 'x'])
  assert.deepEqual(out.map((i) => i.id), ['z', 'x', 'y'])
})

test('applyMruRank is stable for never-used items', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.deepEqual(applyMruRank(items, []).map((i) => i.id), ['a', 'b', 'c'])
  assert.deepEqual(applyMruRank(items, ['nope']).map((i) => i.id), ['a', 'b', 'c'])
})

test('applyMruRank handles empty/null mru', () => {
  const items = [{ id: 'a' }]
  assert.deepEqual(applyMruRank(items, null).map((i) => i.id), ['a'])
})

test('MRU_KEY is the documented localStorage key', () => {
  assert.equal(MRU_KEY, 'dsh-devkit-mru')
})

// --- ProbeCache -------------------------------------------------------------------

test('probe returns true on res.ok and false on 404', async () => {
  const pc = new ProbeCache({ fetchImpl: async (url) => (url.includes('ok') ? { ok: true } : { ok: false }) })
  assert.equal(await pc.probe('/ok'), true)
  assert.equal(await pc.probe('/missing'), false)
})

test('probe treats network throw as absent (fail-soft)', async () => {
  const pc = new ProbeCache({ fetchImpl: async () => { throw new Error('ECONNREFUSED') } })
  assert.equal(await pc.probe('/anything'), false)
})

test('probe caches within ttl and refetches after expiry', async () => {
  let calls = 0
  let now = 1000
  const pc = new ProbeCache({
    fetchImpl: async () => { calls++; return { ok: true } },
    ttlMs: 500,
    now: () => now,
  })
  assert.equal(await pc.probe('/x'), true)
  assert.equal(await pc.probe('/x'), true)
  assert.equal(calls, 1)
  now += 600
  assert.equal(await pc.probe('/x'), true)
  assert.equal(calls, 2)
})

test('probe without fetchImpl resolves false (no crash)', async () => {
  const pc = new ProbeCache({ fetchImpl: null })
  assert.equal(await pc.probe('/x'), false)
})

test('probe with fetchImpl null falls back to global fetch when present', async () => {
  let called = false
  const g = globalThis
  const saved = g.fetch
  g.fetch = async () => { called = true; return { ok: true } }
  try {
    const pc = new ProbeCache({ fetchImpl: null })
    assert.equal(await pc.probe('/x'), true)
    assert.equal(called, true)
  } finally {
    g.fetch = saved
  }
})
