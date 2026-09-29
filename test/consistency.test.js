import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

// DUAL-SOURCE guard: client.js is a classic script and cannot import
// core.js, so it carries thin copies of the key pure functions. This test
// hashes both copies and fails when they drift apart (fix one, fix both).

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const core = fs.readFileSync(path.join(ROOT, 'src', 'core.js'), 'utf8')
const client = fs.readFileSync(path.join(ROOT, 'src', 'client.js'), 'utf8')

// Extract a named function (or class) declaration up to a balanced closing
// brace, starting at column 0 of its line.
function extract(src, name) {
  const start = src.search(new RegExp('^\\s*(export )?(async )?(function ' + name + '\\b|class ' + name + '\\b)', 'm'))
  if (start < 0) return null
  const bodyStart = src.indexOf('{', start)
  let depth = 0
  for (let i = bodyStart; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  return null
}

function normalize(src) {
  return String(src)
    .replace(/\r\n/g, '\n')
    .replace(/^\s*\/\/.*$/gm, '') // strip line comments (copy-local notes are allowed)
    .replace(/^\s*(export |async )+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function hashPair(name) {
  const a = normalize(extract(core, name))
  const b = normalize(extract(client, name))
  const h = (s) => createHash('sha256').update(s || 'MISSING').digest('hex').slice(0, 16)
  return { a: h(a), b: h(b), present: !!(a && b) }
}

const KEY_FUNCTIONS = ['matchCommands', 'isTextInputTarget', 'parsePaletteQuery', 'pushMru', 'applyMruRank', 'pluginSource', 'sortCommandsBySource', 'normalizeSearchResults', 'feed'] // feed = ChordResolver.feed method

test('dual-source thin copies are in sync (core.js vs client.js)', () => {
  const report = KEY_FUNCTIONS.map((name) => {
    if (name === 'feed') {
      // client.js defines ChordResolver as a class with a feed method.
      const m = client.match(/\n(\s+)feed\(ev, now\) \{[\s\S]*?\n\1\}/)
      const c = core.match(/\n(\s+)feed\(ev, now\) \{[\s\S]*?\n\1\}/)
      assert.ok(c, 'core.js ChordResolver.feed not found')
      assert.ok(m, 'client.js ChordResolver.feed not found')
      const ha = createHash('sha256').update(normalize(c[0])).digest('hex').slice(0, 16)
      const hb = createHash('sha256').update(normalize(m[0])).digest('hex').slice(0, 16)
      return { name: 'ChordResolver.feed', same: ha === hb, ha, hb }
    }
    const r = hashPair(name)
    assert.ok(r.present, name + ' missing in one of the files')
    return { name, same: r.a === r.b, ha: r.a, hb: r.b }
  })
  const drifted = report.filter((r) => !r.same).map((r) => r.name + ' (' + r.ha + ' vs ' + r.hb + ')')
  assert.deepEqual(drifted, [], 'dual-source drift detected in: ' + drifted.join(', ') + ' — 修改必须同步 core.js 与 client.js 两处')
})

// --- VERSION single-source guard (audit B1) --------------------------------------
// VERSION lives in three places (package.json / src/core.js / src/client.js
// classic-script literal). Extract each and assert they are identical.

function extractVersion(src) {
  const m = src.match(/"version":\s*"([^"]+)"/) // package.json
  if (m) return m[1]
  const c = src.match(/VERSION = '([^']+)'/) // core.js export / client.js const
  return c ? c[1] : null
}

test('VERSION is identical across package.json / core.js / client.js', () => {
  const versions = {
    'package.json': extractVersion(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')),
    'src/core.js': extractVersion(fs.readFileSync(path.join(ROOT, 'src', 'core.js'), 'utf8')),
    'src/client.js': extractVersion(fs.readFileSync(path.join(ROOT, 'src', 'client.js'), 'utf8')),
  }
  const missing = Object.entries(versions).filter(([, v]) => !v).map(([k]) => k)
  assert.deepEqual(missing, [], 'version string not found in: ' + missing.join(', '))
  const uniq = [...new Set(Object.values(versions))]
  assert.equal(uniq.length, 1, 'VERSION drift detected: ' + JSON.stringify(versions) + ' — 三处必须同步 bump')
})
